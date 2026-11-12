import assert from 'node:assert/strict';
import * as THREE from 'three';
import { setupLighting } from '../core/lighting.ts';
import { applyGraphicsQuality } from '../core/renderSettings.ts';
import { applyOutdoorEnvironment, createSkyBackground } from '../core/sceneSetup.ts';
import { getShopBounds, getWorldBounds } from '../core/worldBounds.ts';
import {
  CEILING_LAMP_INTENSITY,
  HEMI_INTENSITY_NORMAL,
  MAX_POINT_LIGHTS_LOW,
  SHADOW_MAP_SIZE_HIGH,
  SHOP_DOOR_DAYLIGHT_FEATHER,
  SHOP_OUTAGE_DIM_FACTOR,
  SHOP_WALL_DIM_INSET,
  SKY_BACKGROUND_COLOR,
  SKY_FOG_COLOR,
  SKY_HORIZON_COLOR,
  SKY_MID_COLOR,
  SKY_TOP_COLOR,
  STREET_FOG_FAR,
  STREET_FOG_NEAR,
  STREET_SHADOW_MIN_MAX_Y,
  STREET_SHADOW_PADDING,
  STREET_SUN_DISTANCE_SCALE,
  SUN_INTENSITY_NORMAL,
  WINDOW_FILL_DISTANCE,
  WINDOW_FILL_INTENSITY,
} from '../state/constantsGraphics.ts';
import { SIDEWALK_LANE_SHOP_Z, STREET_BOUNDS } from '../state/constantsStreet.ts';
import { createShopWorld } from './shopWorld.ts';
import { createStreet } from './streetWorld.ts';

function testStreetGraphicsConstants(): void {
  assert.ok(Number.isInteger(SKY_BACKGROUND_COLOR) && Number.isInteger(SKY_FOG_COLOR));
  assert.ok(SKY_TOP_COLOR.startsWith('#') && SKY_MID_COLOR.startsWith('#') && SKY_HORIZON_COLOR.startsWith('#'));
  assert.ok(STREET_FOG_NEAR > 0 && STREET_FOG_FAR > STREET_FOG_NEAR);
  assert.ok(STREET_SHADOW_PADDING > 0 && STREET_SHADOW_MIN_MAX_Y >= 8 && STREET_SUN_DISTANCE_SCALE > 1);
  assert.ok(WINDOW_FILL_INTENSITY > 0 && WINDOW_FILL_DISTANCE > 0);
  assert.ok(SHOP_OUTAGE_DIM_FACTOR > 0 && SHOP_OUTAGE_DIM_FACTOR < 1);
  assert.ok(SHOP_WALL_DIM_INSET > 0 && SHOP_DOOR_DAYLIGHT_FEATHER > 0);
}

function testOutdoorSkyAndFog(): void {
  const scene = new THREE.Scene();
  const cleanup = applyOutdoorEnvironment(scene);
  assert.ok(scene.background instanceof THREE.Color);
  assert.equal(scene.background.getHex(), SKY_BACKGROUND_COLOR);
  assert.ok(scene.fog instanceof THREE.Fog);
  assert.equal(scene.fog.color.getHex(), SKY_FOG_COLOR);
  assert.equal(scene.fog.near, STREET_FOG_NEAR);
  assert.equal(scene.fog.far, STREET_FOG_FAR);
  cleanup();

  // Giả lập document canvas để kiểm tra đường dẫn CanvasTexture gradient trên trình duyệt
  const prevDoc = (globalThis as { document?: unknown }).document;
  const stops: number[] = [];
  (globalThis as { document?: unknown }).document = {
    createElement(tag: string) {
      assert.equal(tag, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext(kind: string) {
          assert.equal(kind, '2d');
          return {
            createLinearGradient: () => ({ addColorStop: (offset: number) => stops.push(offset) }),
            fillStyle: '',
            fillRect() {},
          };
        },
      };
    },
  };
  try {
    const tex = createSkyBackground();
    assert.ok(tex instanceof THREE.CanvasTexture);
    assert.equal(tex.colorSpace, THREE.SRGBColorSpace);
    assert.deepEqual(stops, [0, 0.58, 1]);
    tex.dispose();
  } finally {
    if (prevDoc === undefined) delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document?: unknown }).document = prevDoc;
  }
}

