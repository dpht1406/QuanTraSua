import * as THREE from 'three';
import {
  CEILING_LAMP_COLOR,
  CEILING_LAMP_DECAY,
  CEILING_LAMP_DISTANCE,
  CEILING_LAMP_INTENSITY,
  CEILING_LAMP_POSITIONS,
  DEFAULT_GRAPHICS_QUALITY,
  DEFAULT_LIGHTING_BOUNDS,
  HEMI_GROUND_COLOR,
  HEMI_INTENSITY_DIMMED,
  HEMI_INTENSITY_NORMAL,
  HEMI_SKY_COLOR,
  MAX_POINT_LIGHTS_HIGH,
  MAX_POINT_LIGHTS_LOW,
  SHADOW_MAP_SIZE_HIGH,
  SUN_COLOR,
  SUN_INTENSITY_DIMMED,
  SUN_INTENSITY_NORMAL,
  SUN_POSITION,
  SUN_SHADOW_BIAS,
  SUN_SHADOW_NORMAL_BIAS,
  SUN_SHADOW_RADIUS,
} from '../state/constantsGraphics.ts';
import { parseGraphicsQuality, type GraphicsQuality } from '../state/graphicsQuality.ts';

export interface LightingBounds {
  minX: number;
  maxX: number;
  minY?: number;
  maxY?: number;
  minZ: number;
  maxZ: number;
}

export interface LightingController {
  setQuality(q: GraphicsQuality): void;
  setDimmed(dimmed: boolean): void;
  update?(dt: number): void;
  dispose(): void;
}

function syncCeilingLampGlobes(scene: THREE.Scene, dimmed: boolean): void {
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || obj.name !== 'ceilingLampGlobe') return;
    const mat = obj.material;
    if (!(mat instanceof THREE.MeshStandardMaterial)) return;
    if (typeof obj.userData.baseEmissiveIntensity !== 'number') {
      obj.userData.baseEmissiveIntensity = mat.emissiveIntensity;
    }
    mat.emissiveIntensity = dimmed ? 0 : obj.userData.baseEmissiveIntensity;
  });
}

function markSceneMaterialsNeedsUpdate(scene: THREE.Scene): void {
  const seen = new Set<THREE.Material>();
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (mat && !seen.has(mat)) {
        seen.add(mat);
        mat.needsUpdate = true;
      }
    }
  });
}

// Khởi tạo ánh sáng ấm bán thực tế: Hemisphere + Directional nắng có bóng mềm + tối đa 3 PointLight trần
export function setupLighting(
  scene: THREE.Scene,
  bounds: LightingBounds = DEFAULT_LIGHTING_BOUNDS,
): LightingController {
  const group = new THREE.Group();
  group.name = '__shopLighting';

  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cz = (bounds.minZ + bounds.maxZ) * 0.5;
  const halfW = Math.max(2, (bounds.maxX - bounds.minX) * 0.5 + 1.5);
  const halfD = Math.max(2, (bounds.maxZ - bounds.minZ) * 0.5 + 1.5);
  const lampMaxY = (bounds.maxY ?? DEFAULT_LIGHTING_BOUNDS.maxY) - 0.85;

  const hemi = new THREE.HemisphereLight(HEMI_SKY_COLOR, HEMI_GROUND_COLOR, HEMI_INTENSITY_NORMAL);

  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY_NORMAL);
  sun.position.set(cx + SUN_POSITION.x, SUN_POSITION.y, cz + SUN_POSITION.z);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE_HIGH, SHADOW_MAP_SIZE_HIGH);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 20;
  sun.shadow.camera.left = -halfW;
  sun.shadow.camera.right = halfW;
  sun.shadow.camera.top = halfD;
  sun.shadow.camera.bottom = -halfD;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = SUN_SHADOW_BIAS;
  sun.shadow.normalBias = SUN_SHADOW_NORMAL_BIAS;
  sun.shadow.radius = SUN_SHADOW_RADIUS;

  const pointLights = CEILING_LAMP_POSITIONS.slice(0, MAX_POINT_LIGHTS_HIGH).map(([lx, ly, lz]) => {
    const pt = new THREE.PointLight(
      CEILING_LAMP_COLOR,
      CEILING_LAMP_INTENSITY,
      CEILING_LAMP_DISTANCE,
      CEILING_LAMP_DECAY,
    );
    pt.position.set(cx + lx, Math.min(ly, lampMaxY), cz + lz);
    pt.castShadow = false;
    return pt;
  });

  group.add(hemi, sun, sun.target, ...pointLights);
  scene.add(group);

  let quality: GraphicsQuality = DEFAULT_GRAPHICS_QUALITY;
  let dimmed = false;
  let disposed = false;

  const applyState = () => {
    if (disposed) return;
    const isHigh = quality === 'high';
    hemi.intensity = dimmed ? HEMI_INTENSITY_DIMMED : HEMI_INTENSITY_NORMAL;
    sun.intensity = dimmed ? SUN_INTENSITY_DIMMED : SUN_INTENSITY_NORMAL;
    sun.castShadow = isHigh;

    const activeCount = isHigh ? pointLights.length : Math.min(MAX_POINT_LIGHTS_LOW, pointLights.length);
    pointLights.forEach((pt, idx) => {
      pt.visible = idx < activeCount;
      pt.intensity = dimmed ? 0 : CEILING_LAMP_INTENSITY;
    });
    syncCeilingLampGlobes(scene, dimmed);
  };

  applyState();

  return {
    setQuality(q) {
      quality = parseGraphicsQuality(q);
      applyState();
      markSceneMaterialsNeedsUpdate(scene);
    },

    setDimmed(v) {
      dimmed = Boolean(v);
      applyState();
    },

    dispose() {
      if (disposed) return;
      if (dimmed) syncCeilingLampGlobes(scene, false);
      disposed = true;
      sun.shadow.map?.dispose();
      hemi.dispose();
      sun.dispose();
      for (const pt of pointLights) pt.dispose();
      group.removeFromParent();
    },
  };
}
