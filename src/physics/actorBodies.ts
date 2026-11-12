import RAPIER from '@dimforge/rapier3d-compat';
import type { CustomerActor } from '../world/customer.ts';
import type { Aabb3D } from '../world/shopWorld.ts';
import type { StaffActor } from '../world/staffMember.ts';
import { COLLISION_GROUPS } from './collisionGroups.ts';
import { snapshotBodyPose } from './physicsSync.ts';
import type { BodyTag, PhysicsWorld, Vec3Like } from './physicsTypes.ts';

export interface ActorBodies {
  syncCustomer(customer: CustomerActor): void;
  syncStaff(actors: readonly StaffActor[]): void;
  sync(customer: CustomerActor, actors: readonly StaffActor[]): void;
  getCustomerBody(): RAPIER.RigidBody | null;
  getStaffBody(staffId: string): RAPIER.RigidBody | null;
  setCustomerKinematic(kinematic: boolean): void;
  dispose(): void;
}

interface ActorEntry {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  lastX: number;
  lastZ: number;
  lastEpoch: number;
  lastOx: number;
  lastOy: number;
  lastOz: number;
  lastHx: number;
  lastHy: number;
  lastHz: number;
}

const TELEPORT_DIST = 0.5;
const EPS = 1e-4;

function hitboxToColliderProps(hitbox: Aabb3D, rootX: number, rootZ: number) {
  const cx = (hitbox.minX + hitbox.maxX) * 0.5;
  const cy = (hitbox.minY + hitbox.maxY) * 0.5;
  const cz = (hitbox.minZ + hitbox.maxZ) * 0.5;
  return {
    offset: { x: cx - rootX, y: cy, z: cz - rootZ },
    halfExtents: {
      x: Math.max(0.05, (hitbox.maxX - hitbox.minX) * 0.5),
      y: Math.max(0.05, (hitbox.maxY - hitbox.minY) * 0.5),
      z: Math.max(0.05, (hitbox.maxZ - hitbox.minZ) * 0.5),
    },
  };
}

function createActorKinematicBody(
  physics: PhysicsWorld,
  hitbox: Aabb3D,
  rootX: number,
  rootZ: number,
  collisionGroups: number,
  tag: BodyTag,
): RAPIER.RigidBody {
  const { offset, halfExtents } = hitboxToColliderProps(hitbox, rootX, rootZ);
  return physics.addDynamicBody({
    type: 'kinematicPosition',
    position: { x: rootX, y: 0, z: rootZ },
    collisionGroups,
    activeCollisionTypes: RAPIER.ActiveCollisionTypes.DEFAULT,
    colliders: [
      {
        shape: { type: 'box', hx: halfExtents.x, hy: halfExtents.y, hz: halfExtents.z },
        offset,
      },
    ],
    tag,
  });
}

function makeEntry(
  body: RAPIER.RigidBody,
  hitbox: Aabb3D,
  rootX: number,
  rootZ: number,
  epoch: number,
): ActorEntry {
  const { offset, halfExtents } = hitboxToColliderProps(hitbox, rootX, rootZ);
  return {
    body,
    collider: body.collider(0),
    lastX: rootX,
    lastZ: rootZ,
    lastEpoch: epoch,
    lastOx: offset.x,
    lastOy: offset.y,
    lastOz: offset.z,
    lastHx: halfExtents.x,
    lastHy: halfExtents.y,
    lastHz: halfExtents.z,
  };
}

function syncEntry(
  entry: ActorEntry,
  hitbox: Aabb3D,
  rootX: number,
  rootZ: number,
  epoch: number,
): void {
  const jumped =
    epoch !== entry.lastEpoch ||
    Math.hypot(rootX - entry.lastX, rootZ - entry.lastZ) > TELEPORT_DIST;
  if (jumped) {
    entry.body.setTranslation({ x: rootX, y: 0, z: rootZ }, true);
    if (entry.body.isKinematic()) {
      entry.body.setNextKinematicTranslation({ x: rootX, y: 0, z: rootZ });
    }
    snapshotBodyPose(entry.body);
  } else if (entry.body.isKinematic()) {
    entry.body.setNextKinematicTranslation({ x: rootX, y: 0, z: rootZ });
  }
  entry.lastX = rootX;
  entry.lastZ = rootZ;
  entry.lastEpoch = epoch;

  const { offset, halfExtents } = hitboxToColliderProps(hitbox, rootX, rootZ);
  if (
    Math.abs(offset.x - entry.lastOx) > EPS ||
    Math.abs(offset.y - entry.lastOy) > EPS ||
    Math.abs(offset.z - entry.lastOz) > EPS
  ) {
    entry.collider.setTranslationWrtParent(offset);
    entry.lastOx = offset.x;
    entry.lastOy = offset.y;
    entry.lastOz = offset.z;
  }
  if (
    Math.abs(halfExtents.x - entry.lastHx) > EPS ||
    Math.abs(halfExtents.y - entry.lastHy) > EPS ||
    Math.abs(halfExtents.z - entry.lastHz) > EPS
  ) {
    entry.collider.setHalfExtents(halfExtents);
    entry.lastHx = halfExtents.x;
    entry.lastHy = halfExtents.y;
    entry.lastHz = halfExtents.z;
  }
}

