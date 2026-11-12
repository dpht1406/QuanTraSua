import { GREET_WINDOW_SEC, ORDER_PATIENCE_SEC, PICKY_PATIENCE_MULTIPLIER } from '../state/constants.ts';
import type { EventBus } from '../state/eventBus.ts';
import { gameStore, type GameEventReason, type GameEvents } from '../state/gameState.ts';
import { generateOrder, type DrinkOrder } from '../state/menu.ts';
import { scoreDrink, type Cup } from '../state/scoring.ts';
import type { CustomerActor, Waypoint } from '../world/customer.ts';
import type { FallDir } from '../world/fallPose.ts';
import {
  computeCustomerCooldownSec,
  formatOrderResult,
  type ActiveOrderView,
  type CustomerPhase,
  type OrderManager,
  type OrderManagerHooks,
} from './orderHelpers.ts';

export type { ActiveOrderView, OrderManager, OrderManagerHooks };

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
  let complaintBonusProvider: ((cup: Cup) => number) | null = null;

  const clearActiveOrder = (): boolean => {
    const wasPicky = currentIsPicky;
    currentOrder = null;
    currentIsPicky = false;
    lockedByStaff = undefined;
    hooks.onGreetWindow?.(null);
    onOrderChange(null);
    phase = 'walking_out';
    return wasPicky;
  };

  const pushOrderView = () => {
    if (!currentOrder) return;
    const remainingSec = Math.max(0, currentPatienceSec - elapsedSec);
    onOrderChange({
      order: currentOrder,
      remainingSec,
      ratio: remainingSec / currentPatienceSec,
      lockedByStaff,
      isPicky: currentIsPicky,
    });
  };

  const startCooldown = () => {
    phase = 'cooldown';
    cooldownSec = computeCustomerCooldownSec(getGameMinutes(), gameStore.getState().reputation);
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
      pushOrderView();
    });
  };

  const failActiveOrder = (reason: GameEventReason, resultText: string, knockDown?: { hitDir?: FallDir }): boolean => {
    if (phase !== 'waiting' || !currentOrder) return false;
    const wasPicky = clearActiveOrder();
    bus.emit('orderFailed', { reason });
    if (wasPicky) hooks.onPickyFinished?.();
    onOrderResult(resultText, false);
    customer.leaveAlong(EXIT_WAYPOINTS, startCooldown, knockDown ? { fall: true, hitDir: knockDown.hitDir } : undefined);
    return true;
  };

  const finishDelivery = (cup: Cup): boolean => {
    if (phase !== 'waiting' || !currentOrder) return false;
    const deliveredOrder = currentOrder;
    const score = scoreDrink(deliveredOrder, cup, elapsedSec, currentPatienceSec);
    if (score.payout > 0) {
      const prev = gameStore.getState();
      gameStore.updateState({ money: prev.money + score.payout });
    }
    bus.emit('orderServed', { score, elapsed: elapsedSec, payout: score.payout });
    const complaintBonus = complaintBonusProvider ? complaintBonusProvider(cup) : 0;
    const wasPicky = clearActiveOrder();
    if (wasPicky) hooks.onPickyFinished?.();
    hooks.onOrderDelivered?.(deliveredOrder, score, score.payout, complaintBonus);
    const res = formatOrderResult(score);
    onOrderResult(res.text, res.positive);
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

    hasCustomerAtCounter() {
      return phase === 'waiting' && currentOrder !== null;
    },

    forceCustomerLeave(reason, hitDir) {
      if (phase === 'walking_in') {
        const wasPicky = clearActiveOrder();
        if (wasPicky) hooks.onPickyFinished?.();
        onOrderResult('Khách giận bỏ đi!', false);
        customer.leaveAlong([EXIT_WAYPOINTS[1]], startCooldown, { fall: true, hitDir });
        return true;
      }
      return failActiveOrder(reason, 'Khách bỏ đi!', { hitDir });
    },

    setComplaintBonusProvider(fn) {
      complaintBonusProvider = fn;
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
      if (phase !== 'waiting' || !currentOrder || greetedCurrent || elapsedSec > GREET_WINDOW_SEC) {
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
      pushOrderView();
      return true;
    },

    unlockOrder() {
      if (!lockedByStaff) return false;
      lockedByStaff = undefined;
      if (phase === 'waiting') pushOrderView();
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

      pushOrderView();

      if (elapsedSec >= currentPatienceSec) {
        failActiveOrder('Hết thời gian chờ', 'Khách hết kiên nhẫn và bỏ đi!');
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
