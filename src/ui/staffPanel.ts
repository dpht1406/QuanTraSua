import { MAX_STAFF } from '../state/constants.ts';
import type { StaffActionResult, StaffMember, StaffStore } from '../state/staff.ts';
import type { ShiftState } from '../state/shift.ts';

export interface StaffPanelView {
  open(): void;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

const fmt = new Intl.NumberFormat('vi-VN');
const ROLE_LABELS = {
  cleaner: 'Dọn dẹp',
  barista: 'Pha chế',
} as const;

// Tạo bảng thuê và sa thải nhân viên (tối đa 2 người, chỉ mở được khi đóng cửa)
export function createStaffPanel(
  root: HTMLElement,
  staffStore: StaffStore,
  getShiftState: () => ShiftState,
  onClose: () => void,
): StaffPanelView {
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay hidden';
  overlay.innerHTML = `
    <div class="panel-card staff-card">
      <div class="panel-head">
        <h2>Quản lý nhân viên</h2>
        <div class="panel-money" data-el="count">0 / ${MAX_STAFF}</div>
      </div>
      <div class="staff-list" data-el="list"></div>
      <div class="restock-msg" data-el="msg"></div>
      <div class="panel-foot">
        <div class="restock-total">Tổng lương/ca: <b data-el="wage">0đ</b></div>
        <button type="button" class="btn-secondary" data-el="close">Đóng (Esc)</button>
      </div>
    </div>
  `;
  root.appendChild(overlay);

  const countEl = overlay.querySelector<HTMLElement>('[data-el="count"]')!;
  const listEl = overlay.querySelector<HTMLElement>('[data-el="list"]')!;
  const msgEl = overlay.querySelector<HTMLElement>('[data-el="msg"]')!;
  const wageEl = overlay.querySelector<HTMLElement>('[data-el="wage"]')!;
  const closeBtn = overlay.querySelector<HTMLButtonElement>('[data-el="close"]')!;

  const renderCard = (member: StaffMember, hired: boolean, full: boolean) => {
    const errText =
      member.role === 'barista' ? ` · Tỉ lệ lỗi: ${Math.round(member.errorRate * 100)}%` : '';
    const roleCls = member.role === 'cleaner' ? 'role-cleaner' : 'role-barista';
    const btn = hired
      ? `<button type="button" class="staff-btn fire" data-act="fire" data-id="${member.id}">Sa thải</button>`
      : `<button type="button" class="staff-btn hire" data-act="hire" data-id="${member.id}" ${
          full ? 'disabled' : ''
        }>Thuê</button>`;

    return `
      <div class="staff-row">
        <div>
          <div class="staff-title">
            <span class="row-name">${member.name}</span>
            <span class="role-tag ${roleCls}">${ROLE_LABELS[member.role]}</span>
          </div>
          <div class="row-meta">Lương: ${fmt.format(member.wage)}đ/ca · Tốc độ: ${member.speed}${errText}</div>
        </div>
        ${btn}
      </div>
    `;
  };

  const render = () => {
    const hired = staffStore.getHired();
    const full = hired.length >= MAX_STAFF;
    countEl.textContent = `Đã thuê: ${hired.length} / ${MAX_STAFF}`;
    wageEl.textContent = `${fmt.format(staffStore.getTotalWage())}đ`;
    listEl.innerHTML = staffStore
      .getCandidates()
      .map((c) => renderCard(c, staffStore.isHired(c.id), full))
      .join('');
  };

  const onListClick = (event: Event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id ?? '';
    const act = btn.dataset.act;
    const shiftState = getShiftState();
    const res: StaffActionResult =
      act === 'hire' ? staffStore.hire(id, shiftState) : staffStore.fire(id, shiftState);
    msgEl.textContent = res.message;
    msgEl.classList.toggle('err', !res.ok);
    render();
  };

  const handleClose = () => {
    if (overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    onClose();
  };

  listEl.addEventListener('click', onListClick);
  closeBtn.addEventListener('click', handleClose);

  return {
    open() {
      msgEl.textContent = '';
      msgEl.classList.remove('err');
      render();
      overlay.classList.remove('hidden');
    },

    close: handleClose,

    isOpen() {
      return !overlay.classList.contains('hidden');
    },

    dispose() {
      listEl.removeEventListener('click', onListClick);
      closeBtn.removeEventListener('click', handleClose);
      overlay.remove();
    },
  };
}
