import type RAPIER from '@dimforge/rapier3d-compat';
import { getWorldBounds } from '../core/worldBounds.ts';
import * as T from '../state/constantsThrow.ts';
import type { StaffRole } from '../state/staff.ts';
import { resolveThrow, type ThrowTarget } from '../state/throwConsequence.ts';
import { staticTagToThrowTarget } from './buildStaticWorld.ts';
import { COLLISION_GROUPS, CollisionGroup, groups } from './collisionGroups.ts';
import * as P from './constantsPhysics.ts';
import type { BodyTag, PhysicsWorld, Vec3Like } from './physicsTypes.ts';
import {
  buildToolColliders,
  getMassAndRestitution,
  isOutOfBounds,
  resolveStaffInfo,
  yawPitchToQuat,
  type LandedProjectileItem,
  type ProjectileBounds,
  type ProjectileSim,
  type ProjectileSimEvent,
  type ProjectileSimItem,
  type ProjectileSpawnInput,
  type ProjectileStepOptions,
} from './projectileHelpers.ts';

export type {
  LandedProjectileItem,
  ProjectileBounds,
  ProjectileSim,
  ProjectileSimEvent,
  ProjectileSimItem,
  ProjectileSpawnInput,
  ProjectileStepOptions,
};

interface PendingContact {
  target: ThrowTarget;
  otherTag: BodyTag;
  impulse: number;
  impactSpeed: number;
  hitVel: Vec3Like;
}

interface FlyingEntry {
  item: ProjectileSimItem;
  body: RAPIER.RigidBody;
  lastVel: Vec3Like;
  flightSec: number;
  stuckSec: number;
  settleSec: number;
  hasRestContact: boolean;
  hitActorIds: Set<string>;
  emittedTargets: Set<ThrowTarget>;
  pendingContacts: PendingContact[];
}

const SETTLE_LIN_SPEED = 0.2;
const SETTLE_ANG_SPEED = 0.5;
const SETTLE_HOLD_SEC = 0.15;
const SPAWN_GROUPS = groups(CollisionGroup.PROJECTILE, CollisionGroup.STATIC | CollisionGroup.CHAIR);
const LANDED_GROUPS = groups(CollisionGroup.PROJECTILE, CollisionGroup.STATIC | CollisionGroup.CHAIR);