function testShadowCoverageLightsAndOutage(): void {
  const scene = new THREE.Scene();
  const shop = createShopWorld(() => {});
  scene.add(shop.root);
  const street = createStreet(scene, 'high');
  const lighting = setupLighting(scene, getShopBounds(), { shadowBounds: getWorldBounds() });

  try {
    const group = scene.getObjectByName('__shopLighting')!;
    assert.ok(group);

    const sky = group.getObjectByName('outdoorSkyLight') as THREE.HemisphereLight;
    const sun = group.getObjectByName('outdoorSunLight') as THREE.DirectionalLight;
    const windowFill = group.getObjectByName('indoorWindowFillLight') as THREE.PointLight;
    const ceilings: THREE.PointLight[] = [];
    group.traverse((obj) => {
      if (obj instanceof THREE.PointLight && obj.name === 'indoorCeilingLight') ceilings.push(obj);
    });

    assert.equal(sky.userData.lightRole, 'outdoor');
    assert.equal(sun.userData.lightRole, 'outdoor');
    assert.equal(windowFill.userData.lightRole, 'indoor');
    assert.equal(ceilings.length, 3);
    assert.ok(ceilings.every((l) => l.userData.lightRole === 'indoor'));
    assert.equal(sun.shadow.mapSize.x, SHADOW_MAP_SIZE_HIGH);
    assert.equal(sun.shadow.mapSize.y, SHADOW_MAP_SIZE_HIGH);
    assert.ok(windowFill.position.z > 0 && windowFill.intensity === WINDOW_FILL_INTENSITY);

    // Mọi góc quán + đường phố + nóc nhà đối diện đều phải lọt trong shadow camera của mặt trời
    sun.shadow.camera.updateMatrixWorld();
    const projView = new THREE.Matrix4().multiplyMatrices(
      sun.shadow.camera.projectionMatrix,
      sun.shadow.camera.matrixWorldInverse,
    );
    const checkPoints: Array<[number, number, number]> = [
      [-5, 0, -4], [5, 3.4, 4],
      [STREET_BOUNDS.minX, 0, STREET_BOUNDS.minZ], [STREET_BOUNDS.maxX, 0, STREET_BOUNDS.maxZ],
      [-10, 8.9, STREET_BOUNDS.maxZ], [10, 8.9, STREET_BOUNDS.maxZ],
    ];
    for (const [x, y, z] of checkPoints) {
      const ndc = new THREE.Vector3(x, y, z).applyMatrix4(projView);
      assert.ok(ndc.x >= -1.001 && ndc.x <= 1.001, `Nằm ngoài X shadow tại (${x},${y},${z}): ${ndc.x}`);
      assert.ok(ndc.y >= -1.001 && ndc.y <= 1.001, `Nằm ngoài Y shadow tại (${x},${y},${z}): ${ndc.y}`);
      assert.ok(ndc.z >= -1.001 && ndc.z <= 1.001, `Nằm ngoài Z shadow tại (${x},${y},${z}): ${ndc.z}`);
    }
    assert.ok(sun.shadow.camera.right - sun.shadow.camera.left <= 35, 'Khung bóng phải đủ gọn để giữ độ nét');

    // Quét vật liệu và bật mất điện: đèn ngoài trời giữ nguyên, đèn nội thất tắt, chỉ vùng trong quán tối đi
    lighting.update?.(0.016);

    const floorMesh = shop.root.getObjectByName('shopFloor') as THREE.Mesh;
    const roadMesh = scene.getObjectByName('streetRoad') as THREE.Mesh;
    const globe = shop.root.getObjectByName('ceilingLampGlobe') as THREE.Mesh;
    const streetBulb = scene.getObjectByName('streetLampBulb') as THREE.Mesh;
    const bulbMat = streetBulb.material as THREE.MeshStandardMaterial;
    const bulbEmissiveBefore = bulbMat.emissiveIntensity;

    const floorMat = floorMesh.material as THREE.MeshStandardMaterial;
    assert.equal(floorMat.userData.__indoorDimPatched, true);
    assert.equal((roadMesh.material as THREE.MeshStandardMaterial).userData.__indoorDimPatched, true);

    lighting.setDimmed(true);
    assert.equal(sky.intensity, HEMI_INTENSITY_NORMAL, 'Mất điện không được làm tối HemisphereLight ngoài trời');
    assert.equal(sun.intensity, SUN_INTENSITY_NORMAL, 'Mất điện không được làm tối DirectionalLight mặt trời');
    assert.equal(sun.castShadow, true);
    assert.equal(windowFill.intensity, 0);
    assert.ok(ceilings.every((l) => l.intensity === 0));
    assert.equal((globe.material as THREE.MeshStandardMaterial).emissiveIntensity, 0);
    assert.equal(bulbMat.emissiveIntensity, bulbEmissiveBefore, 'Bóng đèn đường ngoài phố phải giữ nguyên');

    const fakeShader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    floorMat.onBeforeCompile(fakeShader, {} as THREE.WebGLRenderer);

    const uDim = fakeShader.uniforms.uShopOutageDim as { value: number };
    const uMin = fakeShader.uniforms.uShopDimMin as { value: THREE.Vector3 };
    const uMax = fakeShader.uniforms.uShopDimMax as { value: THREE.Vector3 };
    assert.equal(uDim.value, SHOP_OUTAGE_DIM_FACTOR);
    assert.ok(uMin.value.z < -4 && uMax.value.z < SIDEWALK_LANE_SHOP_Z, 'Vùng tối mất điện chỉ nằm trong quán');
    assert.equal((fakeShader.vertexShader.match(/varying vec3 vIndoorWorldPos;/g) ?? []).length, 1);
    assert.equal((fakeShader.fragmentShader.match(/varying vec3 vIndoorWorldPos;/g) ?? []).length, 1);
    assert.ok(fakeShader.vertexShader.includes('vIndoorWorldPos = ( modelMatrix * indoorWp ).xyz;'));
    assert.ok(fakeShader.fragmentShader.includes('reflectedLight.directDiffuse *= dimFactor;'));

    // Đổi chất lượng Thấp <-> Cao có hiệu lực ngay và giữ nguyên trạng thái mất điện
    const mockRenderer = {
      shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap, needsUpdate: false },
      setPixelRatio() {},
    } as unknown as THREE.WebGLRenderer;
    applyGraphicsQuality(mockRenderer, lighting, 'low');
    assert.equal(mockRenderer.shadowMap.enabled, false);
    assert.equal(sun.castShadow, false);
    assert.equal(windowFill.visible, false);
    assert.equal(ceilings.filter((l) => l.visible).length, MAX_POINT_LIGHTS_LOW);
    assert.equal(uDim.value, SHOP_OUTAGE_DIM_FACTOR);

    applyGraphicsQuality(mockRenderer, lighting, 'high');
    assert.equal(mockRenderer.shadowMap.enabled, true);
    assert.equal(sun.castShadow, true);
    assert.equal(windowFill.visible, true);
    assert.equal(ceilings.filter((l) => l.visible).length, 3);

    lighting.setDimmed(false);
    assert.equal(uDim.value, 0);
    assert.ok(ceilings.every((l) => l.intensity === CEILING_LAMP_INTENSITY));
    assert.equal(windowFill.intensity, WINDOW_FILL_INTENSITY);
    assert.ok((globe.material as THREE.MeshStandardMaterial).emissiveIntensity > 0);
  } finally {
    lighting.dispose();
    street.dispose();
  }
}

// Tự kiểm tra 3D cho Tab 4: hằng số đồ họa đường phố, bầu trời/sương, vùng bóng đổ, ánh sáng cửa sổ và mất điện
export function runSelfCheckStreetWorldD(): void {
  testStreetGraphicsConstants();
  testOutdoorSkyAndFog();
  testShadowCoverageLightsAndOutage();
  console.log('selfCheckStreetWorldD passed (sky/fog, wide shadow frustum, indoor outage vs daylight street)');
}
