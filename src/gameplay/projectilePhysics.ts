import {
  CUP_RADIUS,
  MAX_FLIGHT_SEC,
  MAX_FLYING,
  MAX_LANDED,
  SETTLE_VY,
  STUCK_SEC,
  STUCK_SPEED,
  THROW_GRAVITY,
  TOOL_BOUNCE,
  TOOL_FRICTION,
  TOOL_RADIUS,
} from '../state/constantsThrow.ts';
import type { ThrowObjectKind } from '../state/gameState.ts';
import type { Cup } from '../state/scoring.ts';
import type { StaffRole } from '../state/staff.ts';
import { resolveThrow, type ThrowConsequence, type ThrowTarget } from '../state/throwConsequence.ts';

export interface Vec3 { x: number; y: number; z: number }
export interface Box3D { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
export type SurfaceKind = 'floor' | 'wall' | 'table' | 'counter' | 'bin';
export interface PhysicsSurface { aabb: Box3D; kind: SurfaceKind }
export interface ActorHitbox { id: string; target: 'customer' | 'staff'; aabb: Box3D; staffRole?: StaffRole }

export interface ProjectileItem {
  id: number;
  kind: ThrowObjectKind;
  cup?: Cup;
  pos: Vec3;
  vel: Vec3;
  power: number;
  radius: number;
  yaw: number;
  stuckSec: number;
  flightSec: number;
  hitActorIds: Set<string>;
  lastEmittedTarget: ThrowTarget | null;
}

export interface LandedProjectile { id: number; kind: ThrowObjectKind; cup?: Cup; pos: Vec3; yaw: number }
export interface SpawnProjectileInput { kind: ThrowObjectKind; cup?: Cup; pos: Vec3; vel: Vec3; power: number; yaw?: number }

export type PhysicsEvent =
  | { type: 'hit'; item: ProjectileItem; target: ThrowTarget; consequence: ThrowConsequence; staffId?: string; staffRole?: StaffRole; hitVel?: Vec3 }
  | { type: 'landed'; item: LandedProjectile }
  | { type: 'lost'; id: number; kind: ThrowObjectKind; reason: 'bounds' | 'stuck' | 'capacity' }
  | { type: 'evictedLanded'; item: LandedProjectile };

const EPS = 0.002;
const MAX_STEP_DIST = 0.04;
const MAX_SUBSTEPS = 16;

interface SweepHit { t: number; normal: Vec3; pushOut?: number }

function sweepExpandedAabb(o: Vec3, d: Vec3, box: Box3D, r: number): SweepHit | null {
  const minX = box.minX - r, maxX = box.maxX + r;
  const minY = box.minY - r, maxY = box.maxY + r;
  const minZ = box.minZ - r, maxZ = box.maxZ + r;

  if (o.x > minX && o.x < maxX && o.y > minY && o.y < maxY && o.z > minZ && o.z < maxZ) {
    const gaps = [
      { pen: o.x - minX, n: { x: -1, y: 0, z: 0 } },
      { pen: maxX - o.x, n: { x: 1, y: 0, z: 0 } },
      { pen: o.y - minY, n: { x: 0, y: -1, z: 0 } },
      { pen: maxY - o.y, n: { x: 0, y: 1, z: 0 } },
      { pen: o.z - minZ, n: { x: 0, y: 0, z: -1 } },
      { pen: maxZ - o.z, n: { x: 0, y: 0, z: 1 } },
    ];
    let best = gaps[0];
    for (let i = 1; i < gaps.length; i++) if (gaps[i].pen < best.pen) best = gaps[i];
    const dot = d.x * best.n.x + d.y * best.n.y + d.z * best.n.z;
    return dot <= 0 ? { t: 0, normal: best.n, pushOut: best.pen + EPS } : null;
  }

  let tEnter = 0, tExit = 1;
  let normal: Vec3 = { x: 0, y: 0, z: 0 };
  const axes: Array<[number, number, number, number, Vec3, Vec3]> = [
    [o.x, d.x, minX, maxX, { x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
    [o.y, d.y, minY, maxY, { x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }],
    [o.z, d.z, minZ, maxZ, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }],
  ];
  for (const [p, v, lo, hi, nLo, nHi] of axes) {
    if (Math.abs(v) < 1e-8) {
      if (p <= lo || p >= hi) return null;
      continue;
    }
    const t1 = (lo - p) / v, t2 = (hi - p) / v;
    const tNear = t1 < t2 ? t1 : t2, tFar = t1 < t2 ? t2 : t1;
    if (tNear > tEnter) { tEnter = tNear; normal = v > 0 ? nLo : nHi; }
    if (tFar < tExit) tExit = tFar;
    if (tEnter > tExit) return null;
  }
  return tEnter >= 0 && tEnter <= 1 ? { t: tEnter, normal } : null;
}

// Kiểm tra tọa độ vật có nằm ngoài biên quán hay không
export function isOutsideBounds(pos: Vec3, b: Box3D): boolean {
  return pos.x < b.minX || pos.x > b.maxX || pos.y < b.minY || pos.y > b.maxY || pos.z < b.minZ || pos.z > b.maxZ;
}

// Tính điểm thả/ném an toàn để không xuất hiện xuyên vào tường hoặc bàn
export function computeSafeSpawn(
  origin: Vec3,
  desired: Vec3,
  kind: ThrowObjectKind,
  surfaces: readonly PhysicsSurface[],
): Vec3 {
  const r = kind === 'cup' ? CUP_RADIUS : TOOL_RADIUS;
  const d = { x: desired.x - origin.x, y: desired.y - origin.y, z: desired.z - origin.z };
  let bestT = 1;
  let bestN: Vec3 | null = null;
  for (const s of surfaces) {
    const hit = sweepExpandedAabb(origin, d, s.aabb, r);
    if (hit && hit.t < bestT) {
      bestT = hit.t;
      bestN = hit.normal;
    }
  }
  if (!bestN) return desired;
  const t = Math.max(0, bestT - 0.05);
  return { x: origin.x + d.x * t + bestN.x * EPS, y: origin.y + d.y * t + bestN.y * EPS, z: origin.z + d.z * t + bestN.z * EPS };
}

// Mô phỏng vật lý ném/thả thuần (parabol, nảy nhẹ cho dụng cụ, va chạm AABB và giới hạn số lượng)
export function createProjectileWorld() {
  // shortcut: không va chạm giữa các vật, không lăn, khi nào nâng cấp (cannon-es nếu thật cần)
  let nextId = 1;
  const flying: ProjectileItem[] = [];
  const landed: LandedProjectile[] = [];

  const toLanded = (p: ProjectileItem, events: PhysicsEvent[]) => {
    while (landed.length >= MAX_LANDED) {
      const oldest = landed.shift();
      if (oldest) events.push({ type: 'evictedLanded', item: oldest });
    }
    const item: LandedProjectile = { id: p.id, kind: p.kind, cup: p.cup, pos: { ...p.pos }, yaw: p.yaw };
    landed.push(item);
    events.push({ type: 'landed', item });
  };

  const spawn = (input: SpawnProjectileInput): { item: ProjectileItem; lost?: PhysicsEvent } => {
    let lost: PhysicsEvent | undefined;
    if (flying.length >= MAX_FLYING) {
      const oldest = flying.shift();
      if (oldest) lost = { type: 'lost', id: oldest.id, kind: oldest.kind, reason: 'capacity' };
    }
    const item: ProjectileItem = {
      id: nextId++,
      kind: input.kind,
      cup: input.cup,
      pos: { ...input.pos },
      vel: { ...input.vel },
      power: input.power,
      radius: input.kind === 'cup' ? CUP_RADIUS : TOOL_RADIUS,
      yaw: input.yaw ?? 0,
      stuckSec: 0,
      flightSec: 0,
      hitActorIds: new Set(),
      lastEmittedTarget: null,
    };
    flying.push(item);
    return { item, lost };
  };

  const step = (
    dt: number,
    surfaces: readonly PhysicsSurface[],
    bounds: Box3D,
    actors: readonly ActorHitbox[],
    customerAtCounter: boolean,
  ): PhysicsEvent[] => {
    const events: PhysicsEvent[] = [];
    if (dt <= 0) return events;

    for (let idx = flying.length - 1; idx >= 0; idx--) {
      const p = flying[idx];
      p.flightSec += dt;
      const startPos = { ...p.pos };
      const speedEst = Math.hypot(p.vel.x, p.vel.y, p.vel.z) + THROW_GRAVITY * dt;
      const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil((speedEst * dt) / MAX_STEP_DIST)));
      const subDt = dt / steps;
      let removed = false;

      for (let s = 0; s < steps && !removed; s++) {
        p.vel.y -= THROW_GRAVITY * subDt;
        const delta = { x: p.vel.x * subDt, y: p.vel.y * subDt, z: p.vel.z * subDt };
        let best: { hit: SweepHit; target: ThrowTarget; actor?: ActorHitbox } | null = null;

        for (const actor of actors) {
          if (p.hitActorIds.has(actor.id)) continue;
          const hit = sweepExpandedAabb(p.pos, delta, actor.aabb, p.radius);
          if (hit && (!best || hit.t < best.hit.t)) best = { hit, target: actor.target, actor };
        }
        for (const surf of surfaces) {
          const hit = sweepExpandedAabb(p.pos, delta, surf.aabb, p.radius);
          if (hit && (!best || hit.t < best.hit.t)) best = { hit, target: surf.kind };
        }

        if (!best) {
          p.pos.x += delta.x;
          p.pos.y += delta.y;
          p.pos.z += delta.z;
          continue;
        }

        const { hit, target, actor } = best;
        const n = hit.normal;
        const push = hit.pushOut ?? EPS;
        p.pos.x += delta.x * hit.t + n.x * push;
        p.pos.y += delta.y * hit.t + n.y * push;
        p.pos.z += delta.z * hit.t + n.z * push;

        if (actor) p.hitActorIds.add(actor.id);
        const consequence = resolveThrow({ kind: p.kind, target, power: p.power, customerAtCounter });
        if (actor || p.lastEmittedTarget !== target) {
          p.lastEmittedTarget = target;
          events.push({ type: 'hit', item: p, target, consequence, staffId: actor?.id, staffRole: actor?.staffRole, hitVel: { ...p.vel } });
        }
        if (consequence.broken || consequence.binDiscard) {
          flying.splice(idx, 1);
          removed = true;
          break;
        }

        const isTopFace = n.y > 0.5;
        if (p.kind === 'cup') {
          if (consequence.restOnSurface && isTopFace) {
            p.vel.x = p.vel.y = p.vel.z = 0;
            flying.splice(idx, 1);
            toLanded(p, events);
            removed = true;
            break;
          }
          p.vel.x *= 0.15;
          p.vel.z *= 0.15;
          if (p.vel.y > 0) p.vel.y = 0;
        } else {
          const vn = p.vel.x * n.x + p.vel.y * n.y + p.vel.z * n.z;
          if (vn < 0) {
            p.vel.x -= (1 + TOOL_BOUNCE) * vn * n.x;
            p.vel.y -= (1 + TOOL_BOUNCE) * vn * n.y;
            p.vel.z -= (1 + TOOL_BOUNCE) * vn * n.z;
          }
          if (isTopFace) {
            p.vel.x *= TOOL_FRICTION;
            p.vel.z *= TOOL_FRICTION;
            if ((consequence.restOnSurface || target === 'table' || target === 'counter') && p.vel.y < SETTLE_VY) {
              p.vel.x = p.vel.y = p.vel.z = 0;
              flying.splice(idx, 1);
              toLanded(p, events);
              removed = true;
              break;
            }
            if (p.vel.y < 0.35) p.vel.y = 0;
          }
        }
      }

      if (removed) continue;
      if (isOutsideBounds(p.pos, bounds)) {
        flying.splice(idx, 1);
        events.push({ type: 'lost', id: p.id, kind: p.kind, reason: 'bounds' });
        continue;
      }

      const moved = Math.hypot(p.pos.x - startPos.x, p.pos.y - startPos.y, p.pos.z - startPos.z);
      const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
      p.stuckSec = moved < STUCK_SPEED * dt || speed < STUCK_SPEED ? p.stuckSec + dt : 0;
      if (p.stuckSec >= STUCK_SEC || p.flightSec >= MAX_FLIGHT_SEC) {
        flying.splice(idx, 1);
        events.push({ type: 'lost', id: p.id, kind: p.kind, reason: 'stuck' });
      }
    }
    return events;
  };

  return {
    spawn,
    step,
    removeLanded(id: number): LandedProjectile | null {
      const idx = landed.findIndex((item) => item.id === id);
      return idx < 0 ? null : landed.splice(idx, 1)[0];
    },
    clearAll: () => ({ flying: flying.splice(0), landed: landed.splice(0) }),
    getFlying: (): readonly ProjectileItem[] => flying,
    getLanded: (): readonly LandedProjectile[] => landed,
  };
}

export type ProjectileWorld = ReturnType<typeof createProjectileWorld>;