// Mô phỏng vật lý ném ly, chổi, cây lau bằng thân động Rapier (thay thế projectilePhysics.ts)
export function createProjectileSim(physics: PhysicsWorld): ProjectileSim {
  let nextId = 1;
  const flying: FlyingEntry[] = [];
  const flyingById = new Map<number, FlyingEntry>();
  const landed: LandedProjectileItem[] = [];

  const removeBodySafe = (body: RAPIER.RigidBody | null) => {
    if (body && body.isValid()) physics.removeBody(body.handle);
  };
  const detachFlying = (idx: number, destroyBody: boolean): FlyingEntry => {
    const [entry] = flying.splice(idx, 1);
    flyingById.delete(entry.item.id);
    if (destroyBody) removeBodySafe(entry.body);
    return entry;
  };

  const unsubContact = physics.onContact((tagA, tagB, impulse) => {
    const projTag = tagA.kind === 'projectile' ? tagA : tagB.kind === 'projectile' ? tagB : null;
    const otherTag = projTag === tagA ? tagB : tagA;
    if (!projTag || projTag.id === undefined) return;
    const entry = flyingById.get(Number(projTag.id));
    if (!entry || !entry.body.isValid()) return;
    const target = staticTagToThrowTarget(otherTag.kind);
    if (!target) return;

    const postVel = entry.body.linvel();
    const preVel = entry.lastVel;
    const preSpeed = Math.hypot(preVel.x, preVel.y, preVel.z);
    const postSpeed = Math.hypot(postVel.x, postVel.y, postVel.z);
    const { mass, restitution } = getMassAndRestitution(entry.item.kind);
    const impulseSpeed = impulse > 0 ? impulse / (mass * (1 + restitution)) : 0;
    const impactSpeed = Math.max(preSpeed, postSpeed, impulseSpeed);
    const hitVel = Math.hypot(preVel.x, preVel.z) > 0.1 ? { ...preVel } : { x: postVel.x, y: postVel.y, z: postVel.z };
    entry.pendingContacts.push({ target, otherTag, impulse, impactSpeed, hitVel });
  });

  const promoteToLanded = (entry: FlyingEntry, events: ProjectileSimEvent[]) => {
    while (landed.length >= T.MAX_LANDED) {
      const oldest = landed.shift();
      if (oldest) {
        removeBodySafe(oldest.body);
        events.push({ type: 'evictedLanded', item: oldest });
      }
    }
    if (entry.body.isValid()) {
      for (let i = 0; i < entry.body.numColliders(); i++) entry.body.collider(i).setCollisionGroups(LANDED_GROUPS);
      const p = entry.body.translation();
      entry.item.pos = { x: p.x, y: p.y, z: p.z };
    }
    const item: LandedProjectileItem = {
      id: entry.item.id,
      kind: entry.item.kind,
      cup: entry.item.cup,
      body: entry.body,
      pos: { ...entry.item.pos },
      yaw: entry.item.yaw,
    };
    landed.push(item);
    events.push({ type: 'landed', item });
  };

  return {
    computeSafeSpawn(origin, desired, kind) {
      const dx = desired.x - origin.x, dy = desired.y - origin.y, dz = desired.z - origin.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1e-6) return { ...desired };
      const r = kind === 'cup' ? P.CUP_RADIUS : P.TOOL_RADIUS;
      const hit = physics.raycast(origin, { x: dx, y: dy, z: dz }, dist + r, SPAWN_GROUPS);
      if (!hit) return { ...desired };
      const safeDist = Math.max(0, hit.distance - r - 0.01);
      const inv = 1 / dist;
      return { x: origin.x + dx * inv * safeDist, y: origin.y + dy * inv * safeDist, z: origin.z + dz * inv * safeDist };
    },

    spawn(input) {
      let lost: ProjectileSimEvent | undefined;
      if (flying.length >= T.MAX_FLYING) {
        const oldest = detachFlying(0, true);
        lost = { type: 'lost', id: oldest.item.id, kind: oldest.item.kind, reason: 'capacity' };
      }
      const id = nextId++, yaw = input.yaw ?? 0, isCup = input.kind === 'cup';
      const { mass } = getMassAndRestitution(input.kind);
      const body = physics.addDynamicBody({
        position: input.pos,
        rotation: yawPitchToQuat(yaw, isCup ? 0 : Math.PI * 0.25),
        linvel: input.vel,
        angvel: isCup ? undefined : { x: Math.cos(yaw) * 2.0, y: 0.4, z: -Math.sin(yaw) * 2.0 },
        mass,
        linearDamping: isCup ? P.CUP_LINEAR_DAMPING : P.TOOL_LINEAR_DAMPING,
        angularDamping: isCup ? undefined : P.TOOL_ANGULAR_DAMPING,
        friction: isCup ? P.CUP_FRICTION : P.TOOL_FRICTION,
        restitution: isCup ? P.CUP_RESTITUTION : P.TOOL_RESTITUTION,
        lockRotations: isCup, canSleep: true, ccdEnabled: true,
        collisionGroups: COLLISION_GROUPS.PROJECTILE,
        shape: isCup ? { type: 'cylinder', halfHeight: P.CUP_HALF_HEIGHT, radius: P.CUP_RADIUS } : undefined,
        colliders: isCup ? undefined : buildToolColliders(input.kind as 'broom' | 'mop', mass),
        tag: { kind: 'projectile', id },
      });
      const item: ProjectileSimItem = {
        id, kind: input.kind, cup: input.cup, body, pos: { ...input.pos }, vel: { ...input.vel }, power: input.power, yaw,
      };
      const entry: FlyingEntry = {
        item, body, lastVel: { ...input.vel }, flightSec: 0, stuckSec: 0, settleSec: 0,
        hasRestContact: false, hitActorIds: new Set(), emittedTargets: new Set(), pendingContacts: [],
      };
      flying.push(entry);
      flyingById.set(id, entry);
      return { item, lost };
    },

    step(dt, bounds = getWorldBounds(), customerAtCounter = false, opts) {
      const events: ProjectileSimEvent[] = [];
      if (dt <= 0) return events;

      for (let i = flying.length - 1; i >= 0; i--) {
        const entry = flying[i], { item, body } = entry;
        entry.flightSec += dt;
        if (!body.isValid()) { detachFlying(i, false); continue; }

        const curPos = body.translation();
        item.pos = { x: curPos.x, y: curPos.y, z: curPos.z };

        let removed = false;
        for (const c of entry.pendingContacts.splice(0)) {
          if (c.target === 'customer' && opts?.customerTargetable === false) continue;
          const isActor = c.target === 'customer' || c.target === 'staff';
          let staffId: string | undefined, staffRole: StaffRole | undefined;
          if (isActor) {
            const actorKey = c.target === 'customer' ? 'customer' : String(c.otherTag.id ?? 'staff');
            if (entry.hitActorIds.has(actorKey)) continue;
            entry.hitActorIds.add(actorKey);
            if (c.target === 'staff') ({ staffId, staffRole } = resolveStaffInfo(c.otherTag));
          }
          const consequence = resolveThrow({ kind: item.kind, target: c.target, power: c.impactSpeed, customerAtCounter });
          if (isActor || !entry.emittedTargets.has(c.target)) {
            entry.emittedTargets.add(c.target);
            events.push({ type: 'hit', item, target: c.target, consequence, impulse: c.impulse, staffId, staffRole, hitVel: c.hitVel });
          }
          if (consequence.broken || consequence.binDiscard) { detachFlying(i, true); removed = true; break; }
          if ((item.kind === 'cup' && consequence.restOnSurface) || (item.kind !== 'cup' && (c.target === 'floor' || c.target === 'table' || c.target === 'counter'))) {
            entry.hasRestContact = true;
          }
        }
        if (removed) continue;

        const t = body.translation(), v = body.linvel(), av = body.angvel();
        item.pos = { x: t.x, y: t.y, z: t.z };
        item.vel = { x: v.x, y: v.y, z: v.z };
        entry.lastVel = { x: v.x, y: v.y, z: v.z };

        if (isOutOfBounds(item.pos, bounds)) {
          detachFlying(i, true); events.push({ type: 'lost', id: item.id, kind: item.kind, reason: 'bounds' }); continue;
        }
        const linSpeed = Math.hypot(v.x, v.y, v.z), angSpeed = Math.hypot(av.x, av.y, av.z);
        const settled = entry.hasRestContact && (body.isSleeping() || (linSpeed < SETTLE_LIN_SPEED && angSpeed < SETTLE_ANG_SPEED && (item.kind !== 'cup' || Math.abs(v.y) < 0.1)));
        entry.settleSec = settled ? entry.settleSec + dt : 0;
        if (entry.hasRestContact && (body.isSleeping() || entry.settleSec >= SETTLE_HOLD_SEC)) {
          detachFlying(i, false); promoteToLanded(entry, events); continue;
        }
        entry.stuckSec = linSpeed < T.STUCK_SPEED ? entry.stuckSec + dt : 0;
        if (entry.stuckSec >= T.STUCK_SEC || entry.flightSec >= T.MAX_FLIGHT_SEC) {
          detachFlying(i, true); events.push({ type: 'lost', id: item.id, kind: item.kind, reason: 'stuck' });
        }
      }

      for (let i = landed.length - 1; i >= 0; i--) {
        const l = landed[i];
        if (!l.body || !l.body.isValid()) continue;
        const p = l.body.translation();
        l.pos = { x: p.x, y: p.y, z: p.z };
        if (isOutOfBounds(l.pos, bounds, 0.5)) {
          landed.splice(i, 1); removeBodySafe(l.body);
          events.push({ type: 'lost', id: l.id, kind: l.kind, reason: 'bounds' });
        }
      }
      return events;
    },

    removeLanded(id) {
      const idx = landed.findIndex((item) => item.id === id);
      if (idx < 0) return null;
      const [removed] = landed.splice(idx, 1);
      removeBodySafe(removed.body);
      return removed;
    },

    clearAll() {
      const prevFlying = flying.splice(0).map((e) => { removeBodySafe(e.body); return e.item; });
      flyingById.clear();
      const prevLanded = landed.splice(0).map((l) => { removeBodySafe(l.body); return l; });
      return { flying: prevFlying, landed: prevLanded };
    },

    getFlying: () => flying.map((e) => e.item),
    getLanded: () => landed,
    dispose() { unsubContact(); this.clearAll(); },
  };
}
