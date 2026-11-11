import * as THREE from 'three';
import { FALL_CUSTOMER_LIE_SEC, FALL_DOWN_SEC, FALL_GETUP_SEC } from '../state/constantsThrow.ts';
import { addOutline } from '../styles/outline.ts';
import { getToonMaterial, PALETTE } from '../styles/palette.ts';
import { createFallAnimation, type FallDir } from './fallAnimation.ts';
import { makeBox } from './furniture.ts';
import type { Aabb3D } from './shopWorld.ts';

export interface Waypoint {
  x: number;
  z: number;
}

export interface CustomerActor {
  root: THREE.Group;
  readonly hitbox: Aabb3D | null;
  readonly isLeaving: boolean;
  spawnAt(waypoints: readonly Waypoint[], onArrived: () => void): void;
  leaveAlong(waypoints: readonly Waypoint[], onExited: () => void, options?: { fall?: boolean; hitDir?: FallDir }): void;
  update(dt: number): void;
  hide(): void;
  clearFall(): void;
}

const SHIRT_COLORS = [PALETTE.pinkBlush, PALETTE.matchaGreen, PALETTE.syrupPeach, PALETTE.glassBlue];
const WALK_SPEED = 1.9;
const HITBOX_HALF_W = 0.28;
const HITBOX_HEIGHT = 1.56;

// Tạo nhân vật khách hàng đơn giản từ khối capsule/hình cầu có viền đen và di chuyển theo waypoint
export function createCustomerActor(): CustomerActor {
  const root = new THREE.Group();
  root.visible = false;

  const torsoMat = new THREE.MeshToonMaterial({
    color: SHIRT_COLORS[0],
    gradientMap: getToonMaterial(SHIRT_COLORS[0]).gradientMap,
  });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.46, 6, 12), torsoMat);
  torso.position.set(0, 0.72, 0);
  torso.castShadow = true;
  addOutline(torso, 0.014);
  root.add(torso);

  // Chân trụ đơn giản
  root.add(makeBox(0.14, 0.34, 0.14, PALETTE.teaDark, -0.1, 0.17, 0, 0.01));
  root.add(makeBox(0.14, 0.34, 0.14, PALETTE.teaDark, 0.1, 0.17, 0, 0.01));

  // Đầu và mắt nhìn về phía +Z cục bộ
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 16, 12),
    getToonMaterial(PALETTE.creamTrim),
  );
  head.position.set(0, 1.32, 0);
  head.castShadow = true;
  addOutline(head, 0.012);
  root.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.215, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    getToonMaterial(PALETTE.bobaDark),
  );
  hair.position.set(0, 1.34, -0.02);
  addOutline(hair, 0.01);
  root.add(hair);

  root.add(makeBox(0.04, 0.05, 0.03, PALETTE.outline, -0.07, 1.32, 0.19, 0));
  root.add(makeBox(0.04, 0.05, 0.03, PALETTE.outline, 0.07, 1.32, 0.19, 0));

  let path: readonly Waypoint[] = [];
  let pathIdx = 0;
  let walking = false;
  let leaving = false;
  let onDone: (() => void) | null = null;
  let walkTime = 0;
  let shirtIdx = 0;
  const fallAnim = createFallAnimation(root, 1.32);

  return {
    root,

    // shortcut: khách chỉ có hitbox để ném trúng và không tạo collider đẩy người chơi, nâng cấp khi cần đẩy vật lý
    get hitbox(): Aabb3D | null {
      if (!root.visible) return null;
      return fallAnim.getHitbox(root.position.x, root.position.z, HITBOX_HALF_W, HITBOX_HEIGHT);
    },

    get isLeaving(): boolean {
      return leaving;
    },

    spawnAt(waypoints, onArrived) {
      if (waypoints.length === 0) return;
      fallAnim.reset();
      root.rotation.set(0, 0, 0);
      shirtIdx = (shirtIdx + 1) % SHIRT_COLORS.length;
      torsoMat.color.setHex(SHIRT_COLORS[shirtIdx]);

      root.position.set(waypoints[0].x, 0, waypoints[0].z);
      root.visible = true;
      path = waypoints;
      pathIdx = 1;
      walking = waypoints.length > 1;
      leaving = false;
      onDone = onArrived;
      if (!walking) onArrived();
    },

    leaveAlong(waypoints, onExited, options) {
      path = waypoints;
      pathIdx = 0;
      walking = waypoints.length > 0;
      leaving = true;
      onDone = onExited;
      if (options?.fall) {
        fallAnim.trigger(FALL_DOWN_SEC + FALL_CUSTOMER_LIE_SEC + FALL_GETUP_SEC, options.hitDir, root.rotation.y);
      } else {
        fallAnim.reset();
      }
      if (!walking && !fallAnim.isActive()) {
        root.visible = false;
        leaving = false;
        onExited();
      }
    },

    update(dt) {
      if (!root.visible) return;
      if (fallAnim.update(dt)) return;
      walkTime += dt;

      if (!walking) {
        if (leaving && onDone) {
          root.visible = false;
          leaving = false;
          const cb = onDone;
          onDone = null;
          cb();
          return;
        }
        // Nhún nhẹ khi đứng chờ tại quầy
        root.position.y = Math.abs(Math.sin(walkTime * 3.0)) * 0.02;
        return;
      }

      const target = path[pathIdx];
      const dx = target.x - root.position.x;
      const dz = target.z - root.position.z;
      const dist = Math.hypot(dx, dz);
      const step = WALK_SPEED * dt;

      if (dist <= step) {
        root.position.x = target.x;
        root.position.z = target.z;
        pathIdx++;
        if (pathIdx >= path.length) {
          walking = false;
          root.position.y = 0;
          root.rotation.y = Math.PI; // Quay mặt về phía quầy (-Z)
          const cb = onDone;
          onDone = null;
          cb?.();
        }
        return;
      }

      root.position.x += (dx / dist) * step;
      root.position.z += (dz / dist) * step;
      root.position.y = Math.abs(Math.sin(walkTime * 9)) * 0.04;
      root.rotation.y = Math.atan2(dx, dz);
    },

    hide() {
      fallAnim.reset();
      root.rotation.set(0, 0, 0);
      root.position.y = 0;
      root.visible = false;
      walking = false;
      leaving = false;
      onDone = null;
    },

    clearFall() {
      fallAnim.reset();
    },
  };
}
