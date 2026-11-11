import './throwBar.css';

export interface ThrowBarView {
  setProgress(ratio: number | null, label?: string, strong?: boolean): void;
  dispose(): void;
}

// Thanh hiển thị lực ném trên HUD khi người chơi giữ phím thả/ném
export function createThrowBar(root: HTMLElement): ThrowBarView {
  const wrap = document.createElement('div');
  wrap.className = 'throw-bar hidden';
  wrap.innerHTML = `
    <div class="throw-bar-label" data-el="label">Lực ném</div>
    <div class="throw-bar-track"><div class="throw-bar-fill" data-el="fill"></div></div>
  `;
  root.appendChild(wrap);

  const labelEl = wrap.querySelector<HTMLElement>('[data-el="label"]')!;
  const fillEl = wrap.querySelector<HTMLElement>('[data-el="fill"]')!;

  return {
    setProgress(ratio, label = 'Lực ném', strong = false) {
      if (ratio === null) {
        wrap.classList.add('hidden');
        wrap.classList.remove('strong');
        fillEl.style.width = '0%';
        return;
      }
      const clamped = Math.max(0, Math.min(1, ratio));
      labelEl.textContent = label;
      wrap.classList.remove('hidden');
      wrap.classList.toggle('strong', strong);
      fillEl.style.width = `${Math.round(clamped * 100)}%`;
    },

    dispose() {
      wrap.remove();
    },
  };
}
