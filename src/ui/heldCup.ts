import { DRINK_COLORS, DRINK_LABELS, TOPPING_LABELS } from '../state/menu.ts';
import type { Cup } from '../state/scoring.ts';

export interface HeldCupView {
  render(cup: Cup | null): void;
  dispose(): void;
}

// Hiển thị ly đang cầm ở góc dưới phải với viền đen, màu trà và mực nước theo bước đã pha
export function createHeldCupView(root: HTMLElement): HeldCupView {
  const box = document.createElement('div');
  box.className = 'held-cup hidden';
  box.innerHTML = `
    <div class="cup-visual">
      <div class="cup-straw hidden" data-el="straw"></div>
      <div class="cup-lid hidden" data-el="lid"></div>
      <div class="cup-shell">
        <div class="cup-liquid" data-el="liquid"></div>
        <div class="cup-ice hidden" data-el="ice"></div>
        <div class="cup-topping hidden" data-el="topping"></div>
      </div>
    </div>
    <div class="cup-info" data-el="info"></div>
  `;
  root.appendChild(box);

  const strawEl = box.querySelector<HTMLElement>('[data-el="straw"]')!;
  const lidEl = box.querySelector<HTMLElement>('[data-el="lid"]')!;
  const liquidEl = box.querySelector<HTMLElement>('[data-el="liquid"]')!;
  const iceEl = box.querySelector<HTMLElement>('[data-el="ice"]')!;
  const toppingEl = box.querySelector<HTMLElement>('[data-el="topping"]')!;
  const infoEl = box.querySelector<HTMLElement>('[data-el="info"]')!;

  return {
    render(cup) {
      if (!cup) {
        box.classList.add('hidden');
        return;
      }

      box.classList.remove('hidden');
      strawEl.classList.toggle('hidden', !cup.sealed);
      lidEl.classList.toggle('hidden', !cup.sealed);

      let fillPct = 0;
      if (cup.base !== null) fillPct += 45;
      if (cup.ice !== null) fillPct += 15;
      if (cup.sugar !== null) fillPct += 15;
      if (cup.topping !== null) fillPct += 15;

      liquidEl.style.height = `${fillPct}%`;
      liquidEl.style.background = cup.base ? DRINK_COLORS[cup.base] : '#e4f2f7';

      iceEl.classList.toggle('hidden', !cup.ice);
      toppingEl.classList.toggle('hidden', !cup.topping || cup.topping === 'none');
      toppingEl.classList.toggle('jelly', cup.topping === 'jelly');

      const lines = [
        cup.base ? DRINK_LABELS[cup.base] : 'Chưa có trà',
        `Đường: ${cup.sugar !== null ? `${cup.sugar}%` : '?'} · Đá: ${cup.ice !== null ? `${cup.ice}%` : '?'}`,
        `Topping: ${cup.topping ? TOPPING_LABELS[cup.topping] : '?'}`,
        cup.sealed ? 'Đã đậy nắp' : 'Chưa đậy nắp',
      ];
      infoEl.innerHTML = lines.map((line) => `<div>${line}</div>`).join('');
    },

    dispose() {
      box.remove();
    },
  };
}
