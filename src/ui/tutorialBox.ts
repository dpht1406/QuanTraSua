import type { TutorialViewState } from '../state/tutorial.ts';

export interface TutorialBoxView {
  render(view: TutorialViewState | null): void;
  dispose(): void;
}

// Hiển thị khung hướng dẫn ngắn trong HUD (không đụng PointerLock)
export function createTutorialBox(
  root: HTMLElement,
  onSkip: () => void,
): TutorialBoxView {
  const box = document.createElement('div');
  box.className = 'tutorial-box hidden';
  box.innerHTML = `
    <div class="tutorial-head">
      <span class="tutorial-badge" data-el="progress"></span>
      <span class="tutorial-opt hidden" data-el="optional">Tùy chọn</span>
    </div>
    <div class="tutorial-title" data-el="title"></div>
    <div class="tutorial-desc" data-el="desc"></div>
    <div class="tutorial-foot">
      <button type="button" class="tutorial-skip-btn" data-el="skip">Bỏ qua hướng dẫn [H]</button>
    </div>
  `;
  root.appendChild(box);

  const progressEl = box.querySelector<HTMLElement>('[data-el="progress"]')!;
  const optionalEl = box.querySelector<HTMLElement>('[data-el="optional"]')!;
  const titleEl = box.querySelector<HTMLElement>('[data-el="title"]')!;
  const descEl = box.querySelector<HTMLElement>('[data-el="desc"]')!;
  const skipBtn = box.querySelector<HTMLButtonElement>('[data-el="skip"]')!;

  const handleSkipClick = (event: Event) => {
    event.stopPropagation();
    onSkip();
  };
  skipBtn.addEventListener('click', handleSkipClick);

  return {
    render(view) {
      if (!view) {
        box.classList.add('hidden');
        return;
      }
      progressEl.textContent = `Hướng dẫn · ${view.stepNumber}/${view.totalSteps}`;
      optionalEl.classList.toggle('hidden', !view.step.optional);
      titleEl.textContent = view.step.title;
      descEl.textContent = view.step.instruction;
      skipBtn.textContent = `Bỏ qua hướng dẫn [${view.skipKeyLabel}]`;
      box.classList.remove('hidden');
    },

    dispose() {
      skipBtn.removeEventListener('click', handleSkipClick);
      box.remove();
    },
  };
}
