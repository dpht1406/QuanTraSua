import type { EventBus } from '../state/eventBus.ts';
import type { GameEvents, GameState } from '../state/gameState.ts';

export interface HudController {
  setLocked(locked: boolean): void;
  setPrompt(label: string | null): void;
  dispose(): void;
}

const currencyFmt = new Intl.NumberFormat('vi-VN');

// Tạo HUD hiển thị tiền, ngày, giờ, tâm ngắm, gợi ý nhấn E và thông báo test
export function createHud(
  root: HTMLElement,
  initialState: GameState,
  bus: EventBus<GameEvents>,
): HudController {
  const layer = document.createElement('div');
  layer.className = 'hud-layer';
  layer.innerHTML = `
    <div class="hud-stats">
      <div class="hud-pill"><span data-field="day"></span> · <span data-field="time"></span></div>
      <div class="hud-pill hud-money">Tiền: <span data-field="money"></span></div>
    </div>
    <div class="crosshair hidden" data-el="crosshair"></div>
    <div class="interact-prompt hidden" data-el="prompt"></div>
    <div class="toast hidden" data-el="toast"></div>
    <div class="hud-controls">WASD: Đi · Shift: Chạy nhẹ · Chuột: Nhìn · E: Tương tác · Esc: Tạm dừng</div>
  `;
  root.appendChild(layer);

  const dayEl = layer.querySelector<HTMLElement>('[data-field="day"]')!;
  const timeEl = layer.querySelector<HTMLElement>('[data-field="time"]')!;
  const moneyEl = layer.querySelector<HTMLElement>('[data-field="money"]')!;
  const crosshairEl = layer.querySelector<HTMLElement>('[data-el="crosshair"]')!;
  const promptEl = layer.querySelector<HTMLElement>('[data-el="prompt"]')!;
  const toastEl = layer.querySelector<HTMLElement>('[data-el="toast"]')!;

  let isLocked = false;
  let currentLabel: string | null = null;
  let toastTimer: number | undefined;

  const renderState = (state: GameState) => {
    dayEl.textContent = `Ngày ${state.day}`;
    timeEl.textContent = state.time;
    moneyEl.textContent = `${currencyFmt.format(state.money)}đ`;
  };

  const syncPrompt = () => {
    if (isLocked && currentLabel) {
      promptEl.textContent = `Nhấn E: ${currentLabel}`;
      promptEl.classList.remove('hidden');
    } else {
      promptEl.classList.add('hidden');
    }
  };

  const unsubState = bus.on('state:changed', renderState);
  const unsubToast = bus.on('toast:show', ({ message }) => {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.add('hidden'), 2200);
  });

  renderState(initialState);

  return {
    setLocked(locked) {
      isLocked = locked;
      crosshairEl.classList.toggle('hidden', !locked);
      syncPrompt();
    },

    setPrompt(label) {
      currentLabel = label;
      syncPrompt();
    },

    dispose() {
      unsubState();
      unsubToast();
      window.clearTimeout(toastTimer);
      layer.remove();
    },
  };
}
