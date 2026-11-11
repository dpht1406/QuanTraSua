export interface SaveSummaryInfo {
  day: number;
  money: number;
  reputation: number;
}

export interface MenuOverlayOptions {
  saveSummary: SaveSummaryInfo | null;
  canRestart: () => boolean;
  onEnterGame: () => void;
  onRestartGame: () => void;
}

export interface MenuOverlay {
  setLocked(locked: boolean, suppressOverlay?: boolean): void;
  isOpen(): boolean;
  getActionsContainer(): HTMLElement;
  dispose(): void;
}

const fmt = new Intl.NumberFormat('vi-VN');

// Tạo màn hình bắt đầu ("Vào quán"/"Tiếp tục"/"Chơi mới") và menu tạm dừng khi nhấn Esc
export function createMenuOverlay(
  root: HTMLElement,
  options: MenuOverlayOptions,
): MenuOverlay {
  const overlay = document.createElement('div');
  overlay.className = 'menu-overlay';
  overlay.innerHTML = `
    <div class="menu-card">
      <h1 class="menu-title" data-el="title">Quán Trà Sữa Pastel</h1>
      <p class="menu-desc" data-el="desc">Khám phá quán trà sữa 3D góc nhìn thứ nhất</p>
      <div class="menu-save-meta hidden" data-el="saveMeta"></div>
      <div class="menu-keys">
        <span>WASD: Di chuyển</span>
        <span>Shift: Chạy nhẹ</span>
        <span>Chuột: Nhìn</span>
        <span>Chuột trái / phải: Dùng vật tay phải / trái</span>
        <span>Giữ chuột: Quét / Lau bằng chổi / cây lau</span>
        <span>F / Q: Thả nhẹ hoặc giữ để ném (phải / trái)</span>
        <span>R: Đổ lại nguyên liệu</span>
        <span>E: Tương tác / Nhặt / Cất / Đổ rác</span>
        <span>1/2/3: Chọn món / Phản hồi</span>
        <span>G: Chào khách</span>
        <span>Y/N: Kết ca sớm</span>
        <span>Esc: Tạm dừng</span>
      </div>
      <div class="menu-actions" data-el="actions">
        <button type="button" class="menu-btn" data-el="btn">Vào quán</button>
        <button type="button" class="menu-btn-secondary hidden" data-el="resetBtn">Chơi mới</button>
      </div>
      <div class="menu-confirm hidden" data-el="confirmBox">
        <p class="menu-confirm-text">Xóa tiến trình đã lưu và bắt đầu lại từ Ngày 1?</p>
        <div class="menu-confirm-btns">
          <button type="button" class="btn-secondary" data-el="confirmNo">Hủy</button>
          <button type="button" class="menu-btn-danger" data-el="confirmYes">Xác nhận</button>
        </div>
      </div>
    </div>
  `;
  root.appendChild(overlay);

  const titleEl = overlay.querySelector<HTMLElement>('[data-el="title"]')!;
  const descEl = overlay.querySelector<HTMLElement>('[data-el="desc"]')!;
  const saveMetaEl = overlay.querySelector<HTMLElement>('[data-el="saveMeta"]')!;
  const actionsEl = overlay.querySelector<HTMLElement>('[data-el="actions"]')!;
  const btnEl = overlay.querySelector<HTMLButtonElement>('[data-el="btn"]')!;
  const resetBtn = overlay.querySelector<HTMLButtonElement>('[data-el="resetBtn"]')!;
  const confirmBox = overlay.querySelector<HTMLElement>('[data-el="confirmBox"]')!;
  const confirmYes = overlay.querySelector<HTMLButtonElement>('[data-el="confirmYes"]')!;
  const confirmNo = overlay.querySelector<HTMLButtonElement>('[data-el="confirmNo"]')!;
  let hasStarted = false;

  const setConfirming = (active: boolean) => {
    confirmBox.classList.toggle('hidden', !active);
    actionsEl.classList.toggle('hidden', active);
  };

  const syncStartMode = () => {
    setConfirming(false);
    if (!hasStarted) {
      if (options.saveSummary) {
        const s = options.saveSummary;
        saveMetaEl.textContent = `Tiến trình: Ngày ${s.day} · ${fmt.format(s.money)}đ · Uy tín ${s.reputation}`;
        saveMetaEl.classList.remove('hidden');
        btnEl.textContent = 'Tiếp tục';
        resetBtn.textContent = 'Chơi mới';
        resetBtn.classList.remove('hidden');
      } else {
        saveMetaEl.classList.add('hidden');
        btnEl.textContent = 'Vào quán';
        resetBtn.classList.add('hidden');
      }
      return;
    }

    titleEl.textContent = 'Tạm dừng';
    descEl.textContent = 'Bấm nút bên dưới để tiếp tục phục vụ quán';
    saveMetaEl.classList.add('hidden');
    btnEl.textContent = 'Tiếp tục';
    resetBtn.textContent = 'Bắt đầu lại';
    resetBtn.classList.toggle('hidden', !options.canRestart());
  };

  const onEnterClick = () => {
    hasStarted = true;
    setConfirming(false);
    options.onEnterGame();
  };
  const onResetClick = () => setConfirming(true);
  const onConfirmNo = () => setConfirming(false);
  const onConfirmYes = () => options.onRestartGame();

  btnEl.addEventListener('click', onEnterClick);
  resetBtn.addEventListener('click', onResetClick);
  confirmNo.addEventListener('click', onConfirmNo);
  confirmYes.addEventListener('click', onConfirmYes);
  syncStartMode();

  return {
    setLocked(locked, suppressOverlay = false) {
      const show = !locked && !suppressOverlay;
      overlay.classList.toggle('hidden', !show);
      if (show) syncStartMode();
      else setConfirming(false);
    },

    isOpen() {
      return !overlay.classList.contains('hidden');
    },

    getActionsContainer() {
      return actionsEl;
    },

    dispose() {
      btnEl.removeEventListener('click', onEnterClick);
      resetBtn.removeEventListener('click', onResetClick);
      confirmNo.removeEventListener('click', onConfirmNo);
      confirmYes.removeEventListener('click', onConfirmYes);
      overlay.remove();
    },
  };
}
