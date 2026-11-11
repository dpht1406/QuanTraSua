import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { InputState } from '../core/input.ts';
import { resolveAabbMove, type AabbBox } from './collision.ts';

export interface FirstPersonController {
  lock(): void;
  unlock(): void;
  isLocked(): boolean;
  update(dt: number): void;
  dispose(): void;
}

const WALK_SPEED = 3.4;
const SPRINT_SPEED = 5.0;
const PLAYER_RADIUS = 0.32;
const EYE_HEIGHT = 1.65;

// Điều khiển góc nhìn thứ nhất với PointerLock, WASD/Shift và va chạm AABB
export function createFirstPersonController(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
  input: InputState,
  colliders: readonly AabbBox[],
  onLockChange: (locked: boolean) => void,
): FirstPersonController {
  const controls = new PointerLockControls(camera, domElement);
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const moveDir = new THREE.Vector3();

  camera.position.set(0, EYE_HEIGHT, 1.8);

  const handleLock = () => onLockChange(true);
  const handleUnlock = () => {
    input.clear();
    onLockChange(false);
  };

  controls.addEventListener('lock', handleLock);
  controls.addEventListener('unlock', handleUnlock);

  return {
    lock() {
      try {
        controls.lock();
      } catch {
        // Trình duyệt có thể từ chối khóa chuột nếu bấm quá sát lúc vừa nhấn Esc
      }
    },

    unlock() {
      if (controls.isLocked) {
        controls.unlock();
      }
    },

    isLocked() {
      return controls.isLocked;
    },

    update(dt) {
      if (!controls.isLocked) return;

      const forwardInput =
        (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
      const sideInput =
        (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);

      if (forwardInput === 0 && sideInput === 0) return;

      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() > 0) forward.normalize();

      right.crossVectors(forward, camera.up).normalize();

      moveDir.set(0, 0, 0);
      moveDir.addScaledVector(forward, forwardInput);
      moveDir.addScaledVector(right, sideInput);
      if (moveDir.lengthSq() > 0) moveDir.normalize();

      const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
      const speed = sprint ? SPRINT_SPEED : WALK_SPEED;

      const targetX = camera.position.x + moveDir.x * speed * dt;
      const targetZ = camera.position.z + moveDir.z * speed * dt;
      const resolved = resolveAabbMove(
        camera.position.x,
        camera.position.z,
        targetX,
        targetZ,
        PLAYER_RADIUS,
        colliders,
      );

      camera.position.set(resolved.x, EYE_HEIGHT, resolved.z);
    },

    dispose() {
      controls.removeEventListener('lock', handleLock);
      controls.removeEventListener('unlock', handleUnlock);
      controls.dispose();
    },
  };
}
