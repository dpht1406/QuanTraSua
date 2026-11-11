// Hằng số cho nút chọn chất lượng đồ họa, bộ đo FPS và gợi ý giảm cấu hình (GĐ8a Tab 4)
export const FPS_AVG_WINDOW_SEC = 1.0;
export const FPS_WARMUP_SEC = 0.25;
export const MAX_FPS_FRAME_DT_SEC = 1.0;
export const FPS_DISPLAY_INTERVAL_MS = 200;

export const LOW_FPS_THRESHOLD = 30;
export const LOW_FPS_SUSTAIN_SEC = 5.0;
export const LOW_FPS_HINT_MESSAGE = 'Máy hơi chậm, thử chọn Đồ họa: Thấp ở menu';

export const FPS_TOGGLE_KEY = 'F3';

export const GRAPHICS_QUALITY_LABELS = {
  high: 'Cao',
  low: 'Thấp',
} as const;
