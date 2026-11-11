import { FALL_DOWN_SEC, FALL_GETUP_SEC } from '../state/constantsThrow.ts';

export type FallPhase = 'down' | 'lie' | 'up' | 'done';

export interface FallPoseResult {
  tiltRad: number;
  dropY: number;
  phase: FallPhase;
}

export interface FallDir {
  x: number;
  z: number;
}

export const MAX_FALL_TILT = Math.PI / 2;
const FALL_BODY_OFFSET_Y = 0.18;
const LYING_BODY_PAD_Y = 0.24;

// Chia thời lượng các pha ngã, nằm, đứng dậy và co theo tỉ lệ nếu tổng thời gian ngắn
export function computeFallDurations(dur: number): { downSec: number; upSec: number; lieSec: number } {
  if (dur <= 0) return { downSec: 0, upSec: 0, lieSec: 0 };
  const baseSum = FALL_DOWN_SEC + FALL_GETUP_SEC;
  if (dur <= baseSum) {
    const scale = dur / baseSum;
    return { downSec: FALL_DOWN_SEC * scale, upSec: FALL_GETUP_SEC * scale, lieSec: 0 };
  }
  return { downSec: FALL_DOWN_SEC, upSec: FALL_GETUP_SEC, lieSec: dur - baseSum };
}

// Tính góc nghiêng và độ cao gốc nhân vật theo thời gian ngã thuần TS
export function fallPose(t: number, dur: number): FallPoseResult {
  if (dur <= 0 || t >= dur) return { tiltRad: 0, dropY: 0, phase: 'done' };
  const clamped = Math.max(0, t);
  const { downSec, upSec } = computeFallDurations(dur);
  const lieEnd = Math.max(downSec, dur - upSec);

  if (clamped < downSec && downSec > 0) {
    const u = clamped / downSec;
    const tiltRad = MAX_FALL_TILT * (1 - (1 - u) * (1 - u));
    return { tiltRad, dropY: FALL_BODY_OFFSET_Y * Math.sin(tiltRad), phase: 'down' };
  }
  if (clamped < lieEnd) {
    return { tiltRad: MAX_FALL_TILT, dropY: FALL_BODY_OFFSET_Y, phase: 'lie' };
  }
  const v = upSec > 0 ? (clamped - lieEnd) / upSec : 1;
  const smooth = v * v * (3 - 2 * v);
  const tiltRad = MAX_FALL_TILT * (1 - smooth);
  return { tiltRad, dropY: FALL_BODY_OFFSET_Y * Math.sin(tiltRad), phase: 'up' };
}

// Quy đổi hướng ngã chuẩn hóa trên mặt phẳng XZ hoặc ngã ngửa ra sau nếu không có hướng bay
export function resolveFallDir(hitDir: FallDir | undefined, baseYaw: number): FallDir {
  if (hitDir) {
    const len = Math.hypot(hitDir.x, hitDir.z);
    if (len > 1e-4) return { x: hitDir.x / len, z: hitDir.z / len };
  }
  const x = -Math.sin(baseYaw);
  const z = -Math.cos(baseYaw);
  return { x: Math.abs(x) < 1e-9 ? 0 : x, z: Math.abs(z) < 1e-9 ? 0 : z };
}

// Quy đổi góc nghiêng hiện tại về thời điểm tương ứng trong pha ngã để nối mượt khi trúng tiếp
export function timeForDownTilt(tiltRad: number, dur: number): number {
  const { downSec } = computeFallDurations(dur);
  const ratio = Math.min(1, Math.max(0, tiltRad / MAX_FALL_TILT));
  const u = 1 - Math.sqrt(Math.max(0, 1 - ratio));
  return u * downSec;
}

// Tính hộp va chạm hạ thấp theo tư thế đang ngã hoặc nằm của nhân vật
export function computeFallHitbox(
  x: number,
  z: number,
  halfW: number,
  height: number,
  tiltRad: number,
  dropY: number,
  dir: FallDir,
) {
  const sinT = Math.sin(tiltRad);
  const cosT = Math.cos(tiltRad);
  const headX = x + dir.x * height * sinT;
  const headZ = z + dir.z * height * sinT;
  const headY = dropY + height * cosT;
  return {
    minX: Math.min(x, headX) - halfW,
    maxX: Math.max(x, headX) + halfW,
    minY: 0,
    maxY: Math.max(dropY, headY) + LYING_BODY_PAD_Y * sinT,
    minZ: Math.min(z, headZ) - halfW,
    maxZ: Math.max(z, headZ) + halfW,
  };
}
