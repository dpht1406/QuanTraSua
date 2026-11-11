import type { ShiftSummary } from '../state/shift.ts';

export interface ShiftSummaryView {
  show(summary: ShiftSummary, day: number): void;
  hide(): void;
  dispose(): void;
}

const fmt = new Intl.NumberFormat('vi-VN');

// Tạo bảng tổng kết cuối ca kèm nút chuyển sang ngày mới
export function createShiftSummaryView(
  root: HTMLElement,
  onNextDay: () => void,
): ShiftSummaryView {
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay hidden';
  overlay.innerHTML = `
    <div class="panel-card summary-card">
      <h2 class="summary-title" data-el="title">Tổng kết ca</h2>
      <div class="summary-grid" data-el="grid"></div>
      <button type="button" class="btn-primary summary-btn" data-el="next">Sang ngày mới</button>
    </div>
  `;
  root.appendChild(overlay);

  const titleEl = overlay.querySelector<HTMLElement>('[data-el="title"]')!;
  const gridEl = overlay.querySelector<HTMLElement>('[data-el="grid"]')!;
  const nextBtn = overlay.querySelector<HTMLButtonElement>('[data-el="next"]')!;

  const handleNext = () => {
    overlay.classList.add('hidden');
    onNextDay();
  };
  nextBtn.addEventListener('click', handleNext);

  return {
    show(summary, day) {
      titleEl.textContent = `Tổng kết ca · Ngày ${day}`;
      const profitSign = summary.profit >= 0 ? '+' : '';
      const profitCls = summary.profit >= 0 ? 'profit-pos' : 'profit-neg';
      const repDeltaText =
        summary.reputationDelta > 0
          ? `+${summary.reputationDelta}`
          : `${summary.reputationDelta}`;
      const prevDebtRow =
        summary.prevDebtPaid > 0
          ? `<div class="sum-row"><span>Trả nợ lương ca trước</span><b>-${fmt.format(summary.prevDebtPaid)}đ</b></div>`
          : '';
      const debtRow =
        summary.wageDebt > 0
          ? `<div class="sum-row sum-debt"><span>Nợ lương còn lại</span><b>${fmt.format(summary.wageDebt)}đ</b></div>`
          : '';
      const quitNote = summary.quitStaffName
        ? `<div class="sum-row sum-debt"><span>Nhân viên nghỉ việc (nợ cao)</span><b>${summary.quitStaffName}</b></div>`
        : '';
      gridEl.innerHTML = `
        <div class="sum-row"><span>Doanh thu</span><b>${fmt.format(summary.revenue)}đ</b></div>
        <div class="sum-row"><span>Đơn thành công</span><b>${summary.servedCount}</b></div>
        <div class="sum-row"><span>Đơn thất bại / bỏ đi</span><b>${summary.failedCount}</b></div>
        <div class="sum-row"><span>Trung bình sao đơn</span><b>${summary.avgStars} / 5</b></div>
        <div class="sum-row"><span>Đánh giá cuối ca</span><b>${summary.shopRating} / 5 sao</b></div>
        <div class="sum-row"><span>Uy tín cuối ca</span><b>${summary.reputationEnd} (${repDeltaText})</b></div>
        <div class="sum-row"><span>Chi phí nguyên liệu</span><b>-${fmt.format(summary.ingredientCost)}đ</b></div>
        <div class="sum-row"><span>Lương nhân viên</span><b>-${fmt.format(summary.staffWages)}đ</b></div>
        ${prevDebtRow}
        ${debtRow}
        ${quitNote}
        <div class="sum-row sum-profit ${profitCls}">
          <span>Lợi nhuận ca</span>
          <b>${profitSign}${fmt.format(summary.profit)}đ</b>
        </div>
      `;
      overlay.classList.remove('hidden');
    },

    hide() {
      overlay.classList.add('hidden');
    },

    dispose() {
      nextBtn.removeEventListener('click', handleNext);
      overlay.remove();
    },
  };
}
