import * as THREE from 'three';
import { addOutline } from '../styles/outline.ts';
import { getToonMaterial, PALETTE } from '../styles/palette.ts';
import { makeBox } from './furniture.ts';

export interface Waypoint {
  x: number;
  z: number;
}

export interface CustomerActor {
  root: THREE.Group;
  spawnAt(waypoints: readonly Waypoint[], onArrived: () => void): void;
  leaveAlong(waypoints: readonly Waypoint[], onExited: () => void): void;
  update(dt: number): void;
  hide(): void;
}

const SHIRT_COLORS = [PALETTE.pinkBlush, PALETTE.matchaGreen, PALETTE.syrupPeach, PALETTE.glassBlue];
const WALK_SPEED = 1.9;

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
  let onDone: (() => void) | null = null;
  let walkTime = 0;
  let shirtIdx = 0;

  return {
    root,

    spawnAt(waypoints, onArrived) {
      if (waypoints.length === 0) return;
      shirtIdx = (shirtIdx + 1) % SHIRT_COLORS.length;
      torsoMat.color.setHex(SHIRT_COLORS[shirtIdx]);

      root.position.set(waypoints[0].x, 0, waypoints[0].z);
      root.visible = true;
      path = waypoints;
      pathIdx = 1;
      walking = waypoints.length > 1;
      onDone = onArrived;
      if (!walking) onArrived();
    },

    leaveAlong(waypoints, onExited) {
      path = waypoints;
      pathIdx = 0;
      walking = waypoints.length > 0;
      onDone = onExited;
      if (!walking) {
        root.visible = false;
        onExited();
      }
    },

    update(dt) {
      if (!root.visible) return;
      walkTime += dt;

      if (!walking) {
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
      root.visible = false;
      walking = false;
      onDone = null;
    },
  };
}
