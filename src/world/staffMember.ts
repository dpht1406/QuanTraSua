import * as THREE from 'three';
import { resolveAabbMove, type AabbBox } from '../player/collision.ts';
import { STAFF_CANDIDATES } from '../state/constants.ts';
import { pickVariant, type CatVariant } from '../state/catVariants.ts';
import { CAT_BASE_HEIGHT, CAT_HEAD_RADIUS, CAT_HEAD_SCALE } from '../state/constantsCat.ts';
import type { StaffMember } from '../state/staff.ts';
import { PALETTE } from '../styles/palette.ts';
import { animateCat, createCat, type CatRig } from './catModel.ts';
import { createFallAnimation, type FallDir } from './fallAnimation.ts';
import { makeBox, makeCylinder } from './furniture.ts';
import type { Aabb3D } from './shopWorld.ts';

export interface StaffActor {
  member: StaffMember;
  root: THREE.Group;
  readonly hitbox: Aabb3D | null;
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
const HITBOX_HALF_W = 0.28;
const HITBOX_HEIGHT = 1.32;
const STAFF_HEAD_STAR_Y = 1.08;

// Ánh xạ cố định 4 ứng viên nhân viên theo thứ tự STAFF_CANDIDATES sang biến thể mèo
export function getStaffCatVariant(staffId: string): CatVariant {
  const idx = STAFF_CANDIDATES.findIndex((c) => c.id === staffId);
  return pickVariant(idx >= 0 ? idx : 0);
}

// Gắn tạp dề, mũ đồng phục theo vai trò và dụng cụ/ly trên tay mèo
function attachStaffUniform(rig: CatRig, role: StaffMember['role']): void {
  const isCleaner = role === 'cleaner';
  const accentColor = isCleaner ? PALETTE.matchaGreen : PALETTE.pinkBlush;
  const capColor = isCleaner ? PALETTE.matchaMint : PALETTE.teaBrown;
  const apronColor = isCleaner ? PALETTE.creamWall : PALETTE.pinkSoft;

  const apron = makeBox(0.32, 0.2, 0.03, apronColor, 0, -0.105, 0.208, 0.007);
  apron.rotation.x = -0.09;
  const pocket = makeBox(0.15, 0.085, 0.018, accentColor, 0, -0.115, 0.226, 0.005);
  pocket.rotation.x = -0.09;
  const waistBand = makeCylinder(0.202, 0.214, 0.04, accentColor, 0, -0.005, 0, 0.006);
  rig.body.add(waistBand, apron, pocket);

  const headTopY = CAT_HEAD_RADIUS * CAT_HEAD_SCALE.y;
  const capCrown = makeCylinder(0.135, 0.148, 0.07, capColor, 0, headTopY - 0.005, 0.02, 0.007);
  const capBrim = makeBox(0.18, 0.02, 0.1, capColor, 0, headTopY - 0.032, 0.12, 0.006);
  capBrim.rotation.x = 0.12;
  const capBadge = makeBox(0.065, 0.032, 0.02, accentColor, 0, headTopY - 0.002, 0.155, 0.004);
  rig.head.add(capCrown, capBrim, capBadge);

  if (isCleaner) {
    const tool = new THREE.Group();
    tool.rotation.x = 0.2;
    tool.add(makeBox(0.04, 0.72, 0.04, PALETTE.teaBrown, 0, -0.02, 0, 0.006));
    tool.add(makeBox(0.18, 0.06, 0.1, PALETTE.creamTrim, 0, -0.36, 0, 0.007));
    rig.handAnchorL.add(tool);
  } else {
    const cup = new THREE.Group();
    cup.add(makeCylinder(0.055, 0.042, 0.14, PALETTE.creamWall, 0, 0.03, 0.02, 0.007));
    cup.add(makeCylinder(0.058, 0.058, 0.02, PALETTE.pinkSoft, 0, 0.105, 0.02, 0.006));
    rig.handAnchorL.add(cup);
  }
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
