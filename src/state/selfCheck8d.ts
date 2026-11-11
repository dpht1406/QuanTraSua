import assert from 'node:assert/strict';
import {
  FPS_AVG_WINDOW_SEC,
  FPS_TOGGLE_KEY,
  FPS_WARMUP_SEC,
  GRAPHICS_QUALITY_LABELS,
  LOW_FPS_HINT_MESSAGE,
  LOW_FPS_SUSTAIN_SEC,
  LOW_FPS_THRESHOLD,
  MAX_FPS_FRAME_DT_SEC,
} from './constantsGraphicsUi.ts';
import { createLowFpsHintTracker, createRollingFps } from './fpsHint.ts';

function testRollingFps(): void {
  const rolling = createRollingFps(FPS_AVG_WINDOW_SEC);
  assert.equal(rolling.getAverage(), null);
  assert.equal(rolling.getSampleDuration(), 0);

  // Giá trị dt không hợp lệ không làm hỏng trạng thái
  assert.equal(rolling.push(0), null);
  assert.equal(rolling.push(-0.1), null);
  assert.equal(rolling.push(Number.NaN), null);
  assert.equal(rolling.push(Number.POSITIVE_INFINITY), null);

  for (let i = 0; i < 90; i++) rolling.push(1 / 60);
  const fps60 = rolling.getAverage()!;
  assert.ok(Math.abs(fps60 - 60) < 1, `Kỳ vọng ~60 FPS, nhận ${fps60}`);
  assert.ok(rolling.getSampleDuration() <= FPS_AVG_WINDOW_SEC + 1 / 60 + 1e-6);

  // Đẩy thêm khung hình chậm 20 FPS trong >1s -> cửa sổ trượt loại bỏ mẫu cũ và hội tụ về ~20 FPS
  for (let i = 0; i < 25; i++) rolling.push(0.05);
  const fps20 = rolling.getAverage()!;
  assert.ok(Math.abs(fps20 - 20) < 1, `Kỳ vọng ~20 FPS sau trượt cửa sổ, nhận ${fps20}`);

  rolling.reset();
  assert.equal(rolling.getAverage(), null);
  assert.equal(rolling.getSampleDuration(), 0);
}

function testLowFpsHintTracker(): void {
  // 1. Ở mức Thấp không bao giờ gợi ý và luôn reset bộ đếm
  const tracker = createLowFpsHintTracker();
  for (let i = 0; i < 200; i++) {
    assert.equal(tracker.update(15, 0.05, 'low'), false);
  }
  assert.equal(tracker.hasTriggered(), false);
  assert.equal(tracker.getLowDuration(), 0);

  // 2. Hồi phục >= 30 FPS trước ngưỡng 5s -> reset về 0, không kích hoạt
  for (let i = 0; i < 80; i++) assert.equal(tracker.update(25, 0.05, 'high'), false); // 4s
  assert.ok(tracker.getLowDuration() >= 3.99);
  assert.equal(tracker.update(LOW_FPS_THRESHOLD, 0.05, 'high'), false);
  assert.equal(tracker.getLowDuration(), 0);

  // 3. Chuyển sang 'low' giữa chừng hoặc ngắt quãng dài (chuyển tab) -> reset bộ đếm
  for (let i = 0; i < 80; i++) assert.equal(tracker.update(22, 0.05, 'high'), false);
  assert.equal(tracker.update(22, 0.05, 'low'), false);
  assert.equal(tracker.getLowDuration(), 0);

  for (let i = 0; i < 80; i++) assert.equal(tracker.update(22, 0.05, 'high'), false);
  assert.equal(tracker.update(10, MAX_FPS_FRAME_DT_SEC + 0.5, 'high'), false);
  assert.equal(tracker.getLowDuration(), 0);

  // 4. Dữ liệu lỗi / null không làm sập hay kích hoạt nhầm
  assert.equal(tracker.update(null, 0.05, 'high'), false);
  assert.equal(tracker.update(Number.NaN, 0.05, 'high'), false);
  assert.equal(tracker.update(20, 0, 'high'), false);
  assert.equal(tracker.update(20, -1, 'high'), false);

  // 5. < 30 FPS liên tục >= 5s ở mức Cao -> bật 1 lần duy nhất trong suốt phiên chạy
  let triggers = 0;
  for (let i = 0; i < 120; i++) {
    if (tracker.update(24, 0.05, 'high')) triggers++;
  }
  assert.equal(triggers, 1);
  assert.equal(tracker.hasTriggered(), true);

  // Hồi phục rồi tụt lại vẫn không hiện lần thứ 2
  assert.equal(tracker.update(60, 0.05, 'high'), false);
  for (let i = 0; i < 200; i++) {
    assert.equal(tracker.update(12, 0.05, 'high'), false);
  }
}

function testCombinedSimulation(): void {
  const rolling = createRollingFps(FPS_AVG_WINDOW_SEC);
  const tracker = createLowFpsHintTracker();

  // Giả lập khựng nhẹ khung đầu 0.15s rồi chạy 60 FPS ổn định -> không báo nhầm
  const startupDts = [0.15, ...Array.from({ length: 180 }, () => 1 / 60)];
  for (const dt of startupDts) {
    const avg = rolling.push(dt);
    const ready = rolling.getSampleDuration() >= FPS_WARMUP_SEC ? avg : null;
    assert.equal(tracker.update(ready, dt, 'high'), false);
  }

  // Giả lập máy yếu 24 FPS liên tục -> kích hoạt đúng 1 lần quanh ~5s
  rolling.reset();
  let triggerElapsed = 0;
  let elapsed = 0;
  let triggerCount = 0;
  for (let i = 0; i < 240; i++) {
    const dt = 1 / 24;
    elapsed += dt;
    const avg = rolling.push(dt);
    const ready = rolling.getSampleDuration() >= FPS_WARMUP_SEC ? avg : null;
    if (tracker.update(ready, dt, 'high')) {
      triggerCount++;
      triggerElapsed = elapsed;
    }
  }
  assert.equal(triggerCount, 1);
  assert.ok(
    triggerElapsed >= LOW_FPS_SUSTAIN_SEC && triggerElapsed <= LOW_FPS_SUSTAIN_SEC + 1,
    `Thời điểm gợi ý (${triggerElapsed.toFixed(2)}s) phải quanh ~5s`,
  );
}

// Tự kiểm tra phần logic thuần TS của GĐ8a Tab 4 (FPS trung bình trượt & gợi ý hạ đồ họa)
export function runSelfCheck8d(): void {
  assert.equal(FPS_AVG_WINDOW_SEC, 1.0);
  assert.equal(LOW_FPS_THRESHOLD, 30);
  assert.equal(LOW_FPS_SUSTAIN_SEC, 5.0);
  assert.equal(LOW_FPS_HINT_MESSAGE, 'Máy hơi chậm, thử chọn Đồ họa: Thấp ở menu');
  assert.equal(FPS_TOGGLE_KEY, 'F3');
  assert.equal(GRAPHICS_QUALITY_LABELS.high, 'Cao');
  assert.equal(GRAPHICS_QUALITY_LABELS.low, 'Thấp');

  testRollingFps();
  testLowFpsHintTracker();
  testCombinedSimulation();
}
