import { INVENTORY_CONFIG } from './constants.ts';

export type InventoryItem = keyof typeof INVENTORY_CONFIG;
export type InventoryStock = Record<InventoryItem, number>;
export type InventoryContamination = Record<InventoryItem, number>;

export const INVENTORY_ITEMS = Object.keys(INVENTORY_CONFIG) as InventoryItem[];

// Tạo tồn kho mặc định ban đầu từ hằng số cấu hình
export function createInitialStock(): InventoryStock {
  const stock = {} as InventoryStock;
  for (const item of INVENTORY_ITEMS) {
    stock[item] = INVENTORY_CONFIG[item].initial;
  }
  return stock;
}

// Kẹp độ nhiễm nguyên liệu trong khoảng 0..100
export function clampContamination(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

// Tạo bảng độ nhiễm 0..100 mặc định 0 cho mọi nguyên liệu
export function createInitialContamination(
  seed?: Partial<Record<InventoryItem, number>>,
): InventoryContamination {
  const out = {} as InventoryContamination;
  for (const item of INVENTORY_ITEMS) {
    const raw = seed?.[item];
    out[item] = raw === undefined ? 0 : clampContamination(raw);
  }
  return out;
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

// Tạo store quản lý kho nguyên liệu (kiểm tra, trừ kho, nhập kho và độ nhiễm)
export function createInventoryStore(
  initial: InventoryStock = createInitialStock(),
  onChanged?: (stock: InventoryStock, spentCost: number) => void,
  initialContamination?: Partial<Record<InventoryItem, number>>,
) {
  const stock: InventoryStock = { ...initial };
  const contamination: InventoryContamination = createInitialContamination(initialContamination);

  return {
    getStock(): InventoryStock {
      return { ...stock };
    },

    getCount(item: InventoryItem): number {
      return stock[item];
    },

    getContamination(): InventoryContamination {
      return { ...contamination };
    },

    getContaminationOf(item: InventoryItem): number {
      return contamination[item];
    },

    setContamination(item: InventoryItem, level: number): number {
      const next = clampContamination(level);
      contamination[item] = next;
      return next;
    },

    restoreContamination(next?: Partial<Record<InventoryItem, number>>): void {
      const clean = createInitialContamination(next);
      for (const item of INVENTORY_ITEMS) {
        contamination[item] = clean[item];
      }
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

    refund(item: InventoryItem, qty: number): number {
      if (qty <= 0 || !Number.isFinite(qty)) return 0;
      const next = Math.round((stock[item] + qty) * 100) / 100;
      const added = Math.max(0, Math.round((next - stock[item]) * 100) / 100);
      stock[item] = next;
      onChanged?.({ ...stock }, 0);
      return added;
    },

    spoil(item: InventoryItem, ratio: number): number {
      if (ratio <= 0 || !Number.isFinite(ratio) || stock[item] <= 0) return 0;
      const current = stock[item];
      const remaining = Math.floor(current * (1 - Math.min(1, ratio)));
      const lost = Math.round((current - remaining) * 100) / 100;
      if (lost <= 0) return 0;
      stock[item] = remaining;
      onChanged?.({ ...stock }, 0);
      return lost;
    },
  };
}

export type InventoryStore = ReturnType<typeof createInventoryStore>;

// Tính tổng tiền, nhập giỏ hàng và pha loãng độ nhiễm nguyên liệu theo tồn kho mới
export function purchaseRestockCart(
  inventory: InventoryStore,
  cart: Partial<Record<InventoryItem, number>>,
  money: number,
): {
  ok: boolean;
  message: string;
  stock?: InventoryStock;
  contamination?: InventoryContamination;
  money?: number;
} {
  let total = 0;
  for (const item of INVENTORY_ITEMS) {
    const packs = cart[item] ?? 0;
    if (packs > 0) total += costOf(item, packs);
  }
  if (total > money) {
    return { ok: false, message: 'Không đủ tiền để nhập đơn hàng này!' };
  }
  for (const item of INVENTORY_ITEMS) {
    const packs = cart[item] ?? 0;
    if (packs <= 0) continue;
    const oldStock = inventory.getCount(item);
    const oldContam = inventory.getContaminationOf(item);
    const added = inventory.restock(item, packs);
    if (added > 0 && oldContam > 0) {
      const nextContam = oldStock <= 0 ? 0 : (oldContam * oldStock) / (oldStock + added);
      inventory.setContamination(item, nextContam);
    }
  }
  return {
    ok: true,
    message: 'Đã nhập hàng thành công!',
    stock: inventory.getStock(),
    contamination: inventory.getContamination(),
    money: money - total,
  };
}
