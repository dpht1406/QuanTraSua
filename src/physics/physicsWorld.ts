import RAPIER from '@dimforge/rapier3d-compat';
import { COLLISION_GROUPS } from './collisionGroups.ts';
import {
  FIXED_STEP,
  GRAVITY,
  MAX_SUBSTEPS,
  STATIC_FRICTION,
  STATIC_RESTITUTION,
} from './constantsPhysics.ts';
import {
  clearPhysicsSync,
  setPhysicsSyncAlpha,
  snapshotBodyPose,
  snapshotWorldPoses,
} from './physicsSync.ts';
import type {
  BodyKind,
  BodyTag,
  ColliderPartDesc,
  ContactCallback,
  DynamicBodyDesc,
  PhysicsWorld,
  QuatLike,
  RaycastFilter,
  RaycastHit,
  ShapeDesc,
  Vec3Like,
} from './physicsTypes.ts';

export type {
  BodyKind,
  BodyTag,
  ColliderPartDesc,
  ContactCallback,
  DynamicBodyDesc,
  PhysicsWorld,
  QuatLike,
  RaycastFilter,
  RaycastHit,
  ShapeDesc,
  Vec3Like,
};

function buildColliderDesc(shape: ShapeDesc): RAPIER.ColliderDesc {
  switch (shape.type) {
    case 'box':
      return RAPIER.ColliderDesc.cuboid(shape.hx, shape.hy, shape.hz);
    case 'ball':
      return RAPIER.ColliderDesc.ball(shape.radius);
    case 'capsule':
      return RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius);
    case 'cylinder':
      return RAPIER.ColliderDesc.cylinder(shape.halfHeight, shape.radius);
  }
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

let rapierInitPromise: Promise<void> | null = null;
function ensureRapierInit(): Promise<void> {
  if (!rapierInitPromise) rapierInitPromise = RAPIER.init();
  return rapierInitPromise;
}

