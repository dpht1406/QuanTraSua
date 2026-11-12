import * as THREE from 'three';
import { CUSTOMER_COLLIDER_HALF_W } from '../physics/constantsPhysics.ts';
import { CAT_VARIANTS, pickVariant } from '../state/catVariants.ts';
import { CAT_BASE_HEIGHT } from '../state/constantsCat.ts';
import { CUSTOMER_WALK_SPEED } from '../state/constantsStreet.ts';
import { FALL_CUSTOMER_LIE_SEC, FALL_DOWN_SEC, FALL_GETUP_SEC } from '../state/constantsThrow.ts';
import {
  resolveCustomerEntryWaypoints,
  resolveCustomerExitWaypoints,
} from '../state/pedestrianMotion.ts';
import { animateCat, createCat, type CatRig } from './catModel.ts';
import { nextCustomerVariantIndex } from './customerVariant.ts';
import { createFallAnimation, type FallDir } from './fallAnimation.ts';
import type { Aabb3D } from './shopWorld.ts';

export interface Waypoint {
  x: number;
  z: number;
}

export interface CustomerActor {
  root: THREE.Group;
  readonly hitbox: Aabb3D | null;
  readonly isLeaving: boolean;
  readonly teleportVersion?: number;
  spawnAt(waypoints: readonly Waypoint[], onArrived: () => void): void;
  leaveAlong(waypoints: readonly Waypoint[], onExited: () => void, options?: { fall?: boolean; hitDir?: FallDir }): void;
  update(dt: number): void;
  hide(): void;
  clearFall(): void;
}

const WALK_SPEED = CUSTOMER_WALK_SPEED;
const HITBOX_HALF_W = CUSTOMER_COLLIDER_HALF_W;
const HITBOX_HEIGHT = CAT_BASE_HEIGHT;
const FALL_HEAD_Y = 1.32;

function disposeRigGeometries(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh && child.name !== '__outline') {
      child.geometry.dispose();
    }
  });
}

// Tạo nhân vật khách hàng mèo chibi di chuyển theo waypoint và giữ nguyên API hitbox/ngã
export function createCustomerActor(): CustomerActor {
  const root = new THREE.Group();
  root.visible = false;

  let rig: CatRig | null = null;
  let lastVariantIdx: number | null = null;
  let path: readonly Waypoint[] = [];
  let pathIdx = 0;
  let walking = false;
  let leaving = false;
  let onDone: (() => void) | null = null;
  let walkTime = 0;
  let teleportVersion = 0;
  const fallAnim = createFallAnimation(root, FALL_HEAD_Y);

  return {
    root,

    // hitbox đồng bộ sang thân kinematic Rapier ở actorBodies (chỉ va chạm projectile tới trước GĐ9c)
    get hitbox(): Aabb3D | null {
      if (!root.visible) return null;
      return fallAnim.getHitbox(root.position.x, root.position.z, HITBOX_HALF_W, HITBOX_HEIGHT);
    },

    get isLeaving(): boolean {
      return leaving;
    },

    get teleportVersion(): number {
      return teleportVersion;
    },

    spawnAt(waypoints, onArrived) {
      const resolved = resolveCustomerEntryWaypoints(waypoints);
      if (resolved.length === 0) return;
      teleportVersion++;
      fallAnim.reset();
      root.rotation.set(0, 0, 0);
      root.position.set(resolved[0].x, 0, resolved[0].z);
      if (resolved.length > 1) {
        const dx = resolved[1].x - resolved[0].x;
        const dz = resolved[1].z - resolved[0].z;
        if (dx * dx + dz * dz > 1e-8) {
          root.rotation.y = Math.atan2(dx, dz);
        }
      }

      lastVariantIdx = nextCustomerVariantIndex(lastVariantIdx, CAT_VARIANTS.length);
      const variant = pickVariant(lastVariantIdx);
      if (rig) {
        rig.root.removeFromParent();
        disposeRigGeometries(rig.root);
      }
      rig = createCat(variant.id);
      root.add(rig.root);

      root.visible = true;
      path = resolved;
      pathIdx = 1;
      walking = resolved.length > 1;
      leaving = false;
      walkTime = 0;
      onDone = onArrived;
      animateCat(rig, walking ? 'walk' : 'idle', walkTime, WALK_SPEED);
      if (!walking) onArrived();
    },

    leaveAlong(waypoints, onExited, options) {
      const resolved = resolveCustomerExitWaypoints(waypoints, {
        x: root.position.x,
        z: root.position.z,
      });
      path = resolved;
      pathIdx = 0;
      walking = resolved.length > 0;
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
      const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
      // Dừng animateCat khi đang ngã/nằm để fallAnimation điều khiển độc lập
      if (fallAnim.update(safeDt)) return;
      walkTime += safeDt;

      if (!walking) {
        if (leaving && onDone) {
          root.visible = false;
          leaving = false;
          path = [];
          pathIdx = 0;
          const cb = onDone;
          onDone = null;
          cb();
          return;
        }
        root.position.y = 0;
        if (rig) animateCat(rig, 'idle', walkTime);
        return;
      }

      const target = path[pathIdx];
      const dx = target.x - root.position.x;
      const dz = target.z - root.position.z;
      const dist = Math.hypot(dx, dz);
      const step = WALK_SPEED * safeDt;

      if (dist <= step) {
        root.position.x = target.x;
        root.position.z = target.z;
        pathIdx++;
        if (pathIdx >= path.length) {
          walking = false;
          root.position.y = 0;
          if (leaving) {
            root.visible = false;
            leaving = false;
            path = [];
            pathIdx = 0;
          } else {
            root.rotation.y = Math.PI; // Quay mặt về phía quầy (-Z)
            if (rig) animateCat(rig, 'idle', walkTime);
          }
          const cb = onDone;
          onDone = null;
          cb?.();
          return;
        }
        if (rig) animateCat(rig, 'walk', walkTime, WALK_SPEED);
        return;
      }

      root.position.x += (dx / dist) * step;
      root.position.z += (dz / dist) * step;
      root.position.y = 0;
      root.rotation.y = Math.atan2(dx, dz);
      if (rig) animateCat(rig, 'walk', walkTime, WALK_SPEED);
    },

    hide() {
      teleportVersion++;
      fallAnim.reset();
      root.rotation.set(0, 0, 0);
      root.position.y = 0;
      root.visible = false;
      path = [];
      pathIdx = 0;
      walking = false;
      leaving = false;
      onDone = null;
    },

    clearFall() {
      fallAnim.reset();
    },
  };
}
