export interface LevelPickerView {
  show(title: string, options: [string, string, string]): void;
  hide(): void;
  dispose(): void;
}

// Hiển thị bảng chọn mức 1/2/3 trên HUD khi tương tác với máy pha hoặc kệ
export function createLevelPicker(root: HTMLElement): LevelPickerView {
  const el = document.createElement('div');
  el.className = 'level-picker hidden';
  el.innerHTML = `
    <div class="picker-title" data-el="title"></div>
    <div class="picker-options" data-el="options"></div>
  `;
  root.appendChild(el);

  const titleEl = el.querySelector<HTMLElement>('[data-el="title"]')!;
  const optionsEl = el.querySelector<HTMLElement>('[data-el="options"]')!;

  return {
    show(title, options) {
      titleEl.textContent = `${title} (nhấn phím 1 / 2 / 3)`;
      optionsEl.innerHTML = options
        .map((label, idx) => `<div class="picker-item"><b>[${idx + 1}]</b> ${label}</div>`)
        .join('');
      el.classList.remove('hidden');
    },

    hide() {
      el.classList.add('hidden');
    },

    dispose() {
      el.remove();
    },
  };
}
