export interface MenuOverlay {
  setLocked(locked: boolean): void;
  dispose(): void;
}

// Tạo màn hình bắt đầu ("Vào quán") và menu tạm dừng khi nhấn Esc
export function createMenuOverlay(
  root: HTMLElement,
  onEnterGame: () => void,
): MenuOverlay {
  const overlay = document.createElement('div');
  overlay.className = 'menu-overlay';
  overlay.innerHTML = `
    <div class="menu-card">
      <h1 class="menu-title" data-el="title">Quán Trà Sữa Pastel</h1>
      <p class="menu-desc" data-el="desc">Khám phá quán trà sữa 3D góc nhìn thứ nhất</p>
      <div class="menu-keys">
        <span>WASD: Di chuyển</span>
        <span>Shift: Chạy nhẹ</span>
        <span>Chuột: Nhìn</span>
        <span>E: Tương tác</span>
        <span>Esc: Tạm dừng</span>
      </div>
      <button type="button" class="menu-btn" data-el="btn">Vào quán</button>
    </div>
  `;
  root.appendChild(overlay);

  const titleEl = overlay.querySelector<HTMLElement>('[data-el="title"]')!;
  const descEl = overlay.querySelector<HTMLElement>('[data-el="desc"]')!;
  const btnEl = overlay.querySelector<HTMLButtonElement>('[data-el="btn"]')!;
  let hasStarted = false;

  const onClick = () => {
    hasStarted = true;
    onEnterGame();
  };
  btnEl.addEventListener('click', onClick);

  return {
    setLocked(locked) {
      overlay.classList.toggle('hidden', locked);
      if (!locked && hasStarted) {
        titleEl.textContent = 'Tạm dừng';
        descEl.textContent = 'Bấm nút bên dưới để tiếp tục phục vụ quán';
        btnEl.textContent = 'Tiếp tục';
      }
    },

    dispose() {
      btnEl.removeEventListener('click', onClick);
      overlay.remove();
    },
  };
}
