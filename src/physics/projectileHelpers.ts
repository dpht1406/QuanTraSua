import type RAPIER from '@dimforge/rapier3d-compat';
import { STAFF_CANDIDATES } from '../state/constants.ts';
import type { ThrowObjectKind } from '../state/gameState.ts';
import type { Cup } from '../state/scoring.ts';
import type { StaffRole } from '../state/staff.ts';
import type { ThrowConsequence, ThrowTarget } from '../state/throwConsequence.ts';
import * as P from './constantsPhysics.ts';
import type { BodyTag, ColliderPartDesc, QuatLike, Vec3Like } from './physicsTypes.ts';

export interface ProjectileBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface ProjectileSpawnInput {
  kind: ThrowObjectKind;
  cup?: Cup;
  pos: Vec3Like;
  vel: Vec3Like;
  power: number;
  yaw?: number;
}

export interface ProjectileSimItem {
  id: number;
  kind: ThrowObjectKind;
  cup?: Cup;
  body: RAPIER.RigidBody | null;
  pos: Vec3Like;
  vel: Vec3Like;
  power: number;
  yaw: number;
}

export interface LandedProjectileItem {
  id: number;
  kind: ThrowObjectKind;
  cup?: Cup;
  body: RAPIER.RigidBody | null;
  pos: Vec3Like;
  yaw: number;
}

export type ProjectileSimEvent =
  | {
      type: 'hit';
      item: ProjectileSimItem;
      target: ThrowTarget;
      consequence: ThrowConsequence;
      impulse: number;
      staffId?: string;
      staffRole?: StaffRole;
      hitVel: Vec3Like;
    }
  | { type: 'landed'; item: LandedProjectileItem }
  | { type: 'lost'; id: number; kind: ThrowObjectKind; reason: 'bounds' | 'stuck' | 'capacity' }
  | { type: 'evictedLanded'; item: LandedProjectileItem };

export interface ProjectileStepOptions {
  customerTargetable?: boolean;
}

export interface ProjectileSim {
  computeSafeSpawn(origin: Vec3Like, desired: Vec3Like, kind: ThrowObjectKind): Vec3Like;
  spawn(input: ProjectileSpawnInput): { item: ProjectileSimItem; lost?: ProjectileSimEvent };
  step(
    dt: number,
    bounds?: ProjectileBounds,
    customerAtCounter?: boolean,
    opts?: ProjectileStepOptions,
  ): ProjectileSimEvent[];
  removeLanded(id: number): LandedProjectileItem | null;
  clearAll(): { flying: ProjectileSimItem[]; landed: LandedProjectileItem[] };
  getFlying(): readonly ProjectileSimItem[];
  getLanded(): readonly LandedProjectileItem[];
  dispose(): void;
}

export const BOUNDS_MARGIN = 0.08;

export function yawPitchToQuat(yaw: number, pitch: number): QuatLike {
  const cy = Math.cos(yaw * 0.5);
  const sy = Math.sin(yaw * 0.5);
  const cp = Math.cos(pitch * 0.5);
  const sp = Math.sin(pitch * 0.5);
  return { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp };
}

export function getMassAndRestitution(kind: ThrowObjectKind): { mass: number; restitution: number } {
  if (kind === 'cup') return { mass: P.CUP_MASS, restitution: P.CUP_RESTITUTION };
  return { mass: kind === 'broom' ? P.BROOM_MASS : P.MOP_MASS, restitution: P.TOOL_RESTITUTION };
}

export function buildToolColliders(kind: 'broom' | 'mop', mass: number): ColliderPartDesc[] {
  const headShape =
    kind === 'broom'
      ? ({ type: 'box', hx: 0.13, hy: 0.08, hz: 0.03 } as const)
      : ({ type: 'box', hx: 0.145, hy: 0.065, hz: 0.07 } as const);
  return [
    { shape: { type: 'capsule', halfHeight: 0.41, radius: 0.025 }, offset: { x: 0, y: 0.16, z: 0 }, mass: mass * 0.45 },
    { shape: headShape, offset: { x: 0, y: kind === 'broom' ? -0.31 : -0.305, z: 0 }, mass: mass * 0.55 },
  ];
}

export function isOutOfBounds(pos: Vec3Like, b: ProjectileBounds, margin = BOUNDS_MARGIN): boolean {
  return (
    pos.x < b.minX - margin ||
    pos.x > b.maxX + margin ||
    pos.y < b.minY - margin ||
    pos.y > b.maxY + margin ||
    pos.z < b.minZ - margin ||
    pos.z > b.maxZ + margin
  );
}

export function resolveStaffInfo(tag: BodyTag): { staffId?: string; staffRole?: StaffRole } {
  const staffId = tag.id !== undefined ? String(tag.id) : undefined;
  const metaRole = tag.meta?.staffRole ?? tag.meta?.role;
  if (metaRole === 'cleaner' || metaRole === 'barista') return { staffId, staffRole: metaRole };
  const cand = staffId ? STAFF_CANDIDATES.find((c) => c.id === staffId) : undefined;
  return { staffId, staffRole: cand?.role };
}
