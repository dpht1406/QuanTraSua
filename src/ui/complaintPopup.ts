import { COMPLAINT_REP_DELTA } from '../state/constants.ts';
import type { ActiveComplaint } from '../state/reputation.ts';

export interface ComplaintPopupView {
  sync(active: ActiveComplaint | null): void;
  dispose(): void;
}

const fmt = new Intl.NumberFormat('vi-VN');

// Popup nhỏ không mở khóa chuột khi khách phàn nàn, nhận phím 1/2/3 và tự đếm ngược
export function createComplaintPopup(root: HTMLElement): ComplaintPopupView {
  const el = document.createElement('div');
  el.className = 'complaint-popup hidden';
  el.innerHTML = `
    <div class="complaint-head">
      <span>Khách đang phàn nàn!</span>
      <span class="complaint-timer" data-el="timer">10s</span>
    </div>
    <div class="complaint-desc">Ly nước chưa làm hài lòng khách. Chọn cách xử lý (1/2/3):</div>
    <div class="complaint-options">
      <div class="complaint-opt"><b>[1] Xin lỗi</b><span>0đ · 0 uy tín</span></div>
      <div class="complaint-opt" data-el="refund"></div>
      <div class="complaint-opt"><b>[3] Bỏ qua</b><span>${COMPLAINT_REP_DELTA.ignore} uy tín</span></div>
    </div>
  `;
  root.appendChild(el);

  const timerEl = el.querySelector<HTMLElement>('[data-el="timer"]')!;
  const refundEl = el.querySelector<HTMLElement>('[data-el="refund"]')!;

  return {
    sync(active) {
      if (!active) {
        el.classList.add('hidden');
        return;
      }
      timerEl.textContent = `${Math.max(1, Math.ceil(active.remainingSec))}s`;
      refundEl.innerHTML = `<b>[2] Tặng đền</b><span>-${fmt.format(active.refundCost)}đ · +${COMPLAINT_REP_DELTA.refund} uy tín</span>`;
      el.classList.remove('hidden');
    },

    dispose() {
      el.remove();
    },
  };
}
