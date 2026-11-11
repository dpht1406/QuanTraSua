import assert from 'node:assert/strict';
import * as THREE from 'three';
import { setupLighting } from '../core/lighting.ts';
import { applyGraphicsQuality, getPixelRatioForQuality } from '../core/renderSettings.ts';
import type { GameCtx } from '../gameplay/gameCtx.ts';
import { createInteractionSystem } from '../interaction/interactionSystem.ts';
import {
  DEFAULT_LIGHTING_BOUNDS,
  HEMI_INTENSITY_DIMMED,
  HEMI_INTENSITY_NORMAL,
  MAX_POINT_LIGHTS_HIGH,
  MAX_POINT_LIGHTS_LOW,
  OUTLINE_ENABLED,
  SHADOW_MAP_SIZE_HIGH,
  SUN_INTENSITY_DIMMED,
  SUN_INTENSITY_NORMAL,
} from '../state/constantsGraphics.ts';
import { createMaterial, markShadow, type MaterialKind } from '../styles/materials.ts';
import { addOutline } from '../styles/outline.ts';
import { runSelfCheck8Worldb } from './selfCheck8Worldb.ts';
import { runSelfCheck8Worldc } from './selfCheck8Worldc.ts';
import { createShopWorld } from './shopWorld.ts';
import { createToolRack } from './toolRack.ts';
import {
  getTileTexture,
  getWallTexture,
  getWoodFloorTexture,
  getWoodTableTexture,
} from './textures.ts';

function testOutlineAndMaterials(): void {
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createMaterial('paint', 0xffffff));
  const res = addOutline(box);
  assert.equal(OUTLINE_ENABLED, false);
  assert.equal(res, null);
  assert.equal(box.children.length, 0);

  const kinds: MaterialKind[] = ['wood', 'paint', 'plastic', 'metal', 'fabric', 'fur', 'glass', 'ceramic'];
  for (const kind of kinds) {
    const m1 = createMaterial(kind, 0xffeedd);
    const m2 = createMaterial(kind, 0xffeedd);
    assert.ok(m1 instanceof THREE.MeshStandardMaterial);
    assert.equal(m1, m2, `createMaterial(${kind}) phải cache cùng cặp tham số`);
    assert.ok(m1.roughness >= 0 && m1.roughness <= 1);
    assert.ok(m1.metalness >= 0 && m1.metalness <= 1);
    if (kind === 'glass') {
      assert.equal(m1.transparent, true);
      assert.ok(m1.opacity < 1);
    } else {
      assert.equal(m1.transparent, false);
    }
  }

  const custom = createMaterial('ceramic', 0xffffff, { roughness: 0.15, emissive: 0xffe0b5 });
  assert.equal(custom.roughness, 0.15);
  assert.equal(custom.emissive.getHex(), 0xffe0b5);

  const grp = new THREE.Group();
  const childA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), custom);
  const childB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), custom);
  const fakeOutline = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), custom);
  fakeOutline.name = '__outline';
  fakeOutline.castShadow = false;
  fakeOutline.receiveShadow = false;
  grp.add(childA, childB, fakeOutline);

  markShadow(grp, true, true);
  assert.equal(childA.castShadow, true);
  assert.equal(childA.receiveShadow, true);
  assert.equal(fakeOutline.castShadow, false);
  assert.equal(fakeOutline.receiveShadow, false);

  markShadow(grp, false, true);
  assert.equal(childB.castShadow, false);
  assert.equal(childB.receiveShadow, true);
}

function testTexturesSafeInNode(): void {
  assert.equal(getWoodFloorTexture(), null);
  assert.equal(getTileTexture(), null);
  assert.equal(getWallTexture(), null);
  assert.equal(getWoodTableTexture(), null);
}

