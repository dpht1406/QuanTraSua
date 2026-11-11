import * as THREE from 'three';
import {
  DEFAULT_GRAPHICS_QUALITY,
  DEFAULT_LIGHTING_BOUNDS,
  GRAPHICS_EXPOSURE,
} from '../state/constantsGraphics.ts';
import type { GraphicsQuality } from '../state/graphicsQuality.ts';
import { PALETTE } from '../styles/palette.ts';
import { disposeTextures } from '../world/textures.ts';
import { setupLighting, type LightingBounds, type LightingController } from './lighting.ts';
import {
  applyGraphicsQuality,
  getAppliedGraphicsQuality,
  getPixelRatioForQuality,
} from './renderSettings.ts';

export interface SceneBundle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  lighting: LightingController;
  setDimmed(dimmed: boolean): void;
  dispose(): void;
}

export interface SceneSetupOptions {
  bounds?: LightingBounds;
  initialQuality?: GraphicsQuality;
}

// Khởi tạo Scene nền ấm pastel, Camera góc nhìn thứ nhất, ánh sáng GĐ8a và WebGLRenderer
export function createSceneSetup(
  container: HTMLElement,
  opts: SceneSetupOptions = {},
): SceneBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.background);

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 50);
  camera.position.set(0, 1.65, 2.0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = GRAPHICS_EXPOSURE;
  container.appendChild(renderer.domElement);

  const lighting = setupLighting(scene, opts.bounds ?? DEFAULT_LIGHTING_BOUNDS);
  applyGraphicsQuality(renderer, lighting, opts.initialQuality ?? DEFAULT_GRAPHICS_QUALITY);

  const onResize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(getPixelRatioForQuality(getAppliedGraphicsQuality(renderer)));
    renderer.setSize(w, h);
  };

  window.addEventListener('resize', onResize);

  return {
    scene,
    camera,
    renderer,
    lighting,
    setDimmed(dimmed) {
      lighting.setDimmed(dimmed);
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      lighting.dispose();
      disposeTextures();
      renderer.dispose();
    },
  };
}
