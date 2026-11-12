import * as THREE from 'three';
import { STAFF_COLLIDER_HALF_W, STAFF_COLLIDER_HEIGHT } from '../physics/constantsPhysics.ts';
import { resolveAabbMove, type AabbBox } from '../player/collision.ts';
import { STAFF_CANDIDATES } from '../state/constants.ts';
import { pickVariant, type CatVariant } from '../state/catVariants.ts';
import { CAT_BASE_HEIGHT } from '../state/constantsCat.ts';
import type { StaffMember } from '../state/staff.ts';
import { animateCat, createCat } from './catModel.ts';
import { createFallAnimation, type FallDir } from './fallAnimation.ts';
import type { Aabb3D } from './shopWorld.ts';
import { attachStaffUniform } from './staffUniform.ts';

export interface StaffActor {
  member: StaffMember;
  root: THREE.Group;
  readonly hitbox: Aabb3D | null;
  readonly teleportVersion?: number;
  moveToward(targetX: number, targetZ: number, dt: number): boolean;
  faceToward(targetX: number, targetZ: number): void;
  animateWork(active: boolean, dt: number): void;
  triggerFall(dur: number, hitDir?: FallDir): void;
  updateFall(dt: number): boolean;
  clearFall(): void;
  resetHome(x: number, z: number): void;
}

const STAFF_RADIUS = 0.25;
const ARRIVE_DIST = 0.34;
const HITBOX_HALF_W = STAFF_COLLIDER_HALF_W;
const HITBOX_HEIGHT = STAFF_COLLIDER_HEIGHT;
const STAFF_HEAD_STAR_Y = 1.08;

// Ánh xạ cố định 4 ứng viên nhân viên theo thứ tự STAFF_CANDIDATES sang biến thể mèo
export function getStaffCatVariant(staffId: string): CatVariant {
  const idx = STAFF_CANDIDATES.findIndex((c) => c.id === staffId);
  return pickVariant(idx >= 0 ? idx : 0);
}

// Tạo nhân vật mèo nhân viên có đồng phục, viền đen và di chuyển tránh va chạm bằng AABB
export function createStaffActor(
  member: StaffMember,
  colliders: readonly AabbBox[],
  homeX: number,
  homeZ: number,
): StaffActor {
  const root = new THREE.Group();
  root.position.set(homeX, 0, homeZ);

  const variant = getStaffCatVariant(member.id);
  const rig = createCat(variant.id, {
    scale: HITBOX_HEIGHT / CAT_BASE_HEIGHT,
    // Tránh chồng nón thường của biến thể mèo mướp với mũ đồng phục nhân viên
    accessory: variant.accessory === 'hat' ? 'none' : variant.accessory,
  });
  attachStaffUniform(rig, member.role);
  animateCat(rig, 'idle', 0);
  root.add(rig.root);

  let animTime = 0;
  let detourTimer = 0;
  let detourSign = 1;
  let walkingInMove = false;
  let idledInMove = false;
  let teleportVersion = 0;
  const fallAnim = createFallAnimation(root, STAFF_HEAD_STAR_Y);

  const faceToward = (tx: number, tz: number) => {
    const dx = tx - root.position.x;
    const dz = tz - root.position.z;
    if (dx * dx + dz * dz > 1e-4) {
      root.rotation.y = Math.atan2(dx, dz);
    }
  };

  return {
    member,
    root,
    get hitbox(): Aabb3D | null {
      if (!root.visible) return null;
      return fallAnim.getHitbox(root.position.x, root.position.z, HITBOX_HALF_W, HITBOX_HEIGHT);
    },
    get teleportVersion(): number {
      return teleportVersion;
    },
    faceToward,

    moveToward(targetX, targetZ, dt) {
      const x = root.position.x;
      const z = root.position.z;
      const dx = targetX - x;
      const dz = targetZ - z;
      const dist = Math.hypot(dx, dz);
      if (dist <= ARRIVE_DIST) {
        root.position.y = 0;
        detourTimer = 0;
        walkingInMove = false;
        idledInMove = true;
        animTime += dt;
        animateCat(rig, 'idle', animTime);
        return true;
      }

      const step = member.speed * dt;
      let moveX = dx / dist;
      let moveZ = dz / dist;

      // shortcut: né vật cản cục bộ bằng AABB sẵn có (không tìm đường A*), có thể kẹt trước hốc chữ U
      if (detourTimer > 0) {
        detourTimer -= dt;
        const px = -moveZ * detourSign;
        const pz = moveX * detourSign;
        moveX = px;
        moveZ = pz;
      }

      const next = resolveAabbMove(
        x,
        z,
        x + moveX * Math.min(step, dist),
        z + moveZ * Math.min(step, dist),
        STAFF_RADIUS,
        colliders,
      );
      const moved = Math.hypot(next.x - x, next.z - z);

      if (moved < step * 0.25 && step > 1e-4) {
        if (detourTimer > 0) detourSign *= -1;
        detourTimer = 0.65;
      }

      root.position.x = next.x;
      root.position.z = next.z;
      animTime += dt;
      if (moved > 1e-4) {
        root.rotation.y = Math.atan2(next.x - x, next.z - z);
      }

      const arrived = Math.hypot(targetX - next.x, targetZ - next.z) <= ARRIVE_DIST;
      if (arrived) {
        walkingInMove = false;
        idledInMove = true;
        root.position.y = 0;
        animateCat(rig, 'idle', animTime);
      } else {
        walkingInMove = true;
        idledInMove = false;
        root.position.y = Math.abs(Math.sin(animTime * 9)) * 0.035;
        animateCat(rig, 'walk', animTime, member.speed);
      }
      return arrived;
    },

    animateWork(active, dt) {
      if (active) {
        walkingInMove = false;
        idledInMove = false;
        animTime += dt;
        if (!fallAnim.isActive()) root.position.y = 0;
        animateCat(rig, 'work', animTime, member.speed);
        return;
      }
      // Giữ nhịp đi bộ khi caller (vd: updateBarista) gọi moveToward rồi animateWork(false, dt) cùng frame
      if (dt > 0 && walkingInMove) {
        walkingInMove = false;
        return;
      }
      if (dt > 0 && idledInMove) {
        idledInMove = false;
        return;
      }
      walkingInMove = false;
      idledInMove = false;
      animTime += dt;
      if (!fallAnim.isActive()) root.position.y = 0;
      animateCat(rig, 'idle', animTime);
    },

    triggerFall(dur, hitDir) {
      walkingInMove = false;
      idledInMove = false;
      fallAnim.trigger(dur, hitDir, root.rotation.y);
    },

    updateFall(dt) {
      return fallAnim.update(dt);
    },

    clearFall() {
      fallAnim.reset();
    },

    resetHome(x, z) {
      teleportVersion++;
      fallAnim.reset();
      walkingInMove = false;
      idledInMove = false;
      root.position.set(x, 0, z);
      root.rotation.set(0, 0, 0);
      detourTimer = 0;
      animateCat(rig, 'idle', animTime);
    },
  };
}
