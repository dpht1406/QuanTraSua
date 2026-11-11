import {
  MAX_TIME_PENALTY,
  PAYOUT_ROUND_STEP,
  SCORE_WEIGHTS,
  TIME_PENALTY_START_RATIO,
} from './constants.ts';
import {
  getOrderPrice,
  type DrinkBase,
  type DrinkOrder,
  type LevelPercent,
  type ToppingType,
} from './menu.ts';

export interface Cup {
  base: DrinkBase | null;
  sugar: LevelPercent | null;
  ice: LevelPercent | null;
  topping: ToppingType | null;
  sealed: boolean;
}

export interface ScoreResult {
  accuracy: number;
  timeFactor: number;
  total: number;
  stars: number;
  payout: number;
}

// Tạo một chiếc ly rỗng mới cho người chơi cầm
export function createEmptyCup(): Cup {
  return {
    base: null,
    sugar: null,
    ice: null,
    topping: null,
    sealed: false,
  };
}

// Quy đổi tổng điểm (0..100) sang số sao đánh giá 1..5
function toStars(total: number, hasCorrectBase: boolean): number {
  if (!hasCorrectBase || total < 30) return 1;
  if (total >= 90) return 5;
  if (total >= 75) return 4;
  if (total >= 55) return 3;
  return 2;
}

// Chấm điểm ly nước dựa trên độ đúng công thức và thời gian chờ của khách
export function scoreDrink(
  order: DrinkOrder,
  cup: Cup,
  elapsedSec: number,
  patienceSec: number,
): ScoreResult {
  if (patienceSec <= 0 || elapsedSec >= patienceSec) {
    return { accuracy: 0, timeFactor: 0, total: 0, stars: 1, payout: 0 };
  }

  const hasCorrectBase = cup.base === order.base;
  let accuracy = 0;
  if (hasCorrectBase) accuracy += SCORE_WEIGHTS.base;
  if (cup.sugar === order.sugar) accuracy += SCORE_WEIGHTS.sugar;
  if (cup.ice === order.ice) accuracy += SCORE_WEIGHTS.ice;
  if (cup.topping === order.topping) accuracy += SCORE_WEIGHTS.topping;

  const ratio = Math.max(0, elapsedSec / patienceSec);
  let timeFactor = 1;
  let timePenalty = 0;
  if (ratio > TIME_PENALTY_START_RATIO) {
    const lateRatio = Math.min(1, (ratio - TIME_PENALTY_START_RATIO) / (1 - TIME_PENALTY_START_RATIO));
    timeFactor = 1 - lateRatio;
    timePenalty = lateRatio * MAX_TIME_PENALTY;
  }

  const total = Math.max(0, Math.round(accuracy - timePenalty));
  const stars = toStars(total, hasCorrectBase);

  if (!hasCorrectBase) {
    return { accuracy, timeFactor, total, stars, payout: 0 };
  }

  const rawPayout = (getOrderPrice(order) * total) / 100;
  const payout = Math.round(rawPayout / PAYOUT_ROUND_STEP) * PAYOUT_ROUND_STEP;

  return { accuracy, timeFactor, total, stars, payout };
}
