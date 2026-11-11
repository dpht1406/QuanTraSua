import assert from 'node:assert/strict';
import { CAT_VARIANTS, pickVariant } from './catVariants.ts';
import { CAT_BASE_HEIGHT } from './constantsCat.ts';
import { FALL_CUSTOMER_LIE_SEC, FALL_DOWN_SEC, FALL_GETUP_SEC } from './constantsThrow.ts';
import { nextCustomerVariantIndex } from '../world/customerVariant.ts';
import { computeFallHitbox, fallPose, MAX_FALL_TILT } from '../world/fallPose.ts';

// Tự kiểm tra GĐ7 Tab 2 (thuần TS, không Three.js): chọn biến thể khách không lặp liên tiếp & hitbox ngã
export function runSelfCheck7b(): void {
  const n = CAT_VARIANTS.length;
  assert.ok(n >= 6);

  // 1. Không để 2 khách liên tiếp trùng biến thể ngay cả ở các biên rng
  for (let prev = 0; prev < n; prev++) {
    for (const r of [0, 0.2, 0.5, 0.999999, 1, -0.5, Number.NaN]) {
      const next = nextCustomerVariantIndex(prev, n, () => r);
      assert.ok(next >= 0 && next < n);
      assert.ok(next !== prev);
      assert.ok(pickVariant(next).id !== pickVariant(prev).id);
    }
  }

  // 2. Chuỗi sinh nhiều khách: không trùng liền kề và phủ đủ 6 biến thể
  let seed = 17;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x80000000;
  };
  let prev: number | null = null;
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const idx = nextCustomerVariantIndex(prev, n, rng);
    const variant = pickVariant(idx);
    if (prev !== null) assert.ok(variant.id !== pickVariant(prev).id);
    seen.add(variant.id);
    prev = idx;
  }
  assert.equal(seen.size, n);
  assert.equal(nextCustomerVariantIndex(0, 1, () => 0.9), 0);

  // 3. Hitbox khách mèo khớp chiều cao 1.56 khi đứng và hạ thấp đúng hướng khi ngã/nằm
  assert.equal(CAT_BASE_HEIGHT, 1.56);
  const stand = computeFallHitbox(0, 0, 0.28, CAT_BASE_HEIGHT, 0, 0, { x: 0, z: 1 });
  assert.equal(stand.maxY, 1.56);

  const fallDur = FALL_DOWN_SEC + FALL_CUSTOMER_LIE_SEC + FALL_GETUP_SEC;
  const lie = fallPose(FALL_DOWN_SEC + 0.5, fallDur);
  assert.equal(lie.phase, 'lie');
  assert.ok(Math.abs(lie.tiltRad - MAX_FALL_TILT) < 1e-6);
  const lieBox = computeFallHitbox(-0.25, -0.45, 0.28, CAT_BASE_HEIGHT, lie.tiltRad, lie.dropY, { x: 0, z: 1 });
  assert.ok(lieBox.maxY < 0.5);
  assert.ok(lieBox.maxZ > -0.45 + 1.56);
}
