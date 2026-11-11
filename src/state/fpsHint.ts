import {
  FPS_AVG_WINDOW_SEC,
  LOW_FPS_SUSTAIN_SEC,
  LOW_FPS_THRESHOLD,
  MAX_FPS_FRAME_DT_SEC,
} from './constantsGraphicsUi.ts';
import type { GraphicsQuality } from './graphicsQuality.ts';

export interface RollingFps {
  push(dtSec: number): number | null;
  getAverage(): number | null;
  getSampleDuration(): number;
  reset(): void;
}

export interface LowFpsHintOptions {
  thresholdFps?: number;
  sustainSec?: number;
  maxGapSec?: number;
}

export interface LowFpsHintTracker {
  update(avgFps: number | null, dtSec: number, quality: GraphicsQuality): boolean;
  resetTimer(): void;
  hasTriggered(): boolean;
  getLowDuration(): number;
}

// Tính FPS trung bình trượt theo cửa sổ thời gian thực (~1 giây)
export function createRollingFps(windowSec = FPS_AVG_WINDOW_SEC): RollingFps {
  const safeWindow = Number.isFinite(windowSec) && windowSec > 0 ? windowSec : FPS_AVG_WINDOW_SEC;
  const samples: number[] = [];
  let sumDt = 0;

  const getAverage = () => (samples.length === 0 || sumDt <= 0 ? null : samples.length / sumDt);

  return {
    push(dtSec) {
      if (!Number.isFinite(dtSec) || dtSec <= 0) return getAverage();
      samples.push(dtSec);
      sumDt += dtSec;
      while (samples.length > 1 && sumDt - samples[0] >= safeWindow) {
        sumDt -= samples.shift()!;
      }
      if (samples.length === 1) sumDt = samples[0];
      return getAverage();
    },

    getAverage,

    getSampleDuration() {
      return sumDt;
    },

    reset() {
      samples.length = 0;
      sumDt = 0;
    },
  };
}

// Theo dõi thời gian FPS trung bình dưới ngưỡng ở mức Cao để gợi ý hạ cấu hình tối đa 1 lần mỗi phiên
export function createLowFpsHintTracker(opts: LowFpsHintOptions = {}): LowFpsHintTracker {
  const thresholdFps = opts.thresholdFps ?? LOW_FPS_THRESHOLD;
  const sustainSec = opts.sustainSec ?? LOW_FPS_SUSTAIN_SEC;
  const maxGapSec = opts.maxGapSec ?? MAX_FPS_FRAME_DT_SEC;

  let lowSec = 0;
  let triggered = false;

  return {
    update(avgFps, dtSec, quality) {
      if (triggered) return false;
      if (quality !== 'high') {
        lowSec = 0;
        return false;
      }
      if (!Number.isFinite(dtSec) || dtSec <= 0) return false;
      // Ngắt quãng dài (chuyển tab / tạm dừng trình duyệt) không tính là tụt FPS liên tục
      if (dtSec > maxGapSec) {
        lowSec = 0;
        return false;
      }
      if (avgFps === null || !Number.isFinite(avgFps) || avgFps <= 0) return false;

      if (avgFps < thresholdFps) {
        lowSec += dtSec;
        if (lowSec >= sustainSec) {
          triggered = true;
          return true;
        }
        return false;
      }

      lowSec = 0;
      return false;
    },

    resetTimer() {
      lowSec = 0;
    },

    hasTriggered() {
      return triggered;
    },

    getLowDuration() {
      return lowSec;
    },
  };
}
