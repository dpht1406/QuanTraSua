import * as THREE from 'three';
import { PLAYER_CAT_VARIANT } from '../state/constantsCat.ts';
import { animateCat, createCat } from './catModel.ts';

export interface PlayerAvatar {
  update(dt: number): void;
  setVisibleToSelf(visible: boolean): void;
  dispose(): void;
}

const BACK_OFFSET = 0.18;
const MOVE_SPEED_THRESHOLD = 0.08;
const REF_WALK_SPEED = 3.4;

// Tạo avatar thân mèo xám bám theo vị trí XZ và hướng nhìn của camera (mặc định ẩn với chính mình)
export function createPlayerAvatar(
  scene: THREE.Scene,
  camera: THREE.Camera,
): PlayerAvatar {
  const rig = createCat(PLAYER_CAT_VARIANT);
  rig.root.name = 'playerCatAvatar';
  rig.root.visible = false;
  scene.add(rig.root);

  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  let lastDirX = 0;
  let lastDirZ = -1;
  let lastYaw = Math.PI;
  let animTime = 0;
  let disposed = false;

  const syncTransform = (): void => {
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);
    const horizLen = Math.hypot(camDir.x, camDir.z);
    if (horizLen > 1e-3) {
      lastDirX = camDir.x / horizLen;
      lastDirZ = camDir.z / horizLen;
      lastYaw = Math.atan2(lastDirX, lastDirZ);
    }
    rig.root.position.set(camPos.x - lastDirX * BACK_OFFSET, 0, camPos.z - lastDirZ * BACK_OFFSET);
    rig.root.rotation.y = lastYaw;
  };

  syncTransform();
  let prevX = camPos.x;
  let prevZ = camPos.z;

  return {
    update(dt) {
      if (disposed) return;
      syncTransform();

      const safeDt = Math.max(0, dt);
      const moved = Math.hypot(camPos.x - prevX, camPos.z - prevZ);
      prevX = camPos.x;
      prevZ = camPos.z;

      const speed = safeDt > 1e-5 ? moved / safeDt : 0;
      const walking = speed > MOVE_SPEED_THRESHOLD;
      animTime += safeDt;
      animateCat(rig, walking ? 'walk' : 'idle', animTime, walking ? Math.min(1.6, speed / REF_WALK_SPEED) : 1);
    },

    setVisibleToSelf(visible) {
      if (disposed) return;
      rig.root.visible = visible;
      // Ẩn riêng phần đầu khi tự bật xem thân mèo để không che camera góc nhìn thứ nhất
      rig.head.visible = !visible;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      rig.root.removeFromParent();
      const disposedGeos = new Set<THREE.BufferGeometry>();
      rig.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && !disposedGeos.has(obj.geometry)) {
          disposedGeos.add(obj.geometry);
          obj.geometry.dispose();
        }
      });
    },
  };
}