function testLightingAndRenderSettings(): void {
  const scene = new THREE.Scene();
  const mat = createMaterial('wood', 0xb9825c);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  scene.add(mesh);

  const lighting = setupLighting(scene, DEFAULT_LIGHTING_BOUNDS);
  const lightGroup = scene.getObjectByName('__shopLighting');
  assert.ok(lightGroup);

  let hemi: THREE.HemisphereLight | null = null;
  let sun: THREE.DirectionalLight | null = null;
  const points: THREE.PointLight[] = [];
  lightGroup.traverse((obj) => {
    if (obj instanceof THREE.HemisphereLight) hemi = obj;
    else if (obj instanceof THREE.DirectionalLight) sun = obj;
    else if (obj instanceof THREE.PointLight) points.push(obj);
  });

  assert.ok(hemi);
  assert.ok(sun);
  const sunLight = sun as THREE.DirectionalLight;
  const hemiLight = hemi as THREE.HemisphereLight;
  assert.equal(sunLight.shadow.mapSize.x, SHADOW_MAP_SIZE_HIGH);
  assert.equal(sunLight.shadow.mapSize.y, SHADOW_MAP_SIZE_HIGH);
  assert.equal(sunLight.castShadow, true);
  assert.ok(points.length >= 1 && points.length <= 3);
  for (const pt of points) {
    assert.equal(pt.castShadow, false);
    assert.equal(pt.visible, true);
  }

  // setDimmed làm tối cả hemi, sun và tắt đèn điểm
  lighting.setDimmed(true);
  assert.equal(hemiLight.intensity, HEMI_INTENSITY_DIMMED);
  assert.equal(sunLight.intensity, SUN_INTENSITY_DIMMED);
  for (const pt of points) assert.equal(pt.intensity, 0);

  // Đổi quality trong khi đang dimmed vẫn giữ intensity = 0
  lighting.setQuality('low');
  assert.equal(sunLight.castShadow, false);
  assert.equal(points.filter((p) => p.visible).length, Math.min(MAX_POINT_LIGHTS_LOW, points.length));
  for (const pt of points) assert.equal(pt.intensity, 0);

  lighting.setDimmed(false);
  assert.equal(hemiLight.intensity, HEMI_INTENSITY_NORMAL);
  assert.equal(sunLight.intensity, SUN_INTENSITY_NORMAL);
  assert.ok(points[0].intensity > 0);

  // Kiểm tra applyGraphicsQuality cập nhật shadowMap, pixelRatio, lighting và material.version
  let appliedRatio = 0;
  const mockRenderer = {
    shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap, needsUpdate: false },
    setPixelRatio(r: number) {
      appliedRatio = r;
    },
  } as unknown as THREE.WebGLRenderer;

  const vBeforeLow = mat.version;
  applyGraphicsQuality(mockRenderer, lighting, 'low');
  assert.equal(mockRenderer.shadowMap.enabled, false);
  assert.equal(appliedRatio, 1);
  assert.equal(sunLight.castShadow, false);
  assert.ok(mat.version > vBeforeLow, 'applyGraphicsQuality(low) phải đánh dấu needsUpdate vật liệu');

  const vBeforeHigh = mat.version;
  applyGraphicsQuality(mockRenderer, lighting, 'high');
  assert.equal(mockRenderer.shadowMap.enabled, true);
  assert.equal(mockRenderer.shadowMap.type, THREE.PCFSoftShadowMap);
  assert.equal(sunLight.castShadow, true);
  assert.equal(
    points.filter((p) => p.visible).length,
    Math.min(MAX_POINT_LIGHTS_HIGH, points.length),
  );
  assert.ok(mat.version > vBeforeHigh, 'applyGraphicsQuality(high) phải đánh dấu needsUpdate vật liệu');

  lighting.dispose();
  assert.equal(scene.getObjectByName('__shopLighting'), undefined);
}

function testShopWorldSplitPreserved(): void {
  const world = createShopWorld(() => {});
  assert.equal(world.tables.length, 4);
  assert.ok(world.colliders.length >= 10);
  assert.ok(world.interactables.length >= 2);
  assert.ok(world.getThrowSurfaces().length >= 8);
  for (const key of [
    'door',
    'restockPc',
    'staffBoard',
    'cupRack',
    'teaMachine',
    'fridge',
    'sugar',
    'topping',
    'sealer',
    'counter',
    'trashCan',
  ] as const) {
    assert.ok(world.stations[key], `Thiếu station ${key}`);
  }
}

function testIntegrationDetails(): void {
  // Kiểm tra mất điện làm tối cả đèn điểm lẫn bóng đèn trần emissive, hết sự kiện sáng lại
  const scene = new THREE.Scene();
  const world = createShopWorld(() => {});
  scene.add(world.root);
  const lighting = setupLighting(scene, world.getShopBounds());

  const globes: THREE.Mesh[] = [];
  world.root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.name === 'ceilingLampGlobe') globes.push(obj);
  });
  assert.equal(globes.length, 3);
  const normalEmissive = (globes[0].material as THREE.MeshStandardMaterial).emissiveIntensity;
  assert.ok(normalEmissive > 0);

  lighting.setDimmed(true);
  assert.equal((globes[0].material as THREE.MeshStandardMaterial).emissiveIntensity, 0);
  lighting.setDimmed(false);
  assert.equal((globes[0].material as THREE.MeshStandardMaterial).emissiveIntensity, normalEmissive);

  // Hủy lighting khi đang dimmed vẫn khôi phục vật liệu cache về bình thường
  lighting.setDimmed(true);
  lighting.dispose();
  assert.equal((globes[0].material as THREE.MeshStandardMaterial).emissiveIntensity, normalEmissive);

  // Kiểm tra chổi & cây lau trên giá treo đều castShadow
  const rackScene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 20);
  const interaction = createInteractionSystem(cam, [], () => {});
  const rack = createToolRack(
    { scene: rackScene, colliders: [], interaction } as unknown as GameCtx,
    { getSlotLabel: (k) => k, onSlotInteract: () => {} },
  );
  const broomOnRack = rack.root.children[3];
  const mopOnRack = rack.root.children[4];
  for (const tool of [broomOnRack, mopOnRack]) {
    tool.traverse((obj) => {
      if (obj instanceof THREE.Mesh) assert.equal(obj.castShadow, true);
    });
  }
  rack.dispose();

  // Kiểm tra giới hạn pixelRatio theo chất lượng trên thiết bị DPR cao (giả lập window tạm)
  const prevWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: { devicePixelRatio: number } }).window = { devicePixelRatio: 3 };
  try {
    assert.equal(getPixelRatioForQuality('high'), 2);
    assert.equal(getPixelRatioForQuality('low'), 1);
  } finally {
    if (prevWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = prevWindow;
  }
}

testOutlineAndMaterials();
testTexturesSafeInNode();
testLightingAndRenderSettings();
testShopWorldSplitPreserved();
runSelfCheck8Worldb();
runSelfCheck8Worldc();
testIntegrationDetails();
console.log('Self-check 8 World OK: outline, materials, textures, lighting, renderSettings, shopWorld split');
