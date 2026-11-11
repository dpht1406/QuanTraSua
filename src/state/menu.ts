import { DRINK_PRICES, TOPPING_PRICE } from './constants.ts';

export type DrinkBase = 'traditional' | 'peach' | 'matcha';
export type LevelPercent = 0 | 50 | 100;
export type ToppingType = 'none' | 'pearl' | 'jelly';

export interface DrinkOrder {
  base: DrinkBase;
  sugar: LevelPercent;
  ice: LevelPercent;
  topping: ToppingType;
}

export const DRINK_BASE_LIST: readonly DrinkBase[] = ['traditional', 'peach', 'matcha'];
export const LEVEL_PERCENT_LIST: readonly LevelPercent[] = [0, 50, 100];
export const TOPPING_LIST: readonly ToppingType[] = ['none', 'pearl', 'jelly'];

export const DRINK_LABELS: Record<DrinkBase, string> = {
  traditional: 'Trà sữa truyền thống',
  peach: 'Trà đào',
  matcha: 'Matcha latte',
};

export const TOPPING_LABELS: Record<ToppingType, string> = {
  none: 'Không topping',
  pearl: 'Trân châu',
  jelly: 'Thạch',
};

export const DRINK_COLORS: Record<DrinkBase, string> = {
  traditional: '#c88e64',
  peach: '#f7ae7c',
  matcha: '#98c99d',
};

// Chọn ngẫu nhiên một phần tử trong danh sách
function pickRandom<T>(items: readonly T[], rng: () => number): T {
  const idx = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[idx];
}

// Tạo đơn hàng ngẫu nhiên gồm món, đường, đá và topping
export function generateOrder(rng: () => number = Math.random): DrinkOrder {
  return {
    base: pickRandom(DRINK_BASE_LIST, rng),
    sugar: pickRandom(LEVEL_PERCENT_LIST, rng),
    ice: pickRandom(LEVEL_PERCENT_LIST, rng),
    topping: pickRandom(TOPPING_LIST, rng),
  };
}

// Tính tổng giá bán của đơn (giá món + 5.000đ nếu có topping)
export function getOrderPrice(order: DrinkOrder): number {
  const basePrice = DRINK_PRICES[order.base];
  const toppingExtra = order.topping === 'none' ? 0 : TOPPING_PRICE;
  return basePrice + toppingExtra;
}
