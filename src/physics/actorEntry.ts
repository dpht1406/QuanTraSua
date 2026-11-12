import RAPIER from '@dimforge/rapier3d-compat';
import type { Aabb3D } from '../world/shopWorld.ts';
import { snapshotBodyPose } from './physicsSync.ts';
import type { BodyTag, PhysicsWorld } from './physicsTypes.ts';

export interface ActorEntry {
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

export function hitboxToColliderProps(hitbox: Aabb3D, rootX: number, rootZ: number) {
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

export function createActorKinematicBody(
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

export function makeActorEntry(
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

export function syncActorEntry(
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
