import assert from 'node:assert/strict';
import {
  computeFallDurations,
  computeFallHitbox,
  fallPose,
  MAX_FALL_TILT,
  resolveFallDir,
  timeForDownTilt,
} from '../world/fallPose.ts';
import { FALL_CUSTOMER_LIE_SEC, FALL_DOWN_SEC, FALL_GETUP_SEC, STUN_SEC } from './constantsThrow.ts';

// Tự kiểm tra GĐ6.1: các pha ngã/nằm/đứng dậy, co pha khi STUN_SEC ngắn, hướng ngã mặc định và hitbox nằm
export function runSelfCheck6f(): void {
  // 1. Tổng thời gian ngã + đứng dậy nằm trong STUN_SEC và thời gian nằm khách > 0
  assert.ok(FALL_DOWN_SEC + FALL_GETUP_SEC <= STUN_SEC);
  assert.ok(FALL_CUSTOMER_LIE_SEC > 0);

  // 2. Tư thế theo thời gian: t=0, giữa pha ngã, pha nằm, đầu/giữa/cuối pha đứng dậy
  const p0 = fallPose(0, STUN_SEC);
  assert.equal(p0.phase, 'down');
  assert.equal(p0.tiltRad, 0);
  assert.equal(p0.dropY, 0);

  const pMidDown = fallPose(FALL_DOWN_SEC * 0.5, STUN_SEC);
  assert.equal(pMidDown.phase, 'down');
  assert.ok(pMidDown.tiltRad > 0 && pMidDown.tiltRad < MAX_FALL_TILT);
  assert.ok(pMidDown.dropY > 0);

  const pLie = fallPose(FALL_DOWN_SEC + 0.5, STUN_SEC);
  assert.equal(pLie.phase, 'lie');
  assert.ok(Math.abs(pLie.tiltRad - MAX_FALL_TILT) < 1e-6);
  assert.ok(pLie.dropY > 0);

  const pUpStart = fallPose(STUN_SEC - FALL_GETUP_SEC, STUN_SEC);
  assert.equal(pUpStart.phase, 'up');
  assert.ok(Math.abs(pUpStart.tiltRad - MAX_FALL_TILT) < 1e-6);

  const pUpMid = fallPose(STUN_SEC - FALL_GETUP_SEC * 0.5, STUN_SEC);
  assert.equal(pUpMid.phase, 'up');
  assert.ok(pUpMid.tiltRad > 0 && pUpMid.tiltRad < MAX_FALL_TILT);

  const pEnd = fallPose(STUN_SEC, STUN_SEC);
  assert.equal(pEnd.phase, 'done');
  assert.equal(pEnd.tiltRad, 0);
  assert.equal(pEnd.dropY, 0);

  // 3. Co tỉ lệ các pha khi tổng thời gian ngắn hơn FALL_DOWN_SEC + FALL_GETUP_SEC
  const shortDur = 0.5;
  const scaled = computeFallDurations(shortDur);
  assert.ok(scaled.downSec + scaled.upSec <= shortDur + 1e-9);
  assert.equal(scaled.lieSec, 0);
  assert.ok(Math.abs(scaled.downSec / scaled.upSec - FALL_DOWN_SEC / FALL_GETUP_SEC) < 1e-6);
  assert.ok(fallPose(scaled.downSec * 0.5, shortDur).phase === 'down');
  assert.equal(fallPose(shortDur, shortDur).phase, 'done');

  // 4. Hướng ngã theo hướng bay XZ và hướng mặc định ngã ngửa ra sau khi không có hướng bay
  assert.deepEqual(resolveFallDir(undefined, 0), { x: 0, z: -1 });
  const backAtPi = resolveFallDir(undefined, Math.PI);
  assert.ok(Math.abs(backAtPi.x) < 1e-6 && Math.abs(backAtPi.z - 1) < 1e-6);
  assert.deepEqual(resolveFallDir({ x: 0, z: 0 }, 0), { x: 0, z: -1 });

  const angled = resolveFallDir({ x: 3, z: 4 }, 0);
  assert.ok(Math.abs(angled.x - 0.6) < 1e-6 && Math.abs(angled.z - 0.8) < 1e-6);

  // 5. Nối mượt khi bị trúng lại lúc đang đứng dậy (không bật về 0°)
  const tDown = timeForDownTilt(pUpMid.tiltRad, STUN_SEC);
  assert.ok(Math.abs(fallPose(tDown, STUN_SEC).tiltRad - pUpMid.tiltRad) < 1e-5);

  // 6. Hitbox hạ thấp khi nằm và duỗi theo hướng ngã
  const standBox = computeFallHitbox(0, 0, 0.28, 1.32, 0, 0, { x: 0, z: 1 });
  assert.equal(standBox.maxY, 1.32);
  const lieBox = computeFallHitbox(0, 0, 0.28, 1.32, MAX_FALL_TILT, pLie.dropY, { x: 0, z: 1 });
  assert.ok(lieBox.maxY < 0.5);
  assert.ok(lieBox.maxZ > 1.32);
}
