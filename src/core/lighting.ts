import * as THREE from 'three';
import {
  CEILING_LAMP_COLOR, CEILING_LAMP_DECAY, CEILING_LAMP_DISTANCE,
  CEILING_LAMP_INTENSITY, CEILING_LAMP_POSITIONS, DEFAULT_GRAPHICS_QUALITY,
  DEFAULT_LIGHTING_BOUNDS, HEMI_GROUND_COLOR, HEMI_INTENSITY_DIMMED,
  HEMI_INTENSITY_NORMAL, HEMI_SKY_COLOR, MAX_POINT_LIGHTS_HIGH,
  MAX_POINT_LIGHTS_LOW, SHADOW_MAP_SIZE_HIGH, SHOP_DOOR_DAYLIGHT_FEATHER,
  SHOP_OUTAGE_DIM_FACTOR, SHOP_WALL_DIM_INSET, STREET_SHADOW_MIN_MAX_Y,
  STREET_SHADOW_PADDING, STREET_SUN_DISTANCE_SCALE, SUN_COLOR,
  SUN_INTENSITY_DIMMED, SUN_INTENSITY_NORMAL, SUN_POSITION,
  SUN_SHADOW_BIAS, SUN_SHADOW_NORMAL_BIAS, SUN_SHADOW_RADIUS,
  WINDOW_FILL_COLOR, WINDOW_FILL_DECAY, WINDOW_FILL_DISTANCE,
  WINDOW_FILL_INTENSITY, WINDOW_FILL_OFFSET,
} from '../state/constantsGraphics.ts';
import { parseGraphicsQuality, type GraphicsQuality } from '../state/graphicsQuality.ts';

export interface LightingBounds {
  minX: number; maxX: number; minY?: number; maxY?: number; minZ: number; maxZ: number;
}
export interface LightingOptions { shadowBounds?: LightingBounds }
export interface LightingController {
  setQuality(q: GraphicsQuality): void;
  setDimmed(dimmed: boolean): void;
  update?(dt: number): void;
  dispose(): void;
}

const MATERIAL_SCAN_INTERVAL_SEC = 0.5;
const INDOOR_DIM_VERT_INJECT = `#include <project_vertex>
vec4 indoorWp = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  indoorWp = batchingMatrix * indoorWp;
#endif
#ifdef USE_INSTANCING
  indoorWp = instanceMatrix * indoorWp;
#endif
vIndoorWorldPos = ( modelMatrix * indoorWp ).xyz;`;

const INDOOR_DIM_FRAG_INJECT = `#include <aomap_fragment>
if (uShopOutageDim > 0.001) {
  float ix = smoothstep(uShopDimMin.x - 0.04, uShopDimMin.x + 0.04, vIndoorWorldPos.x) * (1.0 - smoothstep(uShopDimMax.x - 0.04, uShopDimMax.x + 0.04, vIndoorWorldPos.x));
  float iy = smoothstep(uShopDimMin.y - 0.04, uShopDimMin.y + 0.04, vIndoorWorldPos.y) * (1.0 - smoothstep(uShopDimMax.y - 0.03, uShopDimMax.y + 0.03, vIndoorWorldPos.y));
  float iz = smoothstep(uShopDimMin.z - 0.04, uShopDimMin.z + 0.04, vIndoorWorldPos.z) * (1.0 - smoothstep(uShopDimMax.z - ${SHOP_DOOR_DAYLIGHT_FEATHER.toFixed(2)}, uShopDimMax.z + 0.04, vIndoorWorldPos.z));
  float dimFactor = mix(1.0, 1.0 - uShopOutageDim, ix * iy * iz);
  reflectedLight.directDiffuse *= dimFactor;
  reflectedLight.indirectDiffuse *= dimFactor;
  reflectedLight.directSpecular *= dimFactor;
  reflectedLight.indirectSpecular *= dimFactor;
}`;

const indoorDimUniforms = {
  uShopOutageDim: { value: 0 },
  uShopDimMin: { value: new THREE.Vector3(-5.08, -0.25, -4.08) },
  uShopDimMax: { value: new THREE.Vector3(5.08, 3.46, 4.02) },
};

