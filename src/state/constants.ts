export const DRINK_PRICES = {
  traditional: 30000,
  peach: 35000,
  matcha: 40000,
} as const;

export const TOPPING_PRICE = 5000;

export const ORDER_PATIENCE_SEC = 60;
export const NEXT_CUSTOMER_MIN_SEC = 3;
export const NEXT_CUSTOMER_MAX_SEC = 5;

export const SCORE_WEIGHTS = {
  base: 40,
  sugar: 20,
  ice: 20,
  topping: 20,
} as const;

export const TIME_PENALTY_START_RATIO = 0.7;
export const MAX_TIME_PENALTY = 20;
export const PAYOUT_ROUND_STEP = 1000;
