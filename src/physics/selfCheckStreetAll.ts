import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getWorldBounds } from '../core/worldBounds.ts';
import type { GameCtx } from '../gameplay/gameCtx.ts';
import { applyThrowHitEvent } from '../gameplay/throwHitApply.ts';
import { createCleanlinessStore } from '../state/cleanliness.ts';
import { MAX_THROW_POWER, THROW_UP_BOOST } from '../state/constantsThrow.ts';
import { SHOP_FRONT_WALL_Z, SIDEWALK_LANE_SHOP_Z, STREET_BOUNDS, STREET_ROAD_Z } from '../state/constantsStreet.ts';
import { createEmptyCup } from '../state/scoring.ts';
import { createStaffHitTracker } from '../state/staffStun.ts';
import { createGameStore } from '../state/gameState.ts';
import { createShopWorld } from '../world/shopWorld.ts';
import { createStreet } from '../world/streetWorld.ts';
import { buildStaticWorld } from './buildStaticWorld.ts';
import { FIXED_STEP } from './constantsPhysics.ts';
import { createFurnitureBodies } from './furnitureBodies.ts';
import { createPhysicsDebug } from './physicsDebug.ts';
import { createPhysicsWorld } from './physicsWorld.ts';
import { createPlayerBody } from './playerBody.ts';
import { createProjectileSim, type ProjectileSimEvent } from './projectileSim.ts';
import { runSelfCheckStreetB } from './selfCheckStreetB.ts';
import { runSelfCheckStreetD } from './selfCheckStreetD.ts';
import { runSelfCheckStreetC } from '../world/selfCheckStreetC.ts';

async function testStreetPhysicsFoundation(): Promise<void> {
  const physics = await createPhysicsWorld();
  const scene = new THREE.Scene();
  const shopWorld = createShopWorld(() => {});
  const street = createStreet(scene, 'high');
  buildStaticWorld(physics, shopWorld.colliders, { streetColliders: street.colliders });
  const furniture = createFurnitureBodies(physics, shopWorld);
  const sim = createProjectileSim(physics);

  try {
    // 1. Sàn vật lý phủ cả vỉa hè & lòng đường ngoài quán
    const roadZ = (STREET_ROAD_Z.minZ + STREET_ROAD_Z.maxZ) * 0.5;
    const sidewalkFloor = physics.raycast({ x: 0, y: 1.5, z: SIDEWALK_LANE_SHOP_Z }, { x: 0, y: -1, z: 0 }, 3);
    const roadFloor = physics.raycast({ x: 0, y: 1.5, z: roadZ }, { x: 0, y: -1, z: 0 }, 3);
    assert.ok(sidewalkFloor && sidewalkFloor.tag.kind === 'floor', 'Vỉa hè phải có sàn vật lý');
    assert.ok(roadFloor && roadFloor.tag.kind === 'floor', 'Lòng đường phải có sàn vật lý');

    // 2. Hàng rào/tường rìa đường phố chặn vật/người chơi ở rìa khu vực
    const farBorder = physics.raycast({ x: 0, y: 1.0, z: STREET_BOUNDS.maxZ - 0.5 }, { x: 0, y: 0, z: 1 }, 2);
    assert.ok(farBorder && farBorder.tag.kind === 'wall', 'Rìa ngoài đường phải có tường tĩnh chặn');

    // 3. Ghế ra ngoài khu đường phố vẫn giữ nguyên trong getWorldBounds(), ra khỏi getWorldBounds() mới reset
    const chair = furniture.getChairBodies()[0];
    const initPos = { ...chair.translation() };
    chair.setTranslation({ x: 0, y: initPos.y, z: SIDEWALK_LANE_SHOP_Z + 1.0 }, true);
    chair.setLinvel({ x: 0, y: 0, z: 0 }, true);
    furniture.update(0.3);
    assert.ok(chair.translation().z > 5.0, 'Ghế nằm ngoài đường trong ranh giới thế giới không được tự reset');

    const wb = getWorldBounds();
    chair.setTranslation({ x: wb.maxX + 1.0, y: initPos.y, z: 0 }, true);
    furniture.update(0.3);
    assert.ok(Math.abs(chair.translation().x - initPos.x) < 1e-4, 'Ghế vượt quá getWorldBounds phải tự reset');

    // 4. Projectile dùng mặc định getWorldBounds(): bay ngoài đường không bị mất, vượt biên mới mất
    const { item: streetTool } = sim.spawn({
      kind: 'broom',
      pos: { x: 0, y: 1.0, z: roadZ },
      vel: { x: 0, y: 0, z: 0 },
      power: 3,
    });
    physics.step(1 / 60);
    const evsIn = sim.step(1 / 60);
    assert.equal(evsIn.some((e) => e.type === 'lost' && e.id === streetTool.id), false);
    assert.equal(sim.getFlying().length, 1);

    const { item: outTool } = sim.spawn({
      kind: 'mop',
      pos: { x: 0, y: 1.0, z: wb.maxZ + 1.0 },
      vel: { x: 0, y: 0, z: 1 },
      power: 3,
    });
    physics.step(1 / 60);
    const evsOut = sim.step(1 / 60);
    assert.ok(evsOut.some((e) => e.type === 'lost' && e.id === outTool.id && e.reason === 'bounds'));
  } finally {
    sim.dispose();
    furniture.dispose();
    street.dispose();
    physics.dispose();
  }
}

