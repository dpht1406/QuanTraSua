import type { EventBus } from '../state/eventBus.ts';
import type { GameEvents, GameState } from '../state/gameState.ts';
import type { InventoryStock } from '../state/inventory.ts';
import type { ShiftState } from '../state/shift.ts';

export interface HudController {
  setLocked(locked: boolean): void;
  setPrompt(label: string | null, isHold?: boolean): void;
  setHoldProgress(progress: number | null): void;
  setStock(stock: InventoryStock): void;
  setConfirmClose(active: boolean): void;
  setGreetHint(remainingSec: number | null): void;
  setEventBanner(text: string | null): void;
  setRelockVisible(visible: boolean): void;
  showHint(text: string, ms?: number): void;
  dispose(): void;
}

const currencyFmt = new Intl.NumberFormat('vi-VN');
const SHIFT_LABELS: Record<ShiftState, string> = {
  closed: 'Đóng cửa',
  open: 'Đang mở',
  closing: 'Sắp đóng',
  summary: 'Tổng kết',
};

// Tạo HUD hiển thị ngày/giờ, trạng thái ca, tiền, tồn kho nhanh và thông báo
export function createHud(
  root: HTMLElement,
  initialState: GameState,
  initialStock: InventoryStock,
  bus: EventBus<GameEvents>,
  onRelockClick: () => void,
): HudController {
  const layer = document.createElement('div');
  layer.className = 'hud-layer';
  layer.innerHTML = `
    <div class="hud-left-col">
      <div class="hud-stats">
        <div class="hud-pill"><span data-field="day"></span> · <span data-field="time"></span></div>
        <div class="hud-pill hud-shift" data-field="shift"></div>
        <div class="hud-pill hud-money">Tiền: <span data-field="money"></span></div>
        <div class="hud-pill hud-clean" data-field="cleanWrap">Sạch: <span data-field="clean"></span></div>
        <div class="hud-pill hud-rep" data-field="repWrap">Uy tín: <span data-field="rep"></span></div>
      </div>
      <div class="hud-stock hidden" data-el="stock"></div>
      <div class="event-banner hidden" data-el="eventBanner"></div>
    </div>
    <div class="confirm-banner hidden" data-el="confirm">Kết ca sớm? [Y] Đồng ý · [N] Hủy</div>
    <div class="greet-hint hidden" data-el="greetHint"></div>
    <div class="crosshair hidden" data-el="crosshair"></div>
    <div class="interact-prompt hidden" data-el="prompt"></div>
    <div class="hold-progress hidden" data-el="hold"><div class="hold-fill" data-el="holdFill"></div></div>
    <div class="toast hidden" data-el="toast"></div>
    <div class="hud-controls">WASD: Đi · Shift: Chạy · Chuột: Nhìn · Chuột trái/phải: Dùng/Lau · F/Q: Thả/Ném · R: Đổ lại · E: Tương tác · G: Chào · 1/2/3: Chọn · Esc: Tạm dừng</div>
  `;
  root.appendChild(layer);

  const relockEl = document.createElement('div');
  relockEl.className = 'relock-banner hidden';
  relockEl.innerHTML = '<div class="relock-pill">Bấm vào màn hình để khóa chuột tiếp tục</div>';
  relockEl.addEventListener('click', onRelockClick);
  root.appendChild(relockEl);

  const dayEl = layer.querySelector<HTMLElement>('[data-field="day"]')!;
  const timeEl = layer.querySelector<HTMLElement>('[data-field="time"]')!;
  const shiftEl = layer.querySelector<HTMLElement>('[data-field="shift"]')!;
  const moneyEl = layer.querySelector<HTMLElement>('[data-field="money"]')!;
  const cleanWrapEl = layer.querySelector<HTMLElement>('[data-field="cleanWrap"]')!;
  const cleanEl = layer.querySelector<HTMLElement>('[data-field="clean"]')!;
  const repWrapEl = layer.querySelector<HTMLElement>('[data-field="repWrap"]')!;
  const repEl = layer.querySelector<HTMLElement>('[data-field="rep"]')!;
  const stockEl = layer.querySelector<HTMLElement>('[data-el="stock"]')!;
  const eventBannerEl = layer.querySelector<HTMLElement>('[data-el="eventBanner"]')!;
  const confirmEl = layer.querySelector<HTMLElement>('[data-el="confirm"]')!;
  const greetHintEl = layer.querySelector<HTMLElement>('[data-el="greetHint"]')!;
  const crosshairEl = layer.querySelector<HTMLElement>('[data-el="crosshair"]')!;
  const promptEl = layer.querySelector<HTMLElement>('[data-el="prompt"]')!;
  const holdEl = layer.querySelector<HTMLElement>('[data-el="hold"]')!;
  const holdFillEl = layer.querySelector<HTMLElement>('[data-el="holdFill"]')!;
  const toastEl = layer.querySelector<HTMLElement>('[data-el="toast"]')!;

  let isLocked = false;
  let currentLabel: string | null = null;
  let currentIsHold = false;
  let latestStock = initialStock;
  let latestShift: ShiftState = initialState.shiftState;
  let toastTimer: number | undefined;

  const renderStock = () => {
    const show = latestShift === 'open' || latestShift === 'closing';
    stockEl.classList.toggle('hidden', !show);
    if (!show) return;
    stockEl.textContent = `Ly: ${latestStock.cup} · Nắp: ${latestStock.lid} · TS: ${latestStock.traditional} · Đào: ${latestStock.peach} · Matcha: ${latestStock.matcha}`;
  };

  const renderClean = (value: number) => {
    cleanEl.textContent = `${value}%`;
    const tier = value >= 70 ? 'good' : value >= 40 ? 'mid' : 'low';
    cleanWrapEl.className = `hud-pill hud-clean ${tier}`;
  };

  const renderRep = (value: number) => {
    repEl.textContent = `${value}`;
    const tier = value >= 70 ? 'good' : value >= 40 ? 'mid' : 'low';
    repWrapEl.className = `hud-pill hud-rep ${tier}`;
  };

  const renderState = (state: GameState) => {
    latestShift = state.shiftState;
    dayEl.textContent = `Ngày ${state.day}`;
    timeEl.textContent = state.time;
    moneyEl.textContent = `${currencyFmt.format(state.money)}đ`;
    shiftEl.textContent = SHIFT_LABELS[state.shiftState];
    shiftEl.className = `hud-pill hud-shift ${state.shiftState}`;
    renderClean(state.cleanliness);
    renderRep(state.reputation);
    renderStock();
  };

  const syncPrompt = () => {
    if (isLocked && currentLabel) {
      promptEl.textContent = `${currentIsHold ? 'Giữ E' : 'Nhấn E'}: ${currentLabel}`;
      promptEl.classList.remove('hidden');
    } else {
      promptEl.classList.add('hidden');
      holdEl.classList.add('hidden');
    }
  };

  const showHint = (text: string, ms = 2400) => {
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.add('hidden'), ms);
  };

  const unsubState = bus.on('state:changed', renderState);
  const unsubClean = bus.on('cleanlinessChanged', ({ value }) => renderClean(value));
  const unsubRep = bus.on('reputationChanged', ({ value }) => renderRep(value));
  const unsubStock = bus.on('stockChanged', ({ stock }) => {
    latestStock = stock;
    renderStock();
  });
  const unsubToast = bus.on('toast:show', ({ message }) => showHint(message));

  renderState(initialState);

  return {
    setLocked(locked) {
      isLocked = locked;
      crosshairEl.classList.toggle('hidden', !locked);
      if (locked) relockEl.classList.add('hidden');
      syncPrompt();
    },

    setPrompt(label, isHold = false) {
      currentLabel = label;
      currentIsHold = isHold;
      syncPrompt();
    },

    setHoldProgress(progress) {
      if (!isLocked || progress === null) {
        holdEl.classList.add('hidden');
        holdFillEl.style.width = '0%';
        return;
      }
      holdEl.classList.remove('hidden');
      holdFillEl.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
    },

    setStock(stock) {
      latestStock = stock;
      renderStock();
    },

    setConfirmClose(active) {
      confirmEl.classList.toggle('hidden', !active);
    },

    setGreetHint(remainingSec) {
      if (remainingSec === null || remainingSec <= 0) {
        greetHintEl.classList.add('hidden');
        return;
      }
      greetHintEl.textContent = `[G] Chào khách (${Math.ceil(remainingSec)}s)`;
      greetHintEl.classList.remove('hidden');
    },

    setEventBanner(text) {
      if (!text) {
        eventBannerEl.classList.add('hidden');
        return;
      }
      eventBannerEl.textContent = text;
      eventBannerEl.classList.remove('hidden');
    },

    setRelockVisible(visible) {
      relockEl.classList.toggle('hidden', !visible);
    },

    showHint,

    dispose() {
      unsubState();
      unsubClean();
      unsubRep();
      unsubStock();
      unsubToast();
      relockEl.removeEventListener('click', onRelockClick);
      window.clearTimeout(toastTimer);
      layer.remove();
      relockEl.remove();
    },
  };
}