// Tạo thân kinematic hitbox cho khách hàng (đóng gói sẵn để GĐ9c chuyển sang thân động khi bị kéo)
export function createCustomerBody(
  physics: PhysicsWorld,
  hitbox: Aabb3D,
  rootPos?: Vec3Like,
  id = 'customer',
): RAPIER.RigidBody {
  const rx = rootPos?.x ?? (hitbox.minX + hitbox.maxX) * 0.5;
  const rz = rootPos?.z ?? (hitbox.minZ + hitbox.maxZ) * 0.5;
  return createActorKinematicBody(physics, hitbox, rx, rz, COLLISION_GROUPS.CUSTOMER, {
    kind: 'customer',
    id,
  });
}

// Chuyển đổi thân khách hàng giữa kinematic (GĐ9.0) và dynamic (chuẩn bị cho GĐ9c kéo khách)
export function setCustomerKinematic(body: RAPIER.RigidBody, kinematic: boolean): void {
  if (!body.isValid()) return;
  body.setBodyType(
    kinematic ? RAPIER.RigidBodyType.KinematicPositionBased : RAPIER.RigidBodyType.Dynamic,
    true,
  );
  if (!kinematic) {
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
}

// Đồng bộ thân kinematic và collider hitbox Rapier cho khách hàng và nhân viên
export function createActorBodies(physics: PhysicsWorld): ActorBodies {
  let customerEntry: ActorEntry | null = null;
  const staffEntries = new Map<string, ActorEntry>();

  const removeCustomer = () => {
    if (!customerEntry) return;
    if (customerEntry.body.isValid()) physics.removeBody(customerEntry.body.handle);
    customerEntry = null;
  };

  const syncCustomer = (customer: CustomerActor) => {
    const hitbox = customer.hitbox;
    if (!hitbox) {
      removeCustomer();
      return;
    }
    const rx = customer.root.position.x;
    const rz = customer.root.position.z;
    const epoch = customer.teleportVersion ?? 0;
    if (!customerEntry || !customerEntry.body.isValid()) {
      const body = createCustomerBody(physics, hitbox, { x: rx, y: 0, z: rz }, 'customer');
      customerEntry = makeEntry(body, hitbox, rx, rz, epoch);
      return;
    }
    syncEntry(customerEntry, hitbox, rx, rz, epoch);
  };

  const syncStaff = (actors: readonly StaffActor[]) => {
    const activeIds = new Set<string>();
    for (const actor of actors) {
      if (actor.hitbox) activeIds.add(actor.member.id);
    }

    for (const [staffId, entry] of staffEntries) {
      if (activeIds.has(staffId)) continue;
      if (entry.body.isValid()) physics.removeBody(entry.body.handle);
      staffEntries.delete(staffId);
    }

    for (const actor of actors) {
      const hitbox = actor.hitbox;
      if (!hitbox) continue;
      const staffId = actor.member.id;
      const rx = actor.root.position.x;
      const rz = actor.root.position.z;
      const epoch = actor.teleportVersion ?? 0;
      const existing = staffEntries.get(staffId);
      if (!existing || !existing.body.isValid()) {
        const body = createActorKinematicBody(physics, hitbox, rx, rz, COLLISION_GROUPS.STAFF, {
          kind: 'staff',
          id: staffId,
          meta: { role: actor.member.role },
        });
        staffEntries.set(staffId, makeEntry(body, hitbox, rx, rz, epoch));
        continue;
      }
      syncEntry(existing, hitbox, rx, rz, epoch);
    }
  };

  return {
    syncCustomer,
    syncStaff,
    sync(customer, actors) {
      syncCustomer(customer);
      syncStaff(actors);
    },
    getCustomerBody: () => (customerEntry && customerEntry.body.isValid() ? customerEntry.body : null),
    getStaffBody: (staffId) => {
      const entry = staffEntries.get(staffId);
      return entry && entry.body.isValid() ? entry.body : null;
    },
    setCustomerKinematic(kinematic) {
      if (customerEntry && customerEntry.body.isValid()) {
        setCustomerKinematic(customerEntry.body, kinematic);
      }
    },
    dispose() {
      removeCustomer();
      for (const entry of staffEntries.values()) {
        if (entry.body.isValid()) physics.removeBody(entry.body.handle);
      }
      staffEntries.clear();
    },
  };
}