async function testTab5IntegrationChecks(): Promise<void> {
  const physics = await createPhysicsWorld();
  const shopOnlyPhysics = await createPhysicsWorld();
  const scene = new THREE.Scene();
  const shopWorld = createShopWorld(() => {});
  const street = createStreet(scene, 'high');
  const created = buildStaticWorld(physics, shopWorld.colliders, { streetColliders: street.colliders });
  buildStaticWorld(shopOnlyPhysics, shopWorld.colliders);
  const player = createPlayerBody(physics, { x: 0, y: 0, z: 1.8 });
  const furniture = createFurnitureBodies(physics, shopWorld);
  const debug = createPhysicsDebug(scene, physics);
  const sim = createProjectileSim(physics);

  try {
    // 1. Số collider tĩnh & thân động hợp lệ; F4 vẽ được thêm collider đường phố (z > tường trước)
    const expectedNonFloor = street.colliders.filter((c) => c.tag !== 'floor').length;
    assert.equal(created.length, 2 + shopWorld.colliders.length + expectedNonFloor);
    assert.equal(created.length, 42);
    assert.equal(furniture.getChairBodies().length, 8);
    assert.equal(physics.world.bodies.len(), 9);
    assert.equal(physics.world.colliders.len(), created.length + 1 + furniture.getChairBodies().length * 2);

    assert.equal(debug.isEnabled(), false);
    assert.equal(debug.toggle(), true);
    const lines = scene.getObjectByName('__physicsDebugLines') as THREE.LineSegments;
    const posAttr = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    assert.ok(lines.visible && posAttr.count > shopOnlyPhysics.world.debugRender().vertices.length / 3);
    let sawStreetDebugVertex = false;
    for (let i = 0; i < posAttr.count; i++) {
      if (posAttr.getZ(i) > SHOP_FRONT_WALL_Z + 1.0) {
        sawStreetDebugVertex = true;
        break;
      }
    }
    assert.equal(sawStreetDebugVertex, true, 'F4 debug render phải bao gồm collider đường phố');

    // 2. Ném ly vỡ ngoài đường không tạo vết bẩn trong quán; ném vỡ trong quán phải tạo vết bẩn
    const store = createGameStore();
    const bus = store.bus;
    const cleanliness = createCleanlinessStore(bus);
    const hints: string[] = [];
    const removedVisualIds: number[] = [];
    let syncedCount = 0;
    const fakeCtx = {
      eventBus: bus,
      gameStore: store,
      cleanliness,
      cleanlinessView: { sync: () => { syncedCount++; } },
      customer: { isLeaving: false },
      hud: { showHint: (msg: string) => { hints.push(msg); } },
      orderManager: { forceCustomerLeave: () => false },
      staffManager: { getActors: () => [], stunStaff: () => {} },
      staffStore: {},
    } as unknown as GameCtx;
    const tracker = createStaffHitTracker(1);

    const stepUntilHit = (spawnPos: { x: number; y: number; z: number }): Extract<ProjectileSimEvent, { type: 'hit' }> => {
      sim.spawn({
        kind: 'cup',
        cup: { ...createEmptyCup(), sealed: true },
        pos: spawnPos,
        vel: { x: 0, y: -5.5, z: 0.4 },
        power: 6.5,
      });
      for (let i = 0; i < 60; i++) {
        physics.step(FIXED_STEP);
        const hit = sim.step(FIXED_STEP).find((e): e is Extract<ProjectileSimEvent, { type: 'hit' }> => e.type === 'hit');
        if (hit) return hit;
      }
      throw new Error('Không bắt được sự kiện vỡ ly khi tự kiểm tra');
    };

    const outHit = stepUntilHit({ x: 2.0, y: 0.45, z: SIDEWALK_LANE_SHOP_Z });
    applyThrowHitEvent(fakeCtx, outHit, tracker, (id) => removedVisualIds.push(id));
    assert.equal(cleanliness.getStains().length, 0, 'Ly vỡ ngoài đường không được sinh vết bẩn trong quán');
    assert.equal(syncedCount, 0);
    assert.ok(removedVisualIds.includes(outHit.item.id));
    assert.equal(hints[0], 'Ly bị vỡ ngoài đường!');

    const inHit = stepUntilHit({ x: 0.5, y: 0.45, z: 2.0 });
    applyThrowHitEvent(fakeCtx, inHit, tracker, (id) => removedVisualIds.push(id));
    assert.equal(cleanliness.getStains().length, 1, 'Ly vỡ trong quán vẫn phải sinh vết bẩn');
    assert.equal(cleanliness.getStains()[0].kind, 'spill');
    assert.equal(syncedCount, 1);
    assert.equal(hints[1], 'Ly bị vỡ đổ ra sàn!');

    // 3. Ném chổi góc cao ngoài đường & ném ly cao (> 8m) không bị mất oan vì trần WORLD_MAX_Y
    const roadZ = (STREET_ROAD_Z.minZ + STREET_ROAD_Z.maxZ) * 0.5;
    const { item: highBroom } = sim.spawn({
      kind: 'broom',
      pos: { x: 0, y: 1.65, z: roadZ },
      vel: { x: 0.5, y: MAX_THROW_POWER + THROW_UP_BOOST, z: 0 },
      power: MAX_THROW_POWER,
    });
    let maxBroomY = 0;
    let landedHigh = false;
    for (let i = 0; i < 360; i++) {
      physics.step(FIXED_STEP);
      if (highBroom.body?.isValid()) maxBroomY = Math.max(maxBroomY, highBroom.body.translation().y);
      const evs = sim.step(FIXED_STEP);
      assert.equal(evs.some((e) => e.type === 'lost' && e.id === highBroom.id), false, 'Chổi bay cao ngoài phố không được mất oan');
      if (evs.some((e) => e.type === 'landed' && e.item.id === highBroom.id)) {
        landedHigh = true;
        break;
      }
    }
    assert.ok(maxBroomY > 6.0 && landedHigh, `Chổi phải đạt đỉnh cao (${maxBroomY.toFixed(2)}) và đáp xuống sàn phố`);

    const { item: highCup } = sim.spawn({
      kind: 'cup',
      cup: { ...createEmptyCup(), sealed: true },
      pos: { x: 1.0, y: 2.2, z: roadZ },
      vel: { x: 0, y: MAX_THROW_POWER + THROW_UP_BOOST, z: 0 },
      power: MAX_THROW_POWER,
    });
    let maxCupY = 0;
    let cupBrokeOnRoad = false;
    for (let i = 0; i < 360; i++) {
      physics.step(FIXED_STEP);
      if (highCup.body?.isValid()) maxCupY = Math.max(maxCupY, highCup.body.translation().y);
      const evs = sim.step(FIXED_STEP);
      assert.equal(evs.some((e) => e.type === 'lost' && e.id === highCup.id), false, 'Ly bay trên 8m ngoài trời không được bị cắt bounds');
      if (evs.some((e) => e.type === 'hit' && e.item.id === highCup.id && e.target === 'floor')) {
        cupBrokeOnRoad = true;
        break;
      }
    }
    assert.ok(maxCupY > 8.0 && cupBrokeOnRoad, `Ly ném vút > 8m (${maxCupY.toFixed(2)}) phải rơi xuống vỡ ở mặt đường`);
  } finally {
    sim.dispose();
    debug.dispose();
    furniture.dispose();
    player.dispose();
    street.dispose();
    shopOnlyPhysics.dispose();
    physics.dispose();
  }
}

async function runAllStreetChecks(): Promise<void> {
  await testStreetPhysicsFoundation();
  await runSelfCheckStreetB();
  await runSelfCheckStreetC();
  await runSelfCheckStreetD();
  await testTab5IntegrationChecks();
  console.log('Self-check Street All OK (Tab 1-5 verified)');
}

await runAllStreetChecks();
