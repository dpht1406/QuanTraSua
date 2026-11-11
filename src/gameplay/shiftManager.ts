import type * as THREE from 'three';
import type { Interactable } from '../interaction/interactionSystem.ts';
import { SHIFT_END_HOUR, SHIFT_START_HOUR } from '../state/constants.ts';
import { gameStore } from '../state/gameState.ts';
import {
  applyWageDeduction,
  buildShiftSummary,
  createEmptyShiftStats,
  formatGameTime,
  realElapsedToGameMinutes,
  transitionShift,
  type ShiftSummary,
} from '../state/shift.ts';
import type { ShopStations } from '../world/shopWorld.ts';
import type { OrderManager } from './orderManager.ts';

export interface ShiftManager {
  interactables: Interactable[];
  update(dt: number): void;
  getGameMinutes(): number;
  confirmEarlyClose(accepted: boolean): void;
  isConfirmingClose(): boolean;
  syncTarget(currentTarget: THREE.Object3D | null): void;
  nextDay(): void;
}

// Quản lý vòng đời ca làm việc (08:00-22:00), đóng/mở cửa, thống kê và tổng kết ca
export function createShiftManager(
  stations: ShopStations,
  orderManager: OrderManager,
  getStaffWages: () => number,
  onConfirmCloseChange: (active: boolean) => void,
  onOpenRestock: () => void,
  onOpenStaff: () => void,
  onShowSummary: (summary: ShiftSummary, day: number) => void,
  onClearHeldCup: () => void,
): ShiftManager {
  let realElapsedSec = 0;
  let currentMinutes = SHIFT_START_HOUR * 60;
  let confirmingClose = false;

  const toast = (message: string) => gameStore.bus.emit('toast:show', { message });

  const setConfirmClose = (active: boolean) => {
    if (confirmingClose === active) return;
    confirmingClose = active;
    onConfirmCloseChange(active);
  };

  // Thống kê doanh thu, đơn hàng và chi phí qua EventBus
  gameStore.bus.on('orderServed', ({ score, payout }) => {
    const prev = gameStore.getState();
    const s = prev.shiftStats;
    gameStore.updateState({
      shiftStats: {
        ...s,
        revenue: s.revenue + payout,
        servedCount: s.servedCount + 1,
        totalStars: s.totalStars + score.stars,
      },
    });
  });

  gameStore.bus.on('orderFailed', () => {
    const prev = gameStore.getState();
    const s = prev.shiftStats;
    gameStore.updateState({
      shiftStats: { ...s, failedCount: s.failedCount + 1 },
    });
  });

  gameStore.bus.on('stockChanged', ({ spentCost }) => {
    if (spentCost <= 0) return;
    const prev = gameStore.getState();
    if (prev.shiftState !== 'open' && prev.shiftState !== 'closing') return;
    const s = prev.shiftStats;
    gameStore.updateState({
      shiftStats: { ...s, ingredientCost: s.ingredientCost + spentCost },
    });
  });

  const completeShift = () => {
    const prev = gameStore.getState();
    const nextState = transitionShift(prev.shiftState, 'summary');
    const staffWages = getStaffWages();
    const nextMoney = applyWageDeduction(prev.money, staffWages);
    const statsWithWages = { ...prev.shiftStats, staffWages };
    const summary = buildShiftSummary(statsWithWages);
    onClearHeldCup();
    gameStore.updateState({ shiftState: nextState, money: nextMoney, shiftStats: statsWithWages });
    gameStore.bus.emit('shiftClosed', { summary });
    onShowSummary(summary, prev.day);
  };

  const beginClosing = (reasonToast: string) => {
    const prev = gameStore.getState();
    if (prev.shiftState !== 'open') return;
    setConfirmClose(false);
    orderManager.setSpawning(false);
    const nextState = transitionShift(prev.shiftState, 'closing');
    gameStore.updateState({ shiftState: nextState });
    toast(reasonToast);
    if (!orderManager.hasActiveCustomer()) {
      completeShift();
    }
  };

  const openShift = () => {
    const prev = gameStore.getState();
    const nextState = transitionShift(prev.shiftState, 'open');
    realElapsedSec = 0;
    currentMinutes = SHIFT_START_HOUR * 60;
    gameStore.updateState({
      shiftState: nextState,
      time: formatGameTime(currentMinutes),
      shiftStats: createEmptyShiftStats(),
    });
    orderManager.resetForShift();
    orderManager.setSpawning(true);
    gameStore.bus.emit('shiftOpened', { day: prev.day });
    toast(`Mở ca Ngày ${prev.day}! Chúc bạn bán đắt hàng!`);
  };

  const interactables: Interactable[] = [
    {
      target: stations.door,
      label: () => {
        const s = gameStore.getState().shiftState;
        if (s === 'closed') return 'Mở ca';
        if (s === 'open') return 'Kết ca sớm';
        return 'Đang kết ca...';
      },
      onInteract() {
        const s = gameStore.getState().shiftState;
        if (s === 'closed') {
          openShift();
        } else if (s === 'open') {
          setConfirmClose(true);
        } else if (s === 'closing') {
          toast('Đang chờ phục vụ nốt khách cuối!');
        }
      },
    },
    {
      target: stations.restockPc,
      label: () =>
        gameStore.getState().shiftState === 'closed'
          ? 'Mở máy tính nhập hàng'
          : 'Máy tính nhập hàng (chỉ dùng khi đóng cửa)',
      onInteract() {
        if (gameStore.getState().shiftState !== 'closed') {
          toast('Đóng cửa mới nhập hàng được');
          return;
        }
        onOpenRestock();
      },
    },
    {
      target: stations.staffBoard,
      label: () =>
        gameStore.getState().shiftState === 'closed'
          ? 'Bảng nhân viên (Thuê / Sa thải)'
          : 'Bảng nhân viên (chỉ mở khi đóng cửa)',
      onInteract() {
        if (gameStore.getState().shiftState !== 'closed') {
          toast('Đóng cửa mới quản lý nhân viên được');
          return;
        }
        onOpenStaff();
      },
    },
  ];

  return {
    interactables,

    getGameMinutes() {
      return currentMinutes;
    },

    confirmEarlyClose(accepted) {
      if (!confirmingClose) return;
      if (accepted) {
        beginClosing('Đã chốt kết ca sớm!');
      } else {
        setConfirmClose(false);
        toast('Đã hủy kết ca, tiếp tục bán!');
      }
    },

    isConfirmingClose() {
      return confirmingClose;
    },

    syncTarget(currentTarget) {
      if (confirmingClose && currentTarget !== stations.door) {
        setConfirmClose(false);
      }
    },

    update(dt) {
      const state = gameStore.getState();
      if (state.shiftState === 'open') {
        realElapsedSec += dt;
        const nextMinutes = realElapsedToGameMinutes(realElapsedSec);
        if (nextMinutes !== currentMinutes) {
          currentMinutes = nextMinutes;
          gameStore.updateState({ time: formatGameTime(currentMinutes) });
        }
        if (currentMinutes >= SHIFT_END_HOUR * 60) {
          beginClosing('Đã đến 22:00! Phục vụ nốt khách cuối để tổng kết.');
        }
      } else if (state.shiftState === 'closing' && !orderManager.hasActiveCustomer()) {
        completeShift();
      }
    },

    nextDay() {
      const prev = gameStore.getState();
      const nextState = transitionShift(prev.shiftState, 'closed');
      realElapsedSec = 0;
      currentMinutes = SHIFT_START_HOUR * 60;
      orderManager.resetForShift();
      gameStore.updateState({
        day: prev.day + 1,
        time: formatGameTime(currentMinutes),
        shiftState: nextState,
        shiftStats: createEmptyShiftStats(),
      });
    },
  };
}
