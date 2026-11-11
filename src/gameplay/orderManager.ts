import {
  NEXT_CUSTOMER_MAX_SEC,
  NEXT_CUSTOMER_MIN_SEC,
  ORDER_PATIENCE_SEC,
} from '../state/constants.ts';
import type { EventBus } from '../state/eventBus.ts';
import type { GameEvents } from '../state/gameState.ts';
import { gameStore } from '../state/gameState.ts';
import { generateOrder, type DrinkOrder } from '../state/menu.ts';
import { scoreDrink, type Cup, type ScoreResult } from '../state/scoring.ts';
import type { CustomerActor, Waypoint } from '../world/customer.ts';

export interface ActiveOrderView {
  order: DrinkOrder;
  remainingSec: number;
  ratio: number;
}

export interface OrderManager {
  update(dt: number): void;
  deliverCup(cup: Cup): boolean;
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

// Quản lý vòng đời khách hàng, đơn hàng hiện tại, đồng hồ chờ và trả kết quả phục vụ
export function createOrderManager(
  customer: CustomerActor,
  bus: EventBus<GameEvents>,
  onOrderChange: (view: ActiveOrderView | null) => void,
  onOrderResult: (text: string, isPositive: boolean) => void,
): OrderManager {
  let phase: CustomerPhase = 'cooldown';
  let cooldownSec = 1.2;
  let currentOrder: DrinkOrder | null = null;
  let elapsedSec = 0;

  const startCooldown = () => {
    phase = 'cooldown';
    cooldownSec =
      NEXT_CUSTOMER_MIN_SEC +
      Math.random() * (NEXT_CUSTOMER_MAX_SEC - NEXT_CUSTOMER_MIN_SEC);
  };

  const spawnNextCustomer = () => {
    phase = 'walking_in';
    customer.spawnAt(ENTER_WAYPOINTS, () => {
      phase = 'waiting';
      currentOrder = generateOrder();
      elapsedSec = 0;
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

  return {
    update(dt) {
      customer.update(dt);

      if (phase === 'cooldown') {
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
      onOrderChange({ order: currentOrder, remainingSec, ratio });

      if (elapsedSec >= ORDER_PATIENCE_SEC) {
        currentOrder = null;
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

      const score = scoreDrink(currentOrder, cup, elapsedSec, ORDER_PATIENCE_SEC);
      if (score.payout > 0) {
        const prev = gameStore.getState();
        gameStore.updateState({ money: prev.money + score.payout });
      }

      bus.emit('orderServed', {
        score,
        elapsed: elapsedSec,
        payout: score.payout,
      });

      const res = formatResult(score);
      onOrderResult(res.text, res.positive);

      currentOrder = null;
      onOrderChange(null);
      phase = 'walking_out';
      customer.leaveAlong(EXIT_WAYPOINTS, startCooldown);
      return true;
    },
  };
}
