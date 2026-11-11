import './graphicsSettings.css';
import {
  FPS_AVG_WINDOW_SEC,
  FPS_DISPLAY_INTERVAL_MS,
  FPS_TOGGLE_KEY,
  FPS_WARMUP_SEC,
  GRAPHICS_QUALITY_LABELS,
  LOW_FPS_HINT_MESSAGE,
  LOW_FPS_THRESHOLD,
  MAX_FPS_FRAME_DT_SEC,
} from '../state/constantsGraphicsUi.ts';
import { createLowFpsHintTracker, createRollingFps } from '../state/fpsHint.ts';
import { parseGraphicsQuality, type GraphicsQuality } from '../state/graphicsQuality.ts';

export interface FpsMeterOptions {
  initialQuality: GraphicsQuality;
  onLowFpsHint: (message: string) => void;
}

export interface FpsMeterController {
  update(nowMs?: number): void;
  setQuality(quality: GraphicsQuality): void;
  toggle(): boolean;
  isVisible(): boolean;
  dispose(): void;
}

// Đo FPS trung bình trượt ~1s, bật/tắt bằng phím F3 (mặc định tắt) và gợi ý giảm đồ họa 1 lần nếu quá chậm
export function createFpsMeter(
  root: HTMLElement,
  options: FpsMeterOptions,
): FpsMeterController {
  const el = document.createElement('div');
  el.className = 'fps-meter hidden';
  el.setAttribute('aria-live', 'off');
  root.appendChild(el);

  const rolling = createRollingFps(FPS_AVG_WINDOW_SEC);
  const hintTracker = createLowFpsHintTracker();

  let quality = parseGraphicsQuality(options.initialQuality);
  let visible = false;
  let disposed = false;
  let lastFrameMs: number | null = null;
  let lastRenderMs = -Infinity;

  const render = () => {
    const avg = rolling.getAverage();
    const fpsText = avg === null ? '--' : String(Math.round(avg));
    el.textContent = `FPS: ${fpsText} · ${GRAPHICS_QUALITY_LABELS[quality]}`;
    el.classList.toggle('fps-low', avg !== null && avg < LOW_FPS_THRESHOLD);
    el.classList.toggle('fps-good', avg !== null && avg >= 45);
  };

  const toggle = () => {
    if (disposed) return false;
    visible = !visible;
    el.classList.toggle('hidden', !visible);
    if (visible) {
      lastRenderMs = -Infinity;
      render();
    }
    return visible;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || event.code !== FPS_TOGGLE_KEY) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    // Chặn hành vi Find-in-page của F3 trên trình duyệt để không làm mất PointerLock
    event.preventDefault();
    toggle();
  };

  window.addEventListener('keydown', onKeyDown);

  return {
    update(nowMs) {
      if (disposed) return;
      if (typeof document !== 'undefined' && document.hidden) {
        lastFrameMs = null;
        hintTracker.resetTimer();
        return;
      }

      const now = nowMs ?? performance.now();
      if (lastFrameMs === null) {
        lastFrameMs = now;
        return;
      }

      const dtSec = (now - lastFrameMs) / 1000;
      lastFrameMs = now;
      if (!Number.isFinite(dtSec) || dtSec <= 0) return;
      if (dtSec > MAX_FPS_FRAME_DT_SEC) {
        hintTracker.resetTimer();
        return;
      }

      const avg = rolling.push(dtSec);
      const readyAvg = rolling.getSampleDuration() >= FPS_WARMUP_SEC ? avg : null;
      if (hintTracker.update(readyAvg, dtSec, quality)) {
        options.onLowFpsHint(LOW_FPS_HINT_MESSAGE);
      }

      if (visible && now - lastRenderMs >= FPS_DISPLAY_INTERVAL_MS) {
        lastRenderMs = now;
        render();
      }
    },

    setQuality(nextQuality) {
      quality = parseGraphicsQuality(nextQuality);
      if (quality !== 'high') hintTracker.resetTimer();
      if (visible) render();
    },

    toggle,
    isVisible: () => visible,

    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
      el.remove();
    },
  };
}
