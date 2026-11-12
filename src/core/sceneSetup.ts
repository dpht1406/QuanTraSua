import * as THREE from 'three';
import {
  DEFAULT_GRAPHICS_QUALITY,
  DEFAULT_LIGHTING_BOUNDS,
  GRAPHICS_EXPOSURE,
  SKY_BACKGROUND_COLOR,
  SKY_FOG_COLOR,
  SKY_HORIZON_COLOR,
  SKY_MID_COLOR,
  SKY_TOP_COLOR,
  STREET_FOG_FAR,
  STREET_FOG_NEAR,
} from '../state/constantsGraphics.ts';
import type { GraphicsQuality } from '../state/graphicsQuality.ts';
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
  shadowBounds?: LightingBounds;
  initialQuality?: GraphicsQuality;
}

// Tạo nền trời ban ngày (gradient trên trình duyệt, màu phẳng an toàn trên Node)
export function createSkyBackground(): THREE.Color | THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.Color(SKY_BACKGROUND_COLOR);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.createLinearGradient !== 'function') {
    return new THREE.Color(SKY_BACKGROUND_COLOR);
  }
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, SKY_TOP_COLOR);
  grad.addColorStop(0.58, SKY_MID_COLOR);
  grad.addColorStop(1, SKY_HORIZON_COLOR);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Gắn nền trời ban ngày và sương nhẹ che rìa khu phố lên Scene
export function applyOutdoorEnvironment(scene: THREE.Scene): () => void {
  const skyBg = createSkyBackground();
  scene.background = skyBg;
  scene.fog = new THREE.Fog(SKY_FOG_COLOR, STREET_FOG_NEAR, STREET_FOG_FAR);
  return () => {
    if (skyBg instanceof THREE.Texture) skyBg.dispose();
  };
}

// Khởi tạo Scene nền trời + sương nhẹ, Camera góc nhìn thứ nhất, ánh sáng ngoài/trong quán và WebGLRenderer
export function createSceneSetup(
  container: HTMLElement,
  opts: SceneSetupOptions = {},
): SceneBundle {
  const scene = new THREE.Scene();
  const disposeEnv = applyOutdoorEnvironment(scene);

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 80);
  camera.position.set(0, 1.65, 2.0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = GRAPHICS_EXPOSURE;
  container.appendChild(renderer.domElement);

  const lighting = setupLighting(scene, opts.bounds ?? DEFAULT_LIGHTING_BOUNDS, {
    shadowBounds: opts.shadowBounds,
  });
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
      disposeEnv();
      lighting.dispose();
      disposeTextures();
      renderer.dispose();
    },
  };
}
