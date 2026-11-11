import { INVENTORY_CONFIG } from './constants.ts';

export type InventoryItem = keyof typeof INVENTORY_CONFIG;
export type InventoryStock = Record<InventoryItem, number>;

export const INVENTORY_ITEMS = Object.keys(INVENTORY_CONFIG) as InventoryItem[];

// Tạo tồn kho mặc định ban đầu từ hằng số cấu hình
export function createInitialStock(): InventoryStock {
  const stock = {} as InventoryStock;
  for (const item of INVENTORY_ITEMS) {
    stock[item] = INVENTORY_CONFIG[item].initial;
  }
  return stock;
}

// Tính chi phí nhập theo số gói của một mặt hàng
export function costOf(item: InventoryItem, packs = 1): number {
  if (packs <= 0) return 0;
  return INVENTORY_CONFIG[item].packCost * packs;
}

// Tính giá vốn cho 1 đơn vị tiêu hao của mặt hàng
export function unitCostOf(item: InventoryItem): number {
  const cfg = INVENTORY_CONFIG[item];
  return cfg.packCost / cfg.packSize;
}

// Tạo store quản lý kho nguyên liệu (kiểm tra, trừ kho, nhập kho)
export function createInventoryStore(
  initial: InventoryStock = createInitialStock(),
  onChanged?: (stock: InventoryStock, spentCost: number) => void,
) {
  const stock: InventoryStock = { ...initial };

  return {
    getStock(): InventoryStock {
      return { ...stock };
    },

    getCount(item: InventoryItem): number {
      return stock[item];
    },

    canConsume(item: InventoryItem, qty = 1): boolean {
      return qty >= 0 && stock[item] >= qty;
    },

    consume(item: InventoryItem, qty = 1): boolean {
      if (qty <= 0) return true;
      if (stock[item] < qty) return false;
      stock[item] -= qty;
      onChanged?.({ ...stock }, unitCostOf(item) * qty);
      return true;
    },

    restock(item: InventoryItem, packs: number): number {
      if (packs <= 0) return 0;
      const added = INVENTORY_CONFIG[item].packSize * packs;
      stock[item] += added;
      onChanged?.({ ...stock }, 0);
      return added;
    },
  };
}
