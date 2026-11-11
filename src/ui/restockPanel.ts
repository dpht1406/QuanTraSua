import './contaminationHud.css';
import { INVENTORY_CONFIG } from '../state/constants.ts';
import { CONTAM_THRESHOLD } from '../state/constantsContam.ts';
import {
  costOf,
  INVENTORY_ITEMS,
  type InventoryContamination,
  type InventoryItem,
  type InventoryStock,
} from '../state/inventory.ts';

export interface RestockPanelView {
  open(stock: InventoryStock, money: number, contamination?: InventoryContamination): void;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

let contaminationProvider: (() => InventoryContamination) | null = null;

// Gắn nguồn đọc độ nhiễm hiện tại cho bảng nhập hàng
export function setRestockContaminationProvider(
  provider: (() => InventoryContamination) | null,
): void {
  contaminationProvider = provider;
}

const fmt = new Intl.NumberFormat('vi-VN');

// Tạo bảng nhập hàng bằng chuột khi cửa hàng đang đóng cửa
export function createRestockPanel(
  root: HTMLElement,
  onBuyCart: (cart: Partial<Record<InventoryItem, number>>) => {
    ok: boolean;
    message: string;
    stock?: InventoryStock;
    contamination?: InventoryContamination;
    money?: number;
  },
  onClose: () => void,
): RestockPanelView {
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay hidden';
  overlay.innerHTML = `
    <div class="panel-card restock-card">
      <div class="panel-head">
        <h2>Nhập hàng nguyên liệu</h2>
        <div class="panel-money" data-el="money"></div>
      </div>
      <div class="restock-list" data-el="list"></div>
      <div class="restock-msg" data-el="msg"></div>
      <div class="panel-foot">
        <div class="restock-total">Tổng tiền: <b data-el="total">0đ</b></div>
        <div class="panel-actions">
          <button type="button" class="btn-secondary" data-el="close">Đóng (Esc)</button>
          <button type="button" class="btn-primary" data-el="buy">Mua hàng</button>
        </div>
      </div>
    </div>
  `;
  root.appendChild(overlay);

  const moneyEl = overlay.querySelector<HTMLElement>('[data-el="money"]')!;
  const listEl = overlay.querySelector<HTMLElement>('[data-el="list"]')!;
  const msgEl = overlay.querySelector<HTMLElement>('[data-el="msg"]')!;
  const totalEl = overlay.querySelector<HTMLElement>('[data-el="total"]')!;
  const closeBtn = overlay.querySelector<HTMLButtonElement>('[data-el="close"]')!;
  const buyBtn = overlay.querySelector<HTMLButtonElement>('[data-el="buy"]')!;

  let currentStock: InventoryStock | null = null;
  let currentContam: InventoryContamination | null = null;
  let currentMoney = 0;
  let cart: Partial<Record<InventoryItem, number>> = {};

  const calcTotal = (): number => {
    let sum = 0;
    for (const item of INVENTORY_ITEMS) {
      const packs = cart[item] ?? 0;
      if (packs > 0) sum += costOf(item, packs);
    }
    return sum;
  };

  const renderRows = () => {
    if (!currentStock) return;
    moneyEl.textContent = `Tiền: ${fmt.format(currentMoney)}đ`;
    totalEl.textContent = `${fmt.format(calcTotal())}đ`;

    listEl.innerHTML = INVENTORY_ITEMS.map((item) => {
      const cfg = INVENTORY_CONFIG[item];
      const packs = cart[item] ?? 0;
      const qty = currentStock![item];
      const qtyText = Number.isInteger(qty) ? String(qty) : qty.toFixed(1);
      const contam = currentContam?.[item] ?? 0;
      const pct = contam > 0 ? Math.max(1, Math.round(contam)) : 0;
      const contamTag =
        pct > 0
          ? `<span class="contam-tag ${contam >= CONTAM_THRESHOLD ? 'over' : 'mild'}">Nhiễm: ${pct}%</span>`
          : '';
      return `
        <div class="restock-row">
          <div>
            <div class="row-name">${cfg.label}${contamTag}</div>
            <div class="row-meta">Tồn: ${qtyText} · Gói ${cfg.packSize} (${fmt.format(cfg.packCost)}đ)</div>
          </div>
          <div class="row-qty">
            <button type="button" class="qty-btn" data-op="dec" data-item="${item}">-</button>
            <span>${packs}</span>
            <button type="button" class="qty-btn" data-op="inc" data-item="${item}">+</button>
          </div>
        </div>
      `;
    }).join('');
  };

  const onListClick = (event: Event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-op]');
    if (!btn) return;
    const item = btn.dataset.item as InventoryItem;
    const op = btn.dataset.op;
    const prev = cart[item] ?? 0;
    cart[item] = op === 'inc' ? prev + 1 : Math.max(0, prev - 1);
    msgEl.textContent = '';
    msgEl.classList.remove('err');
    renderRows();
  };

  const handleClose = () => {
    if (overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    onClose();
  };

  const handleBuy = () => {
    const total = calcTotal();
    if (total <= 0) {
      msgEl.textContent = 'Hãy bấm + để chọn ít nhất 1 gói cần nhập.';
      msgEl.classList.add('err');
      return;
    }
    const res = onBuyCart(cart);
    msgEl.textContent = res.message;
    msgEl.classList.toggle('err', !res.ok);
    if (res.ok && res.stock && res.money !== undefined) {
      currentStock = res.stock;
      currentContam = res.contamination ?? contaminationProvider?.() ?? currentContam;
      currentMoney = res.money;
      cart = {};
      renderRows();
    }
  };

  listEl.addEventListener('click', onListClick);
  closeBtn.addEventListener('click', handleClose);
  buyBtn.addEventListener('click', handleBuy);

  return {
    open(stock, money, contamination) {
      currentStock = { ...stock };
      currentContam = contamination ? { ...contamination } : (contaminationProvider?.() ?? null);
      currentMoney = money;
      cart = {};
      msgEl.textContent = '';
      msgEl.classList.remove('err');
      renderRows();
      overlay.classList.remove('hidden');
    },

    close: handleClose,

    isOpen() {
      return !overlay.classList.contains('hidden');
    },

    dispose() {
      listEl.removeEventListener('click', onListClick);
      closeBtn.removeEventListener('click', handleClose);
      buyBtn.removeEventListener('click', handleBuy);
      overlay.remove();
    },
  };
}
