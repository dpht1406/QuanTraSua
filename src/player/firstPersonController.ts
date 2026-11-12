import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { InputState } from '../core/input.ts';
import { PLAYER_SPRINT_SPEED, PLAYER_WALK_SPEED } from '../physics/constantsPhysics.ts';
import type { PlayerBody } from '../physics/playerBody.ts';

export interface FirstPersonController {
  lock(): void;
  unlock(): void;
  isLocked(): boolean;
  update(dt: number): void;
  syncAfterPhysics?(alpha: number): void;
  dispose(): void;
}

// Điều khiển góc nhìn thứ nhất với PointerLock, WASD/Shift và thân động Rapier
export function createFirstPersonController(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
  input: InputState,
  playerBody: PlayerBody,
  onLockChange: (locked: boolean) => void,
): FirstPersonController {
  const controls = new PointerLockControls(camera, domElement);
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const moveDir = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  const startEye = playerBody.getEyePosition(1);
  camera.position.set(startEye.x, startEye.y, startEye.z);

  const handleLock = () => onLockChange(true);
  const handleUnlock = () => {
    input.clear();
    playerBody.setMoveVelocity(0, 0);
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
      if (!controls.isLocked) {
        playerBody.setMoveVelocity(0, 0, dt);
        return;
      }

      const forwardInput =
        (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
      const sideInput =
        (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);

      if (forwardInput === 0 && sideInput === 0) {
        playerBody.setMoveVelocity(0, 0, dt);
        return;
      }

      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() > 1e-8) {
        forward.normalize();
      } else {
        // Khi nhìn thẳng lên/xuống sàn, suy hướng ngang từ góc yaw của camera để không bị đứng im
        euler.setFromQuaternion(camera.quaternion, 'YXZ');
        forward.set(-Math.sin(euler.y), 0, -Math.cos(euler.y));
      }

      right.crossVectors(forward, camera.up).normalize();

      moveDir.set(0, 0, 0);
      moveDir.addScaledVector(forward, forwardInput);
      moveDir.addScaledVector(right, sideInput);
      if (moveDir.lengthSq() > 0) moveDir.normalize();

      const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
      const speed = sprint ? PLAYER_SPRINT_SPEED : PLAYER_WALK_SPEED;
      playerBody.setMoveVelocity(moveDir.x * speed, moveDir.z * speed, dt);
    },

    syncAfterPhysics(alpha) {
      if (!playerBody.body) return;
      const eye = playerBody.getEyePosition(alpha);
      camera.position.set(eye.x, eye.y, eye.z);
    },

    dispose() {
      controls.removeEventListener('lock', handleLock);
      controls.removeEventListener('unlock', handleUnlock);
      playerBody.setMoveVelocity(0, 0);
      controls.dispose();
    },
  };
}
