import './handsHud.css';
import { findCupHand, type HandsState, type HeldItem } from '../state/hands.ts';
import { DRINK_LABELS } from '../state/menu.ts';

export interface HandsHudView {
  render(hands: HandsState): void;
  dispose(): void;
}

function hasCupProgress(hands: HandsState): boolean {
  const hand = findCupHand(hands);
  if (!hand) return false;
  const item = hands[hand];
  if (item?.kind !== 'cup') return false;
  const c = item.cup;
  return c.base !== null || c.sugar !== null || c.ice !== null || c.topping !== null || c.sealed;
}

function renderHandSlot(slotEl: HTMLElement, itemEl: HTMLElement, item: HeldItem | null): void {
  slotEl.classList.toggle('empty', item === null);
  const iconEl = itemEl.firstElementChild as HTMLElement;
  const nameEl = itemEl.lastElementChild as HTMLElement;
  if (!item) {
    iconEl.textContent = '✋';
    nameEl.textContent = 'Trống';
    return;
  }
  if (item.kind === 'broom') {
    iconEl.textContent = '🧹';
    nameEl.textContent = 'Chổi';
    return;
  }
  if (item.kind === 'mop') {
    iconEl.textContent = '🧽';
    nameEl.textContent = 'Cây lau';
    return;
  }
  iconEl.textContent = '🧋';
  nameEl.textContent = item.cup.base ? `Ly (${DRINK_LABELS[item.cup.base]})` : 'Ly rỗng';
}

// Tạo HUD hiển thị hai tay (phải/trái), tên/icon vật đang cầm và gợi ý phím R
export function createHandsHud(root: HTMLElement): HandsHudView {
  const wrap = document.createElement('div');
  wrap.className = 'hands-hud';
  wrap.innerHTML = `
    <div class="hands-pour-hint hidden" data-el="pourHint">R: đổ lại nguyên liệu</div>
    <div class="hands-slots">
      <div class="hand-slot empty" data-slot="left">
        <div class="hand-label">Tay trái [Chuột phải / Q]</div>
        <div class="hand-item" data-el="leftItem"><span></span><span class="hand-name"></span></div>
      </div>
      <div class="hand-slot empty" data-slot="right">
        <div class="hand-label">Tay phải [Chuột trái / F]</div>
        <div class="hand-item" data-el="rightItem"><span></span><span class="hand-name"></span></div>
      </div>
    </div>
  `;
  root.appendChild(wrap);

  const pourHintEl = wrap.querySelector<HTMLElement>('[data-el="pourHint"]')!;
  const leftSlotEl = wrap.querySelector<HTMLElement>('[data-slot="left"]')!;
  const rightSlotEl = wrap.querySelector<HTMLElement>('[data-slot="right"]')!;
  const leftItemEl = wrap.querySelector<HTMLElement>('[data-el="leftItem"]')!;
  const rightItemEl = wrap.querySelector<HTMLElement>('[data-el="rightItem"]')!;

  return {
    render(hands) {
      renderHandSlot(leftSlotEl, leftItemEl, hands.left);
      renderHandSlot(rightSlotEl, rightItemEl, hands.right);
      pourHintEl.classList.toggle('hidden', !hasCupProgress(hands));
    },

    dispose() {
      wrap.remove();
    },
  };
}
