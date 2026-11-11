import { DRINK_LABELS, TOPPING_LABELS } from '../state/menu.ts';
import type { ActiveOrderView } from '../gameplay/orderManager.ts';

export interface OrderTicketView {
  setOrder(view: ActiveOrderView | null): void;
  showResult(text: string, positive: boolean): void;
  dispose(): void;
}

// Tạo phiếu đơn hàng kèm thanh kiên nhẫn và thẻ kết quả giao nước ở góc trên phải
export function createOrderTicket(root: HTMLElement): OrderTicketView {
  const wrap = document.createElement('div');
  wrap.className = 'order-wrap';
  wrap.innerHTML = `
    <div class="order-card" data-el="card">
      <div class="order-header">
        <span>Phiếu đơn</span>
        <span class="order-timer" data-el="timer">--</span>
      </div>
      <div class="order-body" data-el="body">Chờ khách tới quầy...</div>
      <div class="patience-track"><div class="patience-fill" data-el="fill"></div></div>
    </div>
    <div class="order-result hidden" data-el="result"></div>
  `;
  root.appendChild(wrap);

  const timerEl = wrap.querySelector<HTMLElement>('[data-el="timer"]')!;
  const bodyEl = wrap.querySelector<HTMLElement>('[data-el="body"]')!;
  const fillEl = wrap.querySelector<HTMLElement>('[data-el="fill"]')!;
  const resultEl = wrap.querySelector<HTMLElement>('[data-el="result"]')!;

  let resultTimer: number | undefined;

  return {
    setOrder(view) {
      if (!view) {
        timerEl.textContent = '--';
        bodyEl.innerHTML = '<div class="order-wait">Chờ khách tới quầy...</div>';
        fillEl.style.width = '0%';
        fillEl.classList.remove('low');
        return;
      }

      const { order, remainingSec, ratio } = view;
      timerEl.textContent = `${Math.ceil(remainingSec)}s`;
      bodyEl.innerHTML = `
        <div class="order-drink">${DRINK_LABELS[order.base]}</div>
        <div class="order-tags">
          <span>Đường ${order.sugar}%</span>
          <span>Đá ${order.ice}%</span>
          <span>${TOPPING_LABELS[order.topping]}</span>
        </div>
      `;
      fillEl.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
      fillEl.classList.toggle('low', ratio <= 0.3);
    },

    showResult(text, positive) {
      resultEl.textContent = text;
      resultEl.classList.toggle('bad', !positive);
      resultEl.classList.remove('hidden');
      window.clearTimeout(resultTimer);
      resultTimer = window.setTimeout(() => resultEl.classList.add('hidden'), 3200);
    },

    dispose() {
      window.clearTimeout(resultTimer);
      wrap.remove();
    },
  };
}
