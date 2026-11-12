import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { COLLISION_GROUPS } from './collisionGroups.ts';
import {
  MIN_GROUND_NORMAL_Y,
  PLAYER_AIR_ACCEL,
  PLAYER_AIR_DECEL,
  PLAYER_EYE_HEIGHT,
  PLAYER_FRICTION,
  PLAYER_GROUND_ACCEL,
  PLAYER_GROUND_DECEL,
  PLAYER_GROUND_RAY_EXTRA,
  PLAYER_HALF_HEIGHT,
  PLAYER_LINEAR_DAMPING,
  PLAYER_MASS,
  PLAYER_RADIUS,
  PLAYER_RESTITUTION,
} from './constantsPhysics.ts';
import { getInterpolatedPosition, snapshotBodyPose } from './physicsSync.ts';
import type { PhysicsWorld, Vec3Like } from './physicsTypes.ts';

export interface PlayerBody {
  readonly body: RAPIER.RigidBody | null;
  setMoveVelocity(vx: number, vz: number, dt?: number): void;
  getPosition(alpha?: number): Vec3Like;
  getEyePosition(alpha?: number): Vec3Like;
  isGrounded(): boolean;
  teleport(x: number, y: number, z: number): void;
  dispose(): void;
}

const CAPSULE_CENTER_Y_OFFSET = PLAYER_HALF_HEIGHT + PLAYER_RADIUS;
const DEFAULT_START_POS: Vec3Like = { x: 0, y: 0, z: 1.8 };
const DOWN_DIR: Vec3Like = { x: 0, y: -1, z: 0 };

// Tạo thân vật lý capsule động hoàn toàn cho người chơi (khóa xoay, ma sát 0 với tường, đẩy được ghế)
export function createPlayerBody(physics: PhysicsWorld, initialPos: Vec3Like = DEFAULT_START_POS): PlayerBody {
  const rigidBody = physics.addDynamicBody({
    type: 'dynamic',
    position: {
      x: initialPos.x,
      y: initialPos.y + CAPSULE_CENTER_Y_OFFSET,
      z: initialPos.z,
    },
    mass: PLAYER_MASS,
    friction: PLAYER_FRICTION,
    restitution: PLAYER_RESTITUTION,
    linearDamping: PLAYER_LINEAR_DAMPING,
    frictionCombineRule: RAPIER.CoefficientCombineRule.Min,
    restitutionCombineRule: RAPIER.CoefficientCombineRule.Min,
    lockRotations: true,
    canSleep: false,
    collisionGroups: COLLISION_GROUPS.PLAYER,
    shape: { type: 'capsule', halfHeight: PLAYER_HALF_HEIGHT, radius: PLAYER_RADIUS },
    tag: { kind: 'player' },
  });

  const tmpVec = new THREE.Vector3();
  let lastFeetPos: Vec3Like = { ...initialPos };
  let disposed = false;

  const isAlive = () => !disposed && rigidBody.isValid();

  const readFeetPos = (alpha?: number): Vec3Like => {
    if (!isAlive()) return { ...lastFeetPos };
    const p = getInterpolatedPosition(rigidBody, alpha, tmpVec);
    return { x: p.x, y: p.y - CAPSULE_CENTER_Y_OFFSET, z: p.z };
  };

  const checkGrounded = (): boolean => {
    if (!isAlive()) return false;
    const t = rigidBody.translation();
    const hit = physics.raycast(
      { x: t.x, y: t.y - PLAYER_HALF_HEIGHT, z: t.z },
      DOWN_DIR,
      PLAYER_RADIUS + PLAYER_GROUND_RAY_EXTRA,
      { groups: COLLISION_GROUPS.PLAYER, excludeBody: rigidBody },
    );
    return hit !== null && hit.normal.y >= MIN_GROUND_NORMAL_Y;
  };

  return {
    get body() {
      return isAlive() ? rigidBody : null;
    },

    setMoveVelocity(vx, vz, dt) {
      if (!isAlive()) return;
      const tvx = Number.isFinite(vx) ? vx : 0;
      const tvz = Number.isFinite(vz) ? vz : 0;
      const cur = rigidBody.linvel();
      // Người chơi không nhảy nên chặn vận tốc đẩy lên do kẹt mép ghế, vẫn giữ trọng lực rơi xuống
      const nextY = cur.y > 0 ? 0 : cur.y;

      if (dt === undefined || dt <= 0) {
        if (Math.abs(tvx - cur.x) < 1e-6 && Math.abs(tvz - cur.z) < 1e-6 && cur.y <= 0) return;
        rigidBody.setLinvel({ x: tvx, y: nextY, z: tvz }, true);
        return;
      }

      const dvx = tvx - cur.x;
      const dvz = tvz - cur.z;
      const dist = Math.hypot(dvx, dvz);
      if (dist <= 1e-6) {
        if (cur.y > 0) rigidBody.setLinvel({ x: cur.x, y: 0, z: cur.z }, true);
        return;
      }

      const moving = tvx * tvx + tvz * tvz > 1e-6;
      const grounded = checkGrounded();
      const rate = grounded
        ? (moving ? PLAYER_GROUND_ACCEL : PLAYER_GROUND_DECEL)
        : (moving ? PLAYER_AIR_ACCEL : PLAYER_AIR_DECEL);
      const maxDelta = rate * dt;

      if (dist <= maxDelta) {
        rigidBody.setLinvel({ x: tvx, y: nextY, z: tvz }, true);
      } else {
        const scale = maxDelta / dist;
        rigidBody.setLinvel({ x: cur.x + dvx * scale, y: nextY, z: cur.z + dvz * scale }, true);
      }
    },

    getPosition: (alpha) => readFeetPos(alpha),

    getEyePosition: (alpha) => {
      const p = readFeetPos(alpha);
      return { x: p.x, y: p.y + PLAYER_EYE_HEIGHT, z: p.z };
    },

    isGrounded: checkGrounded,

    teleport(x, y, z) {
      if (!isAlive()) return;
      rigidBody.setTranslation({ x, y: y + CAPSULE_CENTER_Y_OFFSET, z }, true);
      rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      snapshotBodyPose(rigidBody);
      physics.world.propagateModifiedBodyPositionsToColliders();
      lastFeetPos = { x, y, z };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      if (rigidBody.isValid()) {
        lastFeetPos = readFeetPos(1);
        physics.removeBody(rigidBody.handle);
      }
    },
  };
}
