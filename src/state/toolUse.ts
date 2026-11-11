import type { StainItem, StainKind } from './cleanliness.ts';
import { STAIN_AIM_HEIGHT, TOOL_AIM_COS, TOOL_RANGE } from './constantsTools.ts';
import type { HeldItemKind } from './hands.ts';
import type { ToolKind } from './toolLocations.ts';

export type ToolHint = 'Cần chổi' | 'Cần cây lau nhà';
export type ToolUseResult = { ok: true } | { ok: false; hint: ToolHint };

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

// Trả về dụng cụ cần thiết cho từng loại vết bẩn (thùng rác đầy không cần dụng cụ)
export function requiredTool(stainType: StainKind): ToolKind | null {
  if (stainType === 'trash') return 'broom';
  if (stainType === 'spill' || stainType === 'dirty_table') return 'mop';
  return null;
}

// Kiểm tra vật đang cầm có dọn được loại vết bẩn hay trả về gợi ý dụng cụ cần
export function checkToolUse(heldKind: HeldItemKind | null, stainType: StainKind): ToolUseResult {
  const needed = requiredTool(stainType);
  if (needed === null || heldKind === needed) return { ok: true };
  return { ok: false, hint: needed === 'broom' ? 'Cần chổi' : 'Cần cây lau nhà' };
}

// Kiểm tra một vết bẩn có nằm trong tầm dụng cụ và nón nhìn từ vị trí/hướng camera không
export function isStainInAim(
  origin: Vec3Like,
  dir: Vec3Like,
  stain: Pick<StainItem, 'kind' | 'x' | 'z'>,
  range = TOOL_RANGE,
  minCos = TOOL_AIM_COS,
): { ok: boolean; dot: number; dist: number } {
  const dx = stain.x - origin.x;
  const dy = STAIN_AIM_HEIGHT[stain.kind] - origin.y;
  const dz = stain.z - origin.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > range) return { ok: false, dot: -1, dist };
  if (dist < 1e-6) return { ok: true, dot: 1, dist: 0 };

  const dirLen = Math.hypot(dir.x, dir.y, dir.z);
  if (dirLen < 1e-6) return { ok: false, dot: -1, dist };
  const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (dist * dirLen);
  return { ok: dot >= minCos, dot, dist };
}

// Chọn vết bẩn cần dùng dụng cụ nằm gần tâm ngắm nhất trong tầm và nón nhìn
export function findAimedStain(
  origin: Vec3Like,
  dir: Vec3Like,
  stains: readonly StainItem[],
  range = TOOL_RANGE,
  minCos = TOOL_AIM_COS,
): StainItem | null {
  let best: StainItem | null = null;
  let bestDot = -Infinity;
  let bestDist = Infinity;

  for (const stain of stains) {
    if (requiredTool(stain.kind) === null) continue;
    const hit = isStainInAim(origin, dir, stain, range, minCos);
    if (!hit.ok) continue;
    if (hit.dot > bestDot || (hit.dot === bestDot && hit.dist < bestDist)) {
      best = stain;
      bestDot = hit.dot;
      bestDist = hit.dist;
    }
  }
  return best;
}
