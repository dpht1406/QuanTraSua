import RAPIER from '@dimforge/rapier3d-compat';
import type { CustomerActor } from '../world/customer.ts';
import type { Aabb3D } from '../world/shopWorld.ts';
import type { StaffActor } from '../world/staffMember.ts';
import {
  createActorKinematicBody,
  makeActorEntry,
  syncActorEntry,
  type ActorEntry,
} from './actorEntry.ts';
import { COLLISION_GROUPS } from './collisionGroups.ts';
import type { PhysicsWorld, Vec3Like } from './physicsTypes.ts';

export interface ActorBodies {
  syncCustomer(customer: CustomerActor): void;
  syncStaff(actors: readonly StaffActor[]): void;
  sync(customer: CustomerActor, actors: readonly StaffActor[]): void;
  getCustomerBody(): RAPIER.RigidBody | null;
  getStaffBody(staffId: string): RAPIER.RigidBody | null;
  setCustomerKinematic(kinematic: boolean): void;
  dispose(): void;
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
      customerEntry = makeActorEntry(body, hitbox, rx, rz, epoch);
      return;
    }
    syncActorEntry(customerEntry, hitbox, rx, rz, epoch);
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
        staffEntries.set(staffId, makeActorEntry(body, hitbox, rx, rz, epoch));
        continue;
      }
      syncActorEntry(existing, hitbox, rx, rz, epoch);
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
