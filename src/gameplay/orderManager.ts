import {
  GREET_WINDOW_SEC,
  ORDER_PATIENCE_SEC,
  PICKY_PATIENCE_MULTIPLIER,
} from '../state/constants.ts';
import type { EventBus } from '../state/eventBus.ts';
import { gameStore, type GameEvents } from '../state/gameState.ts';
import { generateOrder, type DrinkOrder } from '../state/menu.ts';
import { scoreDrink, type Cup, type ScoreResult } from '../state/scoring.ts';
import { getCustomerGapMultiplier, getCustomerGapRange } from '../state/shift.ts';
import type { CustomerActor, Waypoint } from '../world/customer.ts';

export interface ActiveOrderView {
  order: DrinkOrder;
  remainingSec: number;
  ratio: number;
  lockedByStaff?: string;
  isPicky?: boolean;
}

export interface OrderManagerHooks {
  getCooldownSpeed?: () => number;
  consumePicky?: () => boolean;
  onPickyFinished?: () => void;
  onGreetWindow?: (remainingSec: number | null) => void;
  onGreetSuccess?: () => void;
  onOrderDelivered?: (order: DrinkOrder, score: ScoreResult, payout: number) => void;
}

export interface OrderManager {
  update(dt: number): void;
  deliverCup(cup: Cup): boolean;
  deliverStaffCup(cup: Cup): boolean;
  getActiveOrder(): {
    order: DrinkOrder;
    elapsedSec: number;
    remainingSec: number;
    isPicky: boolean;
  } | null;
  isOrderLocked(): boolean;
  lockOrder(staffName: string): boolean;
  tryGreet(): boolean;
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

// Quản lý vòng đời khách hàng, đơn hàng theo giờ cao điểm/uy tín và chào khách
export function createOrderManager(
  customer: CustomerActor,
  bus: EventBus<GameEvents>,
  getGameMinutes: () => number,
  onOrderChange: (view: ActiveOrderView | null) => void,
  onOrderResult: (text: string, isPositive: boolean) => void,
  hooks: OrderManagerHooks = {},
): OrderManager {
  let phase: CustomerPhase = 'cooldown';
  let spawning = false;
  let cooldownSec = 1.0;
  let currentOrder: DrinkOrder | null = null;
  let currentPatienceSec = ORDER_PATIENCE_SEC;
  let currentIsPicky = false;
  let greetedCurrent = false;
  let elapsedSec = 0;
  let lockedByStaff: string | undefined;

  const startCooldown = () => {
    phase = 'cooldown';
    const gap = getCustomerGapRange(getGameMinutes());
    const repMult = getCustomerGapMultiplier(gameStore.getState().reputation);
    cooldownSec = (gap.minSec + Math.random() * (gap.maxSec - gap.minSec)) * repMult;
  };

  const spawnNextCustomer = () => {
    phase = 'walking_in';
    currentIsPicky = hooks.consumePicky?.() ?? false;
    currentPatienceSec = currentIsPicky
      ? Math.round(ORDER_PATIENCE_SEC * PICKY_PATIENCE_MULTIPLIER)
      : ORDER_PATIENCE_SEC;
    customer.spawnAt(ENTER_WAYPOINTS, () => {
      phase = 'waiting';
      currentOrder = generateOrder();
      elapsedSec = 0;
      greetedCurrent = false;
      lockedByStaff = undefined;
      hooks.onGreetWindow?.(GREET_WINDOW_SEC);
      onOrderChange({
        order: currentOrder,
        remainingSec: currentPatienceSec,
        ratio: 1,
        isPicky: currentIsPicky,
      });
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
    const deliveredOrder = currentOrder;
    const wasPicky = currentIsPicky;
    const score = scoreDrink(deliveredOrder, cup, elapsedSec, currentPatienceSec);
    if (score.payout > 0) {
      const prev = gameStore.getState();
      gameStore.updateState({ money: prev.money + score.payout });
    }
    bus.emit('orderServed', { score, elapsed: elapsedSec, payout: score.payout });
    if (wasPicky) hooks.onPickyFinished?.();
    hooks.onOrderDelivered?.(deliveredOrder, score, score.payout);
    hooks.onGreetWindow?.(null);
    const res = formatResult(score);
    onOrderResult(res.text, res.positive);
    currentOrder = null;
    currentIsPicky = false;
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
      currentPatienceSec = ORDER_PATIENCE_SEC;
      currentIsPicky = false;
      greetedCurrent = false;
      elapsedSec = 0;
      lockedByStaff = undefined;
      hooks.onGreetWindow?.(null);
      customer.hide();
      onOrderChange(null);
    },

    hasActiveCustomer() {
      return phase !== 'cooldown';
    },

    getActiveOrder() {
      if (phase !== 'waiting' || !currentOrder) return null;
      return {
        order: currentOrder,
        elapsedSec,
        remainingSec: Math.max(0, currentPatienceSec - elapsedSec),
        isPicky: currentIsPicky,
      };
    },

    isOrderLocked() {
      return lockedByStaff !== undefined;
    },

    tryGreet() {
      if (
        phase !== 'waiting' ||
        !currentOrder ||
        greetedCurrent ||
        elapsedSec > GREET_WINDOW_SEC
      ) {
        return false;
      }
      greetedCurrent = true;
      hooks.onGreetWindow?.(null);
      hooks.onGreetSuccess?.();
      return true;
    },

    lockOrder(staffName) {
      if (phase !== 'waiting' || !currentOrder || lockedByStaff) return false;
      lockedByStaff = staffName;
      const remainingSec = Math.max(0, currentPatienceSec - elapsedSec);
      onOrderChange({
        order: currentOrder,
        remainingSec,
        ratio: remainingSec / currentPatienceSec,
        lockedByStaff,
        isPicky: currentIsPicky,
      });
      return true;
    },

    update(dt) {
      customer.update(dt);

      if (phase === 'cooldown') {
        if (!spawning) return;
        const speed = hooks.getCooldownSpeed?.() ?? 1;
        cooldownSec -= dt * speed;
        if (cooldownSec <= 0) {
          spawnNextCustomer();
        }
        return;
      }

      if (phase !== 'waiting' || !currentOrder) return;

      elapsedSec += dt;
      const greetLeft =
        !greetedCurrent && elapsedSec <= GREET_WINDOW_SEC ? GREET_WINDOW_SEC - elapsedSec : null;
      hooks.onGreetWindow?.(greetLeft);

      const remainingSec = Math.max(0, currentPatienceSec - elapsedSec);
      const ratio = remainingSec / currentPatienceSec;
      onOrderChange({
        order: currentOrder,
        remainingSec,
        ratio,
        lockedByStaff,
        isPicky: currentIsPicky,
      });

      if (elapsedSec >= currentPatienceSec) {
        const wasPicky = currentIsPicky;
        currentOrder = null;
        currentIsPicky = false;
        lockedByStaff = undefined;
        hooks.onGreetWindow?.(null);
        onOrderChange(null);
        phase = 'walking_out';
        bus.emit('orderFailed', { reason: 'Hết thời gian chờ' });
        if (wasPicky) hooks.onPickyFinished?.();
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