function patchIndoorDimMaterial(mat: THREE.MeshStandardMaterial): void {
  if (mat.userData.__indoorDimPatched) return;
  mat.userData.__indoorDimPatched = true;
  const prevCompile = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;

  mat.customProgramCacheKey = () => {
    const base = prevKey ? prevKey.call(mat) : '';
    return base ? `${base}|shop-indoor-dim-v1` : 'shop-indoor-dim-v1';
  };

  mat.onBeforeCompile = (shader, renderer) => {
    prevCompile?.call(mat, shader, renderer);
    shader.uniforms.uShopOutageDim = indoorDimUniforms.uShopOutageDim;
    shader.uniforms.uShopDimMin = indoorDimUniforms.uShopDimMin;
    shader.uniforms.uShopDimMax = indoorDimUniforms.uShopDimMax;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vIndoorWorldPos;')
      .replace('#include <project_vertex>', INDOOR_DIM_VERT_INJECT);
    const dimDecl = '#include <common>\nuniform float uShopOutageDim;\nuniform vec3 uShopDimMin;\nuniform vec3 uShopDimMax;\nvarying vec3 vIndoorWorldPos;';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', dimDecl)
      .replace('#include <aomap_fragment>', INDOOR_DIM_FRAG_INJECT);
  };
  mat.needsUpdate = true;
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

function traverseSceneMaterials(scene: THREE.Scene, patchIndoor: boolean, markUpdate: boolean): void {
  const seen = new Set<THREE.Material>();
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat || seen.has(mat)) continue;
      seen.add(mat);
      if (patchIndoor && mat instanceof THREE.MeshStandardMaterial) patchIndoorDimMaterial(mat);
      if (markUpdate) mat.needsUpdate = true;
    }
  });
}

function configureSunShadow(sun: THREE.DirectionalLight, bounds: LightingBounds, isWorldMode: boolean): void {
  const scx = (bounds.minX + bounds.maxX) * 0.5;
  const scz = (bounds.minZ + bounds.maxZ) * 0.5;
  const sunScale = isWorldMode ? STREET_SUN_DISTANCE_SCALE : 1;

  sun.position.set(scx + SUN_POSITION.x * sunScale, SUN_POSITION.y * sunScale, scz + SUN_POSITION.z * sunScale);
  sun.target.position.set(scx, 0, scz);
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE_HIGH, SHADOW_MAP_SIZE_HIGH);
  sun.shadow.bias = SUN_SHADOW_BIAS;
  sun.shadow.normalBias = SUN_SHADOW_NORMAL_BIAS;
  sun.shadow.radius = SUN_SHADOW_RADIUS;

  if (!isWorldMode) {
    const halfW = Math.max(2, (bounds.maxX - bounds.minX) * 0.5 + 1.5);
    const halfD = Math.max(2, (bounds.maxZ - bounds.minZ) * 0.5 + 1.5);
    Object.assign(sun.shadow.camera, {
      near: 0.5,
      far: Math.max(20, Math.hypot(halfW, halfD) * 2 + SUN_POSITION.y + 8),
      left: -halfW, right: halfW, top: halfD, bottom: -halfD,
    });
    sun.shadow.camera.updateProjectionMatrix();
    return;
  }

  // Tính frustum vừa khít 8 góc quán + phố trong không gian ánh nắng để không bị cắt bóng ở rìa và vẫn nét
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  const cam = sun.shadow.camera;
  cam.position.copy(sun.position);
  cam.lookAt(sun.target.position);
  cam.updateMatrixWorld();

  const inv = cam.matrixWorldInverse;
  const minX = bounds.minX - STREET_SHADOW_PADDING;
  const maxX = bounds.maxX + STREET_SHADOW_PADDING;
  const minY = bounds.minY ?? 0;
  const maxY = Math.max(bounds.maxY ?? STREET_SHADOW_MIN_MAX_Y, STREET_SHADOW_MIN_MAX_Y);
  const minZ = bounds.minZ - STREET_SHADOW_PADDING;
  const maxZ = bounds.maxZ + STREET_SHADOW_PADDING;

  let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity, zMin = Infinity, zMax = -Infinity;
  const corner = new THREE.Vector3();
  for (const x of [minX, maxX]) for (const y of [minY, maxY]) for (const z of [minZ, maxZ]) {
    corner.set(x, y, z).applyMatrix4(inv);
    l = Math.min(l, corner.x); r = Math.max(r, corner.x);
    b = Math.min(b, corner.y); t = Math.max(t, corner.y);
    zMin = Math.min(zMin, corner.z); zMax = Math.max(zMax, corner.z);
  }
  Object.assign(cam, {
    left: l, right: r, bottom: b, top: t,
    near: Math.max(0.5, -zMax - 2), far: Math.max(20, -zMin + 2),
  });
  cam.updateProjectionMatrix();
}

