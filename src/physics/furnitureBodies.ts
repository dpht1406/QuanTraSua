import type RAPIER from '@dimforge/rapier3d-compat';
import { getWorldBounds } from '../core/worldBounds.ts';
import { CHAIR_BACK_SIZE, CHAIR_SEAT_SIZE } from '../world/furnitureDecor.ts';
import type { ChairInstance, ShopWorld } from '../world/shopWorld.ts';
import { COLLISION_GROUPS } from './collisionGroups.ts';
import {
  CHAIR_ANGULAR_DAMPING,
  CHAIR_FRICTION,
  CHAIR_LINEAR_DAMPING,
  CHAIR_MASS,
  CHAIR_OUT_OF_BOUNDS_Y,
  CHAIR_RESTITUTION,
} from './constantsPhysics.ts';
import { bindMesh, snapshotBodyPose, unbindMesh } from './physicsSync.ts';
import type { PhysicsWorld, QuatLike, Vec3Like } from './physicsTypes.ts';

export interface FurnitureBodies {
  getChairBodies(): readonly RAPIER.RigidBody[];
  resetChairs(): void;
  update(dt: number): void;
  reset(): void;
  dispose(): void;
}

interface ChairEntry {
  id: string;
  body: RAPIER.RigidBody;
  mesh: ChairInstance['mesh'];
  initialPos: Vec3Like;
  initialQuat: QuatLike;
  badPoseSec: number;
}

const CHECK_INTERVAL_SEC = 0.25;
const FLIP_HOLD_SEC = 1.5;

const SEAT_HX = CHAIR_SEAT_SIZE.w * 0.5;
const SEAT_HZ = CHAIR_SEAT_SIZE.d * 0.5;
const SEAT_BASE_HY = (CHAIR_SEAT_SIZE.y + CHAIR_SEAT_SIZE.h * 0.5) * 0.5;
const BACK_HX = CHAIR_BACK_SIZE.w * 0.5;
const BACK_HY = CHAIR_BACK_SIZE.h * 0.5;
const BACK_HZ = CHAIR_BACK_SIZE.d * 0.5;

function yawToQuat(yaw: number): QuatLike {
  const half = yaw * 0.5;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

// Tạo và quản lý thân động Rapier (mặt ghế + lưng ghế) cho toàn bộ ghế đẩy được trong quán
export function createFurnitureBodies(physics: PhysicsWorld, world: ShopWorld): FurnitureBodies {
  const bounds = getWorldBounds();
  const entries: ChairEntry[] = [];
  let checkAccum = 0;

  for (const chair of world.chairs ?? []) {
    const initialPos: Vec3Like = { ...chair.initialPos };
    const initialQuat = yawToQuat(chair.initialYaw);
    const body = physics.addDynamicBody({
      type: 'dynamic',
      position: initialPos,
      rotation: initialQuat,
      linearDamping: CHAIR_LINEAR_DAMPING,
      angularDamping: CHAIR_ANGULAR_DAMPING,
      friction: CHAIR_FRICTION,
      restitution: CHAIR_RESTITUTION,
      canSleep: true,
      collisionGroups: COLLISION_GROUPS.CHAIR,
      colliders: [
        {
          shape: { type: 'box', hx: SEAT_HX, hy: SEAT_BASE_HY, hz: SEAT_HZ },
          offset: { x: 0, y: SEAT_BASE_HY, z: 0 },
          mass: CHAIR_MASS * 0.8,
        },
        {
          shape: { type: 'box', hx: BACK_HX, hy: BACK_HY, hz: BACK_HZ },
          offset: { x: CHAIR_BACK_SIZE.x, y: CHAIR_BACK_SIZE.y, z: 0 },
          mass: CHAIR_MASS * 0.2,
        },
      ],
      tag: { kind: 'chair', id: chair.id },
    });
    snapshotBodyPose(body);
    bindMesh(body, chair.mesh);

    entries.push({
      id: chair.id,
      body,
      mesh: chair.mesh,
      initialPos,
      initialQuat,
      badPoseSec: 0,
    });
  }

  const resetChair = (entry: ChairEntry) => {
    if (!entry.body.isValid()) return;
    entry.body.setTranslation(entry.initialPos, true);
    entry.body.setRotation(entry.initialQuat, true);
    entry.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    entry.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    entry.badPoseSec = 0;
    snapshotBodyPose(entry.body);
    entry.mesh.position.set(entry.initialPos.x, entry.initialPos.y, entry.initialPos.z);
    entry.mesh.quaternion.set(
      entry.initialQuat.x,
      entry.initialQuat.y,
      entry.initialQuat.z,
      entry.initialQuat.w,
    );
  };

  const resetChairs = () => {
    checkAccum = 0;
    for (const entry of entries) resetChair(entry);
    physics.world.propagateModifiedBodyPositionsToColliders();
  };

  return {
    getChairBodies: () => entries.map((e) => e.body).filter((b) => b.isValid()),

    resetChairs,
    reset: resetChairs,

    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      checkAccum += dt;
      if (checkAccum < CHECK_INTERVAL_SEC) return;
      const elapsed = checkAccum;
      checkAccum = 0;

      for (const entry of entries) {
        if (!entry.body.isValid()) continue;
        const pos = entry.body.translation();
        const rot = entry.body.rotation();

        const outOfBounds =
          !Number.isFinite(pos.x) ||
          !Number.isFinite(pos.y) ||
          !Number.isFinite(pos.z) ||
          pos.y < CHAIR_OUT_OF_BOUNDS_Y ||
          pos.y > bounds.maxY + 0.5 ||
          pos.x < bounds.minX - 0.25 ||
          pos.x > bounds.maxX + 0.25 ||
          pos.z < bounds.minZ - 0.25 ||
          pos.z > bounds.maxZ + 0.25;
        if (outOfBounds) {
          resetChair(entry);
          continue;
        }

        const upY = 1 - 2 * (rot.x * rot.x + rot.z * rot.z);
        const v = entry.body.linvel();
        const speedSq = v.x * v.x + v.y * v.y + v.z * v.z;
        const nearWall =
          pos.x < bounds.minX + 0.2 ||
          pos.x > bounds.maxX - 0.2 ||
          pos.z < bounds.minZ + 0.2 ||
          pos.z > bounds.maxZ - 0.2;
        if ((upY < 0.25 || (nearWall && upY < 0.65)) && speedSq < 0.09) {
          entry.badPoseSec += elapsed;
          if (entry.badPoseSec >= FLIP_HOLD_SEC) resetChair(entry);
        } else {
          entry.badPoseSec = 0;
        }
      }
    },

    dispose() {
      for (const entry of entries) {
        unbindMesh(entry.body);
        if (entry.body.isValid()) physics.removeBody(entry.body.handle);
      }
      entries.length = 0;
    },
  };
}
