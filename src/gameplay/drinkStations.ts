import type * as THREE from 'three';
import type { Interactable } from '../interaction/interactionSystem.ts';
import type { CleanlinessStore } from '../state/cleanliness.ts';
import { INVENTORY_CONFIG, TRASH_FULL_CUPS } from '../state/constants.ts';
import type { EventBus } from '../state/eventBus.ts';
import { gameStore, type GameEvents } from '../state/gameState.ts';
import {
  findCupHand,
  getHeld,
  isFull,
  pickUp,
  removeFrom,
  type HandId,
} from '../state/hands.ts';
import type { createInventoryStore, InventoryItem } from '../state/inventory.ts';
import {
  applyCupStep,
  createEmptyCup,
  type Cup,
  type CupStep,
  type CupStepValue,
} from '../state/scoring.ts';
import type { ShiftState } from '../state/shift.ts';
import type { HeldCupView } from '../ui/heldCup.ts';
import type { LevelPickerView } from '../ui/levelPicker.ts';
import type { ShopStations } from '../world/shopWorld.ts';
import type { OrderManager } from './orderManager.ts';
import { discardCupInBin, initCupDisposal } from './cupDisposal.ts';
import { MAKING_STATION_SPECS } from './stationLookup.ts';

interface PickerSession {
  stationTarget: THREE.Object3D;
  onPick(digit: 1 | 2 | 3): void;
}

export interface DrinkStationController {
  interactables: Interactable[];
  pickDigit(digit: 1 | 2 | 3): void;
  syncTarget(currentTarget: THREE.Object3D | null): void;
  closePicker(): void;
  clearHeldCup(): void;
  hasHeldCup(): boolean;
}

