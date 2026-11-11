import { ORDER_PATIENCE_SEC } from '../state/constants.ts';
import type { EventBus } from '../state/eventBus.ts';
import { gameStore, type GameEvents } from '../state/gameState.ts';
import { generateOrder, type DrinkOrder } from '../state/menu.ts';
import { scoreDrink, type Cup, type ScoreResult } from '../state/scoring.ts';
import { getCustomerGapRange } from '../state/shift.ts';
import type { CustomerActor, Waypoint } from '../world/customer.ts';

export interface ActiveOrderView {
  order: DrinkOrder;
  remainingSec: number;
  ratio: number;
  lockedByStaff?: string;
}

export interface OrderManager {
  update(dt: number): void;
  deliverCup(cup: Cup): boolean;
  deliverStaffCup(cup: Cup): boolean;
  getActiveOrder(): { order: DrinkOrder; elapsedSec: number } | null;
  isOrderLocked(): boolean;
  lockOrder(staffName: string): boolean;
  setSpawning(enabled: boolean): void;
  resetForShift(): void;
  hasActiveCustomer(): boolean;
}

type CustomerPhase = 'cooldown' | 'walking_in' | 'waiting' | 'walking_out';

const ENTER_WAYPOINTS: readonly Waypoint[] = [
  { x: 0, z: 3.65 },
  { x: -0.25, z: 1.6 },
  { x: -0.25, z: -0.45 },
];

const EXIT_WAYPOINTS: readonly Waypoint[] = [
  { x: -0.25, z: 1.6 },
  { x: 0, z: 3.65 },
];

// Quản lý vòng đời khách hàng, đơn hàng theo giờ cao điểm và trả kết quả phục vụ
export function createOrderManager(
  customer: CustomerActor,
  bus: EventBus<GameEvents>,
  getGameMinutes: () => number,
  onOrderChange: (view: ActiveOrderView | null) => void,
  onOrderResult: (text: string, isPositive: boolean) => void,
): OrderManager {
  let phase: CustomerPhase = 'cooldown';
  let spawning = false;
  let cooldownSec = 1.0;
  let currentOrder: DrinkOrder | null = null;
  let elapsedSec = 0;
  let lockedByStaff: string | undefined;

  const startCooldown = () => {
    phase = 'cooldown';
    const gap = getCustomerGapRange(getGameMinutes());
    cooldownSec = gap.minSec + Math.random() * (gap.maxSec - gap.minSec);
  };

  const spawnNextCustomer = () => {
    phase = 'walking_in';
    customer.spawnAt(ENTER_WAYPOINTS, () => {
      phase = 'waiting';
      currentOrder = generateOrder();
      elapsedSec = 0;
      lockedByStaff = undefined;
      onOrderChange({ order: currentOrder, remainingSec: ORDER_PATIENCE_SEC, ratio: 1 });
    });
  };

  const formatResult = (score: ScoreResult): { text: string; positive: boolean } => {
    if (score.payout <= 0) {
      return { text: 'Sai món! +0đ · 1 sao', positive: false };
    }
    const formatted = new Intl.NumberFormat('vi-VN').format(score.payout);
    return { text: `+${formatted}đ · ${score.stars} sao`, positive: true };
  };

  const finishDelivery = (cup: Cup): boolean => {
    if (phase !== 'waiting' || !currentOrder) return false;
    const score = scoreDrink(currentOrder, cup, elapsedSec, ORDER_PATIENCE_SEC);
    if (score.payout > 0) {
      const prev = gameStore.getState();
      gameStore.updateState({ money: prev.money + score.payout });
    }
    bus.emit('orderServed', { score, elapsed: elapsedSec, payout: score.payout });
    const res = formatResult(score);
    onOrderResult(res.text, res.positive);
    currentOrder = null;
    lockedByStaff = undefined;
    onOrderChange(null);
    phase = 'walking_out';
    customer.leaveAlong(EXIT_WAYPOINTS, startCooldown);
    return true;
  };

  return {
    setSpawning(enabled) {
      spawning = enabled;
    },

    resetForShift() {
      phase = 'cooldown';
      cooldownSec = 1.0;
      currentOrder = null;
      elapsedSec = 0;
      lockedByStaff = undefined;
      customer.hide();
      onOrderChange(null);
    },

    hasActiveCustomer() {
      return phase !== 'cooldown';
    },

    getActiveOrder() {
      if (phase !== 'waiting' || !currentOrder) return null;
      return { order: currentOrder, elapsedSec };
    },

    isOrderLocked() {
      return lockedByStaff !== undefined;
    },

    lockOrder(staffName) {
      if (phase !== 'waiting' || !currentOrder || lockedByStaff) return false;
      lockedByStaff = staffName;
      const remainingSec = Math.max(0, ORDER_PATIENCE_SEC - elapsedSec);
      onOrderChange({
        order: currentOrder,
        remainingSec,
        ratio: remainingSec / ORDER_PATIENCE_SEC,
        lockedByStaff,
      });
      return true;
    },

    update(dt) {
      customer.update(dt);

      if (phase === 'cooldown') {
        if (!spawning) return;
        cooldownSec -= dt;
        if (cooldownSec <= 0) {
          spawnNextCustomer();
        }
        return;
      }

      if (phase !== 'waiting' || !currentOrder) return;

      elapsedSec += dt;
      const remainingSec = Math.max(0, ORDER_PATIENCE_SEC - elapsedSec);
      const ratio = remainingSec / ORDER_PATIENCE_SEC;
      onOrderChange({ order: currentOrder, remainingSec, ratio, lockedByStaff });

      if (elapsedSec >= ORDER_PATIENCE_SEC) {
        currentOrder = null;
        lockedByStaff = undefined;
        onOrderChange(null);
        phase = 'walking_out';
        bus.emit('orderFailed', { reason: 'Hết thời gian chờ' });
        onOrderResult('Khách hết kiên nhẫn và bỏ đi!', false);
        customer.leaveAlong(EXIT_WAYPOINTS, startCooldown);
      }
    },

    deliverCup(cup) {
      if (phase !== 'waiting' || !currentOrder) {
        bus.emit('toast:show', { message: 'Hiện chưa có khách chờ đơn ở quầy!' });
        return false;
      }
      if (lockedByStaff) {
        bus.emit('toast:show', { message: `${lockedByStaff} đang pha đơn này rồi!` });
        return false;
      }
      return finishDelivery(cup);
    },

    deliverStaffCup(cup) {
      return finishDelivery(cup);
    },
  };
}