// Khởi tạo ánh sáng ngoài trời (Hemisphere + Directional bóng rộng) và đèn nội thất (trần + cửa sổ)
export function setupLighting(
  scene: THREE.Scene,
  bounds: LightingBounds = DEFAULT_LIGHTING_BOUNDS,
  opts: LightingOptions = {},
): LightingController {
  const group = new THREE.Group();
  group.name = '__shopLighting';

  const isWorldMode = Boolean(opts.shadowBounds);
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cz = (bounds.minZ + bounds.maxZ) * 0.5;
  const lampMaxY = (bounds.maxY ?? DEFAULT_LIGHTING_BOUNDS.maxY) - 0.85;

  if (isWorldMode) {
    indoorDimUniforms.uShopDimMin.value.set(
      bounds.minX - SHOP_WALL_DIM_INSET, (bounds.minY ?? 0) - 0.25, bounds.minZ - SHOP_WALL_DIM_INSET,
    );
    indoorDimUniforms.uShopDimMax.value.set(
      bounds.maxX + SHOP_WALL_DIM_INSET, (bounds.maxY ?? DEFAULT_LIGHTING_BOUNDS.maxY) + 0.06, bounds.maxZ + 0.02,
    );
    indoorDimUniforms.uShopOutageDim.value = 0;
  }

  const hemi = new THREE.HemisphereLight(HEMI_SKY_COLOR, HEMI_GROUND_COLOR, HEMI_INTENSITY_NORMAL);
  hemi.name = isWorldMode ? 'outdoorSkyLight' : 'shopSkyLight';
  hemi.userData.lightRole = isWorldMode ? 'outdoor' : 'indoor';

  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY_NORMAL);
  sun.name = isWorldMode ? 'outdoorSunLight' : 'shopSunLight';
  sun.userData.lightRole = isWorldMode ? 'outdoor' : 'indoor';
  sun.castShadow = true;
  configureSunShadow(sun, opts.shadowBounds ?? bounds, isWorldMode);

  const pointLights = CEILING_LAMP_POSITIONS.slice(0, MAX_POINT_LIGHTS_HIGH).map(([lx, ly, lz]) => {
    const pt = new THREE.PointLight(CEILING_LAMP_COLOR, CEILING_LAMP_INTENSITY, CEILING_LAMP_DISTANCE, CEILING_LAMP_DECAY);
    pt.name = 'indoorCeilingLight';
    pt.userData.lightRole = 'indoor';
    pt.position.set(cx + lx, Math.min(ly, lampMaxY), cz + lz);
    pt.castShadow = false;
    return pt;
  });

  const windowFill = isWorldMode
    ? new THREE.PointLight(WINDOW_FILL_COLOR, WINDOW_FILL_INTENSITY, WINDOW_FILL_DISTANCE, WINDOW_FILL_DECAY)
    : null;
  if (windowFill) {
    windowFill.name = 'indoorWindowFillLight';
    windowFill.userData.lightRole = 'indoor';
    windowFill.position.set(cx + WINDOW_FILL_OFFSET.x, Math.min(WINDOW_FILL_OFFSET.y, lampMaxY), cz + WINDOW_FILL_OFFSET.z);
    windowFill.castShadow = false;
    group.add(windowFill);
  }
  group.add(hemi, sun, sun.target, ...pointLights);
  scene.add(group);

  let quality: GraphicsQuality = DEFAULT_GRAPHICS_QUALITY;
  let dimmed = false;
  let disposed = false;
  let initialPatched = false;
  let scanAccum = 0;

  const applyState = () => {
    if (disposed) return;
    const isHigh = quality === 'high';
    if (isWorldMode) {
      // Ngoài phố luôn giữ sáng ban ngày khi mất điện; chỉ tối đèn & không gian trong quán
      indoorDimUniforms.uShopOutageDim.value = dimmed ? SHOP_OUTAGE_DIM_FACTOR : 0;
    } else {
      hemi.intensity = dimmed ? HEMI_INTENSITY_DIMMED : HEMI_INTENSITY_NORMAL;
      sun.intensity = dimmed ? SUN_INTENSITY_DIMMED : SUN_INTENSITY_NORMAL;
    }
    sun.castShadow = isHigh;

    const activeCount = isHigh ? pointLights.length : Math.min(MAX_POINT_LIGHTS_LOW, pointLights.length);
    pointLights.forEach((pt, idx) => {
      pt.visible = idx < activeCount;
      pt.intensity = dimmed ? 0 : CEILING_LAMP_INTENSITY;
    });
    if (windowFill) {
      windowFill.visible = isHigh;
      windowFill.intensity = dimmed ? 0 : WINDOW_FILL_INTENSITY;
    }
    syncCeilingLampGlobes(scene, dimmed);
  };

  applyState();

  return {
    setQuality(q) {
      quality = parseGraphicsQuality(q);
      applyState();
      traverseSceneMaterials(scene, isWorldMode, true);
    },
    setDimmed(v) {
      dimmed = Boolean(v);
      if (isWorldMode) {
        traverseSceneMaterials(scene, true, false);
        initialPatched = true;
      }
      applyState();
    },
    update(dt) {
      if (disposed || !isWorldMode) return;
      scanAccum += dt;
      if (!initialPatched || scanAccum >= MATERIAL_SCAN_INTERVAL_SEC) {
        initialPatched = true;
        scanAccum = 0;
        traverseSceneMaterials(scene, true, false);
      }
    },
    dispose() {
      if (disposed) return;
      if (dimmed) syncCeilingLampGlobes(scene, false);
      if (isWorldMode) indoorDimUniforms.uShopOutageDim.value = 0;
      disposed = true;
      sun.shadow.map?.dispose();
      [hemi, sun, ...pointLights, ...(windowFill ? [windowFill] : [])].forEach((l) => l.dispose());
      group.removeFromParent();
    },
  };
}