// Gắn logic pha chế 7 bước, sửa trừ nguyên liệu 1 lần/bước và kết nối thùng rác đầy
export function createDrinkStations(
  stations: ShopStations,
  orderManager: OrderManager,
  inventory: ReturnType<typeof createInventoryStore>,
  cleanliness: CleanlinessStore,
  onTrashChanged: () => void,
  getShiftState: () => ShiftState,
  bus: EventBus<GameEvents>,
  heldCupUi: HeldCupView,
  levelPickerUi: LevelPickerView,
  getBlockReason?: (isMakingStation: boolean) => string | null,
): DrinkStationController {
  let activePicker: PickerSession | null = null;

  const toast = (message: string) => bus.emit('toast:show', { message });
  initCupDisposal({ cleanliness, onTrashChanged, notify: toast });
  const getHands = () => gameStore.getState().hands;
  const notifyHandsChanged = () => gameStore.updateState({ hands: getHands() });
  const getHeldCup = (): { hand: HandId; cup: Cup } | null => {
    const hands = getHands();
    const hand = findCupHand(hands);
    if (!hand) return null;
    const item = getHeld(hands, hand);
    return item?.kind === 'cup' ? { hand, cup: item.cup } : null;
  };
  const syncCupUi = () => heldCupUi.render(getHeldCup()?.cup ?? null);
  const makingLabel = (label: string) => getBlockReason?.(true) ?? label;
  const getCount = (item: InventoryItem) => inventory.getCount(item);

  const closePicker = () => {
    if (!activePicker) return;
    activePicker = null;
    levelPickerUi.hide();
  };

  const openPicker = (
    stationTarget: THREE.Object3D,
    title: string,
    options: [string, string, string],
    onPick: (digit: 1 | 2 | 3) => void,
  ) => {
    activePicker = { stationTarget, onPick };
    levelPickerUi.show(title, options);
  };

  const requireActiveShift = (isMakingStation = true): boolean => {
    const blocked = getBlockReason?.(isMakingStation);
    if (blocked) {
      toast(blocked);
      return false;
    }
    const s = getShiftState();
    if (s === 'open' || s === 'closing') return true;
    toast('Quán đang đóng cửa! Ra cửa bấm E để mở ca.');
    return false;
  };

  const tryConsume = (item: InventoryItem): boolean => {
    if (inventory.consume(item)) return true;
    toast(`Hết ${INVENTORY_CONFIG[item].label}, cần nhập thêm`);
    return false;
  };

  const requireUnsealedCup = (): Cup | null => {
    if (!requireActiveShift(true)) return null;
    const held = getHeldCup();
    if (!held) {
      toast('Hãy lấy ly ở kệ ly trước!');
      return null;
    }
    if (held.cup.sealed) {
      toast('Ly đã đậy nắp, không thể thêm nguyên liệu!');
      return null;
    }
    return held.cup;
  };

  const pickStep = <K extends CupStep>(cup: Cup, step: K, val: CupStepValue[K], msg: string) => {
    const res = applyCupStep(cup, step, val, (item) => inventory.consume(item));
    if (!res.ok && res.missingItem) {
      toast(`Hết ${INVENTORY_CONFIG[res.missingItem].label}, cần nhập thêm`);
      return;
    }
    notifyHandsChanged();
    syncCupUi();
    toast(msg);
  };

  const makingInteractables: Interactable[] = MAKING_STATION_SPECS.map((spec) => {
    const target = stations[spec.id];
    return {
      target,
      label: () => makingLabel(spec.label(getCount)),
      onInteract() {
        const cup = requireUnsealedCup();
        if (!cup) return;
        openPicker(target, spec.title, spec.options(getCount), (digit) => {
          // Kiểm tra lại ly vẫn còn trên tay (tránh trường hợp đã ném/đổ trong lúc mở bảng chọn)
          const current = requireUnsealedCup();
          if (!current || current !== cup) return;
          const picked = spec.resolveDigit(digit);
          pickStep(current, spec.cupStep, picked.value, picked.message);
        });
      },
    };
  });

  const interactables: Interactable[] = [
    {
      target: stations.cupRack,
      label: () => {
        const blocked = getBlockReason?.(true);
        if (blocked) return blocked;
        if (orderManager.isOrderLocked()) return 'Kệ ly (nhân viên đang pha đơn)';
        const hands = getHands();
        if (isFull(hands)) return 'Kệ ly (tay đầy)';
        if (findCupHand(hands) !== null) return 'Kệ ly (đang cầm ly)';
        return `Lấy ly (còn ${inventory.getCount('cup')})`;
      },
      onInteract() {
        if (!requireActiveShift(true)) return;
        if (orderManager.isOrderLocked()) {
          toast('Nhân viên đang pha đơn hiện tại rồi!');
          return;
        }
        const hands = getHands();
        if (isFull(hands)) {
          toast('Tay đầy');
          return;
        }
        if (findCupHand(hands) !== null) {
          toast('Chỉ cầm được một ly');
          return;
        }
        if (!tryConsume('cup')) return;
        const res = pickUp(hands, { kind: 'cup', cup: createEmptyCup() });
        if (!res.ok) {
          toast(res.reason === 'full' ? 'Tay đầy' : 'Chỉ cầm được một ly');
          return;
        }
        notifyHandsChanged();
        syncCupUi();
        toast('Đã lấy ly! Chọn trà, đá, đường, topping rồi ép nắp.');
      },
    },
    ...makingInteractables,
    {
      target: stations.sealer,
      label: () => {
        const blocked = getBlockReason?.(true);
        if (blocked) return blocked;
        const cup = getHeldCup()?.cup ?? null;
        if (!cup || !cup.base) return 'Máy ép ly (cần trà nền)';
        return cup.sealed ? 'Máy ép ly (đã đậy nắp)' : `Đậy nắp ly (còn ${inventory.getCount('lid')})`;
      },
      onInteract() {
        if (!requireActiveShift(true)) return;
        const cup = getHeldCup()?.cup ?? null;
        if (!cup) return toast('Hãy lấy ly trước!');
        if (!cup.base) return toast('Cần chọn trà nền trước khi đậy nắp!');
        if (cup.sealed) return toast('Ly này đã được đậy nắp rồi!');
        if (!tryConsume('lid')) return;
        cup.sealed = true;
        notifyHandsChanged();
        syncCupUi();
        toast('Đã đậy nắp ly! Mang ra quầy giao cho khách.');
      },
    },
    {
      target: stations.counter,
      label: () => {
        if (orderManager.isOrderLocked()) return 'Quầy giao đồ (nhân viên đang pha)';
        const cup = getHeldCup()?.cup ?? null;
        if (!cup) return 'Quầy giao đồ (chưa cầm ly)';
        return cup.sealed ? 'Giao ly cho khách' : 'Quầy giao đồ (cần đậy nắp)';
      },
      onInteract() {
        if (!requireActiveShift(false)) return;
        const held = getHeldCup();
        if (!held) return toast('Bạn chưa cầm ly nào!');
        if (!held.cup.sealed) return toast('Ly chưa đậy nắp! Hãy qua máy ép ly trước.');
        if (orderManager.deliverCup(held.cup)) {
          removeFrom(getHands(), held.hand);
          notifyHandsChanged();
          closePicker();
          syncCupUi();
        }
      },
    },
    {
      target: stations.trashCan,
      label: () => {
        if (cleanliness.isTrashFull()) return 'Đổ thùng rác đầy';
        return getHeldCup() ? 'Bỏ ly đang cầm' : `Thùng rác (${cleanliness.getTrashCups()}/${TRASH_FULL_CUPS})`;
      },
      onInteract() {
        const blocked = getBlockReason?.(false);
        if (blocked) return toast(blocked);
        if (cleanliness.isTrashFull()) {
          cleanliness.emptyTrash();
          onTrashChanged();
          toast('Đã đổ thùng rác sạch sẽ!');
          return;
        }
        const held = getHeldCup();
        if (!held) return toast('Bạn đang tay không!');
        removeFrom(getHands(), held.hand);
        notifyHandsChanged();
        closePicker();
        syncCupUi();
        discardCupInBin(held.cup);
      },
    },
  ];

  syncCupUi();

  return {
    interactables,
    pickDigit(digit) {
      if (!activePicker) return;
      const handler = activePicker.onPick;
      closePicker();
      handler(digit);
    },
    syncTarget(currentTarget) {
      if (activePicker && currentTarget !== activePicker.stationTarget) closePicker();
    },
    closePicker,
    clearHeldCup() {
      const hands = getHands();
      const hand = findCupHand(hands);
      if (hand) {
        removeFrom(hands, hand);
        notifyHandsChanged();
      }
      closePicker();
      syncCupUi();
    },
    hasHeldCup: () => findCupHand(getHands()) !== null,
  };
}
