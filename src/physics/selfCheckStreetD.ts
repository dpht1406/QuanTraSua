import assert from 'node:assert/strict';
import * as THREE from 'three';
import { setupLighting } from '../core/lighting.ts';
import { applyOutdoorEnvironment } from '../core/sceneSetup.ts';
import { getShopBounds, getWorldBounds, type Bounds3D } from '../core/worldBounds.ts';
import { HEMI_INTENSITY_NORMAL, SUN_INTENSITY_NORMAL } from '../state/constantsGraphics.ts';
import { SIDEWALK_LANE_SHOP_Z, STREET_BOUNDS, STREET_ROAD_Z } from '../state/constantsStreet.ts';
import { createEmptyCup } from '../state/scoring.ts';
import { createShopWorld } from '../world/shopWorld.ts';
import { runSelfCheckStreetWorldD } from '../world/selfCheckStreetWorldD.ts';
import { createStreet } from '../world/streetWorld.ts';
import { buildStaticWorld } from './buildStaticWorld.ts';
import { FIXED_STEP } from './constantsPhysics.ts';
import { createFurnitureBodies } from './furnitureBodies.ts';
import { createPhysicsWorld } from './physicsWorld.ts';
import { createProjectileSim, type ProjectileSimEvent } from './projectileSim.ts';

function isInsideXZ(pos: { x: number; z: number }, bounds: Bounds3D): boolean {
  return pos.x >= bounds.minX && pos.x <= bounds.maxX && pos.z >= bounds.minZ && pos.z <= bounds.maxZ;
}

async function testStreetThrowsBoundsAndOutageLighting(): Promise<void> {
  const physics = await createPhysicsWorld();
  const scene = new THREE.Scene();
  const disposeEnv = applyOutdoorEnvironment(scene);
  const shop = createShopWorld(() => {});
  scene.add(shop.root);
  const street = createStreet(scene, 'high');
  buildStaticWorld(physics, shop.colliders, { streetColliders: street.colliders });
  const lighting = setupLighting(scene, getShopBounds(), { shadowBounds: getWorldBounds() });
  const furniture = createFurnitureBodies(physics, shop);
  const sim = createProjectileSim(physics);

  try {
    // 1. Ném ly rơi xuống sàn ngoài đường: vỡ đúng trên sàn phố (tọa độ ngoài getShopBounds)
    sim.spawn({
      kind: 'cup',
      cup: { ...createEmptyCup(), sealed: true },
      pos: { x: 2.0, y: 0.45, z: SIDEWALK_LANE_SHOP_Z },
      vel: { x: 0, y: -6.0, z: 1.5 },
      power: 6.2,
    });
    let cupHit: Extract<ProjectileSimEvent, { type: 'hit' }> | undefined;
    for (let i = 0; i < 60 && !cupHit; i++) {
      physics.step(FIXED_STEP);
      const events = sim.step(FIXED_STEP);
      cupHit = events.find((e): e is Extract<ProjectileSimEvent, { type: 'hit' }> => e.type === 'hit');
    }
    assert.ok(cupHit, 'Ly ném ngoài đường phải chạm sàn tĩnh đường phố');
    assert.equal(cupHit.target, 'floor');
    assert.equal(cupHit.consequence.broken, true);
    assert.equal(isInsideXZ(cupHit.item.pos, getShopBounds()), false, 'Vị trí vỡ nằm ngoài phạm vi quán');
    assert.equal(isInsideXZ(cupHit.item.pos, getWorldBounds()), true);

    // 2. Ghế đẩy ra lòng đường vẫn giữ vị trí; mất điện chỉ tối đèn trong quán, ngoài trời giữ sáng ban ngày
    const chair = furniture.getChairBodies()[0];
    const roadZ = (STREET_ROAD_Z.minZ + STREET_ROAD_Z.maxZ) * 0.5;
    chair.setTranslation({ x: 1.5, y: chair.translation().y, z: roadZ }, true);
    chair.setLinvel({ x: 0, y: 0, z: 0 }, true);
    furniture.update(0.25);
    assert.ok(chair.translation().z > STREET_ROAD_Z.minZ);

    lighting.update?.(0.016);
    lighting.setDimmed(true);

    const lightGroup = scene.getObjectByName('__shopLighting')!;
    const sky = lightGroup.getObjectByName('outdoorSkyLight') as THREE.HemisphereLight;
    const sun = lightGroup.getObjectByName('outdoorSunLight') as THREE.DirectionalLight;
    const windowFill = lightGroup.getObjectByName('indoorWindowFillLight') as THREE.PointLight;
    assert.equal(sky.intensity, HEMI_INTENSITY_NORMAL);
    assert.equal(sun.intensity, SUN_INTENSITY_NORMAL);
    assert.equal(windowFill.intensity, 0);

    lighting.setDimmed(false);
    furniture.resetChairs();
    assert.equal(isInsideXZ(chair.translation(), getShopBounds()), true);

    // 3. Chổi văng vượt biên toàn thế giới (quán + phố) mới phát sự kiện lost/bounds
    const { item: lostTool } = sim.spawn({
      kind: 'broom',
      pos: { x: 0, y: 1.2, z: STREET_BOUNDS.maxZ + 2.0 },
      vel: { x: 0, y: 0, z: 2.0 },
      power: 4.0,
    });
    physics.step(FIXED_STEP);
    const evsLost = sim.step(FIXED_STEP);
    assert.ok(evsLost.some((e) => e.type === 'lost' && e.id === lostTool.id && e.reason === 'bounds'));
  } finally {
    sim.dispose();
    furniture.dispose();
    lighting.dispose();
    street.dispose();
    disposeEnv();
    physics.dispose();
  }
}

// Tự kiểm tra cho Tab 4: ánh sáng/bầu trời/sương/bóng/chất lượng 3D + tích hợp ranh giới thế giới & mất điện Rapier
export async function runSelfCheckStreetD(): Promise<void> {
  runSelfCheckStreetWorldD();
  await testStreetThrowsBoundsAndOutageLighting();
  console.log('selfCheckStreetD passed (outdoor lighting/shadow/quality + street world physics integration)');
}
