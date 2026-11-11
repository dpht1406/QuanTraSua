import assert from 'node:assert/strict';
import { CAT_VARIANTS } from './catVariants.ts';
import { CAT_BASE_HEIGHT, CAT_HEAD_RADIUS, CAT_HEAD_SCALE, CAT_HEAD_Y } from './constantsCat.ts';
import { OUTLINE_ENABLED } from './constantsGraphics.ts';

// Tự kiểm tra phần state thuần cho mèo & đồ họa GĐ8a Tab 3 (không import Three.js)
export function runSelfCheck8c(): void {
  assert.equal(OUTLINE_ENABLED, false);
  assert.equal(CAT_VARIANTS.length, 6);
  assert.equal(CAT_BASE_HEIGHT, 1.56);
  const skullTopY = CAT_HEAD_Y + CAT_HEAD_RADIUS * CAT_HEAD_SCALE.y;
  assert.ok(skullTopY < CAT_BASE_HEIGHT, 'Đỉnh đầu phải thấp hơn chiều cao tổng kèm tai');
}
