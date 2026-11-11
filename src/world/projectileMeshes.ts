import * as THREE from 'three';
import type { ThrowObjectKind } from '../state/gameState.ts';
import type { Cup } from '../state/scoring.ts';
import { createMaterial, markShadow } from '../styles/materials.ts';
import { PALETTE } from '../styles/palette.ts';
import { createHeldMesh } from './heldMeshes.ts';

export interface ProjectileVisual {
  root: THREE.Group;
  inner: THREE.Object3D;
}

const CUP_BASE_COLOR = {
  traditional: PALETTE.teaBrown,
  matcha: PALETTE.matchaGreen,
  peach: PALETTE.syrupPeach,
} as const;

// Tạo mesh 3D cho vật đang bay/nằm từ mô hình vật cầm có sẵn và bật đổ bóng khi bay
export function createProjectileVisual(kind: ThrowObjectKind, cup?: Cup): ProjectileVisual {
  const root = new THREE.Group();
  const inner = createHeldMesh(kind, { castShadow: true, receiveShadow: false });
  if (kind === 'cup' && cup) {
    const lid = inner.getObjectByName('cupLid');
    if (lid) lid.visible = cup.sealed;
    const liquid = inner.getObjectByName('cupLiquid');
    if (liquid instanceof THREE.Mesh) {
      liquid.visible = cup.base !== null;
      if (cup.base) {
        liquid.material = createMaterial('plastic', CUP_BASE_COLOR[cup.base], { roughness: 0.3 });
      }
    }
    const topping = inner.getObjectByName('cupTopping');
    if (topping) topping.visible = Boolean(cup.topping && cup.topping !== 'none');
  }
  markShadow(inner, true, false);
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
