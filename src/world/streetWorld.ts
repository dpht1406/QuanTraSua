import * as THREE from 'three';
import type { AabbBox } from '../player/collision.ts';
import { parseGraphicsQuality, type GraphicsQuality } from '../state/graphicsQuality.ts';
import { markShadow } from '../styles/materials.ts';
import { buildStreetBuildings } from './streetBuildings.ts';
import { getStreetColliders } from './streetColliders.ts';
import { buildStreetProps } from './streetProps.ts';

export interface StreetWorld {
  colliders: AabbBox[];
  update(dt: number): void;
  setQuality(q: GraphicsQuality): void;
  setDimmed?(dimmed: boolean): void;
  setShopOpen?(open: boolean): void;
  dispose(): void;
}

function applyStreetShadowQuality(casters: readonly THREE.Object3D[], quality: GraphicsQuality): void {
  const cast = parseGraphicsQuality(quality) === 'high';
  for (const obj of casters) {
    obj.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || child.name === '__outline') return;
      if (child.name === 'streetLampBulb') {
        child.castShadow = false;
        child.receiveShadow = false;
        return;
      }
      if (child.parent?.name === 'streetTree' && child.geometry instanceof THREE.BoxGeometry) {
        child.castShadow = false;
        child.receiveShadow = true;
        return;
      }
      markShadow(child, cast, true);
    });
  }
}

// Dựng toàn bộ cảnh đường phố ngoài quán (vỉa hè, lòng đường, nhà, cây, đèn, ghế đá, thùng rác, collider tĩnh)
export function createStreet(scene: THREE.Scene, quality: GraphicsQuality): StreetWorld {
  const root = new THREE.Group();
  root.name = 'streetWorld';

  const buildings = buildStreetBuildings();
  const props = buildStreetProps();
  root.add(buildings.group, props.group);
  scene.add(root);

  const shadowCasters = [...buildings.shadowCasters, ...props.shadowCasters];
  applyStreetShadowQuality(shadowCasters, quality);

  const colliders = getStreetColliders();

  return {
    colliders,
    update(_dt) {},
    setQuality(q) {
      applyStreetShadowQuality(shadowCasters, q);
    },
    setDimmed(_dimmed) {
      // Mất điện chỉ làm tối trong quán, đường phố ban ngày giữ nguyên độ sáng
    },
    setShopOpen(_open) {},
    dispose() {
      const disposed = new Set<THREE.BufferGeometry>();
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && !disposed.has(obj.geometry)) {
          disposed.add(obj.geometry);
          obj.geometry.dispose();
        }
      });
      root.removeFromParent();
    },
  };
}
