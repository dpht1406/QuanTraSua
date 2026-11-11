import * as THREE from 'three';
import { resolveAabbMove, type AabbBox } from '../player/collision.ts';
import type { StaffMember } from '../state/staff.ts';
import { PALETTE } from '../styles/palette.ts';
import { makeBox } from './furniture.ts';

export interface StaffActor {
  member: StaffMember;
  root: THREE.Group;
  moveToward(targetX: number, targetZ: number, dt: number): boolean;
  faceToward(targetX: number, targetZ: number): void;
  animateWork(active: boolean, dt: number): void;
  resetHome(x: number, z: number): void;
}

const STAFF_RADIUS = 0.25;
const ARRIVE_DIST = 0.34;

// Tạo nhân vật nhân viên khối đơn giản có viền đen và di chuyển tránh va chạm bằng AABB
export function createStaffActor(
  member: StaffMember,
  colliders: readonly AabbBox[],
  homeX: number,
  homeZ: number,
): StaffActor {
  const root = new THREE.Group();
  root.position.set(homeX, 0, homeZ);

  const isCleaner = member.role === 'cleaner';
  const shirtColor = isCleaner ? PALETTE.matchaGreen : PALETTE.pinkBlush;
  const capColor = isCleaner ? PALETTE.matchaMint : PALETTE.teaBrown;
  const apronColor = isCleaner ? PALETTE.creamWall : PALETTE.pinkSoft;

  root.add(makeBox(0.12, 0.36, 0.12, PALETTE.teaDark, -0.09, 0.18, 0, 0.01));
  root.add(makeBox(0.12, 0.36, 0.12, PALETTE.teaDark, 0.09, 0.18, 0, 0.01));
  root.add(makeBox(0.36, 0.48, 0.22, shirtColor, 0, 0.62, 0, 0.012));
  root.add(makeBox(0.3, 0.34, 0.04, apronColor, 0, 0.56, 0.12, 0.008));
  root.add(makeBox(0.26, 0.26, 0.26, PALETTE.creamTrim, 0, 1.04, 0, 0.012));
  root.add(makeBox(0.28, 0.09, 0.28, capColor, 0, 1.2, 0, 0.01));
  root.add(makeBox(0.04, 0.04, 0.02, PALETTE.outline, -0.06, 1.05, 0.135, 0));
  root.add(makeBox(0.04, 0.04, 0.02, PALETTE.outline, 0.06, 1.05, 0.135, 0));

  if (isCleaner) {
    root.add(makeBox(0.04, 0.72, 0.04, PALETTE.teaBrown, 0.24, 0.45, 0.1, 0.007));
    root.add(makeBox(0.18, 0.06, 0.1, PALETTE.creamTrim, 0.24, 0.08, 0.1, 0.007));
  } else {
    root.add(makeBox(0.12, 0.16, 0.12, PALETTE.creamWall, 0.24, 0.66, 0.12, 0.008));
  }

  let animTime = 0;
  let detourTimer = 0;
  let detourSign = 1;

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
      root.position.y = Math.abs(Math.sin(animTime * 9)) * 0.035;
      if (moved > 1e-4) {
        root.rotation.y = Math.atan2(next.x - x, next.z - z);
      }
      return Math.hypot(targetX - next.x, targetZ - next.z) <= ARRIVE_DIST;
    },

    animateWork(active, dt) {
      animTime += dt;
      if (!active) {
        root.position.y = 0;
        root.rotation.z = 0;
        return;
      }
      root.position.y = Math.abs(Math.sin(animTime * 5)) * 0.03;
      root.rotation.z = Math.sin(animTime * 6) * 0.08;
    },

    resetHome(x, z) {
      root.position.set(x, 0, z);
      root.rotation.set(0, 0, 0);
      detourTimer = 0;
    },
  };
}