// Khởi tạo thế giới vật lý Rapier bất đồng bộ với bước cố định 1/60s, nội suy alpha và hàng đợi va chạm
export async function createPhysicsWorld(): Promise<PhysicsWorld> {
  await ensureRapierInit();

  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = FIXED_STEP;
  const eventQueue = new RAPIER.EventQueue(true);

  const tagsByCollider = new Map<number, BodyTag>();
  const collidersByBody = new Map<number, number[]>();
  const contactListeners = new Set<ContactCallback>();
  const forceByPair = new Map<string, number>();
  const pendingContacts: Array<[BodyTag, BodyTag, number]> = [];

  let accumulator = 0;
  let alphaVal = 0;
  let queriesDirty = false;
  let disposed = false;

  const flushQueriesIfDirty = () => {
    if (!queriesDirty || disposed) return;
    world.propagateModifiedBodyPositionsToColliders();
    world.timestep = 0;
    world.step();
    world.timestep = FIXED_STEP;
    queriesDirty = false;
  };

  return {
    world,

    get alpha(): number {
      return alphaVal;
    },

    step(dt: number) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return;
      accumulator += dt;
      let substeps = 0;

      while (accumulator >= FIXED_STEP && substeps < MAX_SUBSTEPS) {
        snapshotWorldPoses(world);
        world.step(eventQueue);

        forceByPair.clear();
        eventQueue.drainContactForceEvents((ev) => {
          const k = pairKey(ev.collider1(), ev.collider2());
          const impulse = ev.totalForceMagnitude() * FIXED_STEP;
          const prev = forceByPair.get(k) ?? 0;
          if (impulse > prev) forceByPair.set(k, impulse);
        });

        pendingContacts.length = 0;
        eventQueue.drainCollisionEvents((h1, h2, started) => {
          if (!started) return;
          const tagA = tagsByCollider.get(h1);
          const tagB = tagsByCollider.get(h2);
          if (!tagA || !tagB) return;
          pendingContacts.push([tagA, tagB, forceByPair.get(pairKey(h1, h2)) ?? 0]);
        });

        for (let i = 0; i < pendingContacts.length; i++) {
          const [tagA, tagB, impulse] = pendingContacts[i];
          for (const cb of contactListeners) cb(tagA, tagB, impulse);
        }

        accumulator -= FIXED_STEP;
        substeps++;
      }

      if (accumulator >= FIXED_STEP) accumulator = 0;
      alphaVal = accumulator / FIXED_STEP;
      setPhysicsSyncAlpha(alphaVal);
      queriesDirty = false;
    },

    onContact(cb) {
      contactListeners.add(cb);
      return () => contactListeners.delete(cb);
    },

    addStaticBox(center, halfExtents, tag) {
      const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setTranslation(center.x, center.y, center.z)
        .setFriction(STATIC_FRICTION)
        .setRestitution(STATIC_RESTITUTION)
        .setCollisionGroups(COLLISION_GROUPS.STATIC)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      const col = world.createCollider(desc);
      const bodyTag: BodyTag = typeof tag === 'string'
        ? { kind: tag, colliderHandle: col.handle }
        : { ...tag, colliderHandle: col.handle };
      tagsByCollider.set(col.handle, bodyTag);
      queriesDirty = true;
      return col;
    },

    addDynamicBody(desc) {
      const rbDesc =
        desc.type === 'kinematicPosition'
          ? RAPIER.RigidBodyDesc.kinematicPositionBased()
          : desc.type === 'kinematicVelocity'
            ? RAPIER.RigidBodyDesc.kinematicVelocityBased()
            : RAPIER.RigidBodyDesc.dynamic();

      if (desc.position) rbDesc.setTranslation(desc.position.x, desc.position.y, desc.position.z);
      if (desc.rotation) rbDesc.setRotation(desc.rotation);
      if (desc.linvel) rbDesc.setLinvel(desc.linvel.x, desc.linvel.y, desc.linvel.z);
      if (desc.angvel) rbDesc.setAngvel(desc.angvel);
      if (desc.linearDamping !== undefined) rbDesc.setLinearDamping(desc.linearDamping);
      if (desc.angularDamping !== undefined) rbDesc.setAngularDamping(desc.angularDamping);
      if (desc.gravityScale !== undefined) rbDesc.setGravityScale(desc.gravityScale);
      if (desc.canSleep !== undefined) rbDesc.setCanSleep(desc.canSleep);
      if (desc.ccdEnabled) rbDesc.setCcdEnabled(true);
      if (desc.lockRotations) rbDesc.lockRotations();
      if (desc.enabledRotations) rbDesc.enabledRotations(...desc.enabledRotations);

      const body = world.createRigidBody(rbDesc);
      const parts: ColliderPartDesc[] = desc.colliders ?? (desc.shape ? [{ shape: desc.shape }] : []);
      const colHandles: number[] = [];

      for (const part of parts) {
        const cDesc = buildColliderDesc(part.shape);
        if (part.offset) cDesc.setTranslation(part.offset.x, part.offset.y, part.offset.z);
        if (part.rotation) cDesc.setRotation(part.rotation);
        const mass = part.mass ?? (parts.length === 1 ? desc.mass : desc.mass !== undefined ? desc.mass / parts.length : undefined);
        if (mass !== undefined) cDesc.setMass(mass);
        if (part.friction !== undefined || desc.friction !== undefined) cDesc.setFriction(part.friction ?? desc.friction ?? 0.5);
        if (part.restitution !== undefined || desc.restitution !== undefined) cDesc.setRestitution(part.restitution ?? desc.restitution ?? 0);
        if (desc.frictionCombineRule !== undefined) cDesc.setFrictionCombineRule(desc.frictionCombineRule);
        if (desc.restitutionCombineRule !== undefined) cDesc.setRestitutionCombineRule(desc.restitutionCombineRule);
        if (desc.collisionGroups !== undefined) cDesc.setCollisionGroups(desc.collisionGroups);
        if (desc.activeCollisionTypes !== undefined) cDesc.setActiveCollisionTypes(desc.activeCollisionTypes);
        if (part.isSensor ?? desc.isSensor) cDesc.setSensor(true);
        cDesc.setActiveEvents(desc.activeEvents ?? (RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS));

        const col = world.createCollider(cDesc, body);
        colHandles.push(col.handle);
        tagsByCollider.set(col.handle, { ...desc.tag, colliderHandle: col.handle, bodyHandle: body.handle });
      }

      collidersByBody.set(body.handle, colHandles);
      snapshotBodyPose(body);
      queriesDirty = true;
      return body;
    },

    removeBody(handle) {
      if (disposed) return;
      const body = world.getRigidBody(handle);
      const cols = collidersByBody.get(handle);
      if (cols) {
        for (const ch of cols) tagsByCollider.delete(ch);
        collidersByBody.delete(handle);
      }
      if (body && body.isValid()) world.removeRigidBody(body);
      queriesDirty = true;
    },

    raycast(origin, dir, maxDist, filter) {
      if (disposed || maxDist <= 0) return null;
      const len = Math.hypot(dir.x, dir.y, dir.z);
      if (len < 1e-8) return null;
      flushQueriesIfDirty();

      const nd = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
      const ray = new RAPIER.Ray(origin, nd);
      const opts = typeof filter === 'number' ? { groups: filter } : filter;
      const hit = world.castRayAndGetNormal(
        ray,
        maxDist,
        true,
        opts?.flags,
        opts?.groups,
        opts?.excludeCollider,
        opts?.excludeBody,
        opts?.predicate
          ? (col) => {
              const t = tagsByCollider.get(col.handle);
              return t ? opts.predicate!(t) : false;
            }
          : undefined,
      );
      if (!hit) return null;

      const handle = hit.collider.handle;
      const tag = tagsByCollider.get(handle) ?? { kind: 'wall', colliderHandle: handle };
      return {
        distance: hit.timeOfImpact,
        point: {
          x: origin.x + nd.x * hit.timeOfImpact,
          y: origin.y + nd.y * hit.timeOfImpact,
          z: origin.z + nd.z * hit.timeOfImpact,
        },
        normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
        tag,
        colliderHandle: handle,
      };
    },

    registerColliderTag(colliderHandle, tag) {
      tagsByCollider.set(colliderHandle, { ...tag, colliderHandle });
      queriesDirty = true;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      contactListeners.clear();
      tagsByCollider.clear();
      collidersByBody.clear();
      clearPhysicsSync();
      eventQueue.free();
      world.free();
    },
  };
}
