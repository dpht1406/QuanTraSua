import * as THREE from 'three';
import {
  DEFAULT_GRAPHICS_QUALITY,
  PIXEL_RATIO_LOW,
  PIXEL_RATIO_MAX_HIGH,
} from '../state/constantsGraphics.ts';
import { parseGraphicsQuality, type GraphicsQuality } from '../state/graphicsQuality.ts';
import { invalidateAllMaterials } from '../styles/materials.ts';
import type { LightingController } from './lighting.ts';

const appliedQuality = new WeakMap<object, GraphicsQuality>();

// Tính pixelRatio phù hợp với mức chất lượng và thiết bị hiện tại (an toàn trên Node)
export function getPixelRatioForQuality(q: GraphicsQuality): number {
  if (parseGraphicsQuality(q) === 'low') return PIXEL_RATIO_LOW;
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  return Math.min(dpr, PIXEL_RATIO_MAX_HIGH);
}

// Đọc lại mức chất lượng đã áp dụng gần nhất cho renderer (phục vụ sự kiện resize)
export function getAppliedGraphicsQuality(renderer: THREE.WebGLRenderer): GraphicsQuality {
  return appliedQuality.get(renderer) ?? DEFAULT_GRAPHICS_QUALITY;
}

// Áp dụng ngay mức chất lượng đồ họa lên renderer, hệ thống đèn và biên dịch lại vật liệu
export function applyGraphicsQuality(
  renderer: THREE.WebGLRenderer,
  lighting: Pick<LightingController, 'setQuality'>,
  q: GraphicsQuality,
): void {
  const quality = parseGraphicsQuality(q);
  appliedQuality.set(renderer, quality);

  const isHigh = quality === 'high';
  renderer.shadowMap.enabled = isHigh;
  if (isHigh) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.needsUpdate = true;
  }
  renderer.setPixelRatio(getPixelRatioForQuality(quality));

  lighting.setQuality(quality);
  invalidateAllMaterials();
}
