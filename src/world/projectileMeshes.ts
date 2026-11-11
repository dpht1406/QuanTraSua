import * as THREE from 'three';
import type { ThrowObjectKind } from '../state/gameState.ts';
import type { Cup } from '../state/scoring.ts';
import { createHeldMesh } from './heldMeshes.ts';

export interface ProjectileVisual {
  root: THREE.Group;
  inner: THREE.Object3D;
}

// Tạo mesh 3D cho vật đang bay/nằm từ mô hình vật cầm có sẵn
export function createProjectileVisual(kind: ThrowObjectKind, cup?: Cup): ProjectileVisual {
  const root = new THREE.Group();
  const inner = createHeldMesh(kind);
  if (kind === 'cup' && cup && !cup.sealed && inner.children[1]) {
    inner.children[1].visible = false;
  }
  root.add(inner);
  return { root, inner };
}

// Đặt tư thế nằm gọn trên mặt phẳng khi vật đã dừng
export function setProjectileLandedPose(
  visual: ProjectileVisual,
  kind: ThrowObjectKind,
  x: number,
  y: number,
  z: number,
  yaw: number,
): void {
  if (kind === 'cup') {
    visual.inner.rotation.set(0, 0, 0);
    visual.root.rotation.set(0, yaw, 0);
    visual.root.position.set(x, y, z);
    return;
  }
  visual.inner.rotation.set(Math.PI / 2, 0, 0);
  visual.root.rotation.set(0, yaw, 0);
  visual.root.position.set(x, y - 0.03, z);
}
