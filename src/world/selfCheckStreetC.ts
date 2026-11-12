import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOrderManager } from '../gameplay/orderManager.ts';
import { createActorBodies } from '../physics/actorBodies.ts';
import { createPhysicsWorld } from '../physics/physicsWorld.ts';
import {
  CUSTOMER_DOOR_OUTSIDE_POINT,
  CUSTOMER_EXIT_POINT,
  CUSTOMER_SHOP_ENTRY_POINTS,
  CUSTOMER_SHOP_EXIT_POINTS,
  CUSTOMER_SPAWN_POINT,
  PEDESTRIAN_MAX_BY_QUALITY,
  PEDESTRIAN_SPEED_RANGE,
  SHOP_FRONT_WALL_Z,
  SIDEWALK_LANE_OPP_Z,
  SIDEWALK_LANE_SHOP_Z,
} from '../state/constantsStreet.ts';
import { createEventBus } from '../state/eventBus.ts';
import { gameStore, type GameEvents } from '../state/gameState.ts';
import {
  computePedestrianSpeed,
  createPedestrianMotion,
  resolveCustomerEntryWaypoints,
  resolveCustomerExitWaypoints,
  stepPedestrianMotion,
} from '../state/pedestrianMotion.ts';
import { createEmptyCup } from '../state/scoring.ts';
import { getCustomerEntryRoute, getCustomerExitRoute, isInsideWorld } from '../state/streetPlan.ts';
import { createCustomerActor } from './customer.ts';
import { createPedestrians } from './pedestrians.ts';

function testPurePedestrianAndCustomerRoutes(): void {
  const speeds = Array.from({ length: PEDESTRIAN_MAX_BY_QUALITY.high }, (_, i) =>
    computePedestrianSpeed(i, 0),
  );
  for (const s of speeds) {
    assert.ok(s >= PEDESTRIAN_SPEED_RANGE.min && s <= PEDESTRIAN_SPEED_RANGE.max);
  }
  assert.ok(new Set(speeds).size >= 5, 'Tốc độ người đi đường phải có sự khác nhau');

  const motions = Array.from({ length: PEDESTRIAN_MAX_BY_QUALITY.high }, (_, i) =>
    createPedestrianMotion(i, 1, i * 2.4),
  );
  let sawOpp = false;
  let sawCrosswalk = false;

  for (let step = 0; step < 400; step++) {
    for (const m of motions) {
      assert.equal(isInsideWorld(m.x, m.z), true, `Ngoài world tại (${m.x}, ${m.z})`);
      assert.ok(m.z > SHOP_FRONT_WALL_Z, `Người đi đường không được đi vào quán z=${m.z}`);
      if (Math.abs(m.z - SIDEWALK_LANE_OPP_Z) < 0.1) sawOpp = true;
      if (m.z > SIDEWALK_LANE_SHOP_Z + 0.5 && m.z < SIDEWALK_LANE_OPP_Z - 0.5) sawCrosswalk = true;
      stepPedestrianMotion(m, 0.1, 1);
    }
  }
  assert.ok(sawOpp, 'Phải có tuyến đi trên vỉa hè đối diện');
  assert.ok(sawCrosswalk, 'Phải có người đi qua vạch băng qua đường');
  assert.ok(motions.every((m) => m.round >= 1), 'Pool phải lặp vòng sang tuyến mới khi đi hết tuyến');

  assert.deepEqual(resolveCustomerEntryWaypoints(CUSTOMER_SHOP_ENTRY_POINTS), getCustomerEntryRoute());
  assert.deepEqual(resolveCustomerExitWaypoints(CUSTOMER_SHOP_EXIT_POINTS, { x: 0, z: 0 }), getCustomerExitRoute());
  assert.deepEqual(resolveCustomerEntryWaypoints([{ x: 0, z: 0 }]), [{ x: 0, z: 0 }]);

  const outsideHitExit = resolveCustomerExitWaypoints([CUSTOMER_SHOP_EXIT_POINTS[1]], {
    x: -4.0,
    z: SIDEWALK_LANE_SHOP_Z,
  });
  assert.deepEqual(outsideHitExit, [CUSTOMER_DOOR_OUTSIDE_POINT, CUSTOMER_EXIT_POINT]);
  assert.ok(outsideHitExit.every((p) => p.z > SHOP_FRONT_WALL_Z));
}

function testPedestriansThreeAndQuality(): void {
  const scene = new THREE.Scene();
  const peds = createPedestrians(scene, 'high');
  const highList = peds.getPedestrians();
  assert.equal(highList.length, 6);

  const ids = new Set<string>();
  const variants = new Set<string>();
  for (const p of highList) {
    ids.add(p.id);
    variants.add(p.variantId);
    assert.ok(p.root instanceof THREE.Group);
    assert.equal(p.root.visible, true);
    assert.equal(isInsideWorld(p.position.x, p.position.z), true);
    assert.ok(Math.hypot(p.velocity.x, p.velocity.z) > 0.5);
    assert.ok(Math.abs(p.root.position.x - p.position.x) < 1e-6);
    assert.ok(Math.abs(p.root.position.z - p.position.z) < 1e-6);
  }
  assert.equal(ids.size, 6);
  assert.equal(variants.size, 6);

  const beforeX = highList[0].position.x;
  const beforeZ = highList[0].position.z;
  peds.update(0.2);
  const after = peds.getPedestrians()[0];
  assert.ok(Math.hypot(after.position.x - beforeX, after.position.z - beforeZ) > 0.1);
  assert.ok(Math.abs(after.root.rotation.y - Math.atan2(after.velocity.x, after.velocity.z)) < 1e-5);

  peds.setQuality('low');
  const lowList = peds.getPedestrians();
  assert.equal(lowList.length, 3);
  for (const p of lowList) {
    p.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) assert.equal(obj.castShadow, false, 'Mức Thấp phải tắt bóng đổ');
    });
  }
  const container = scene.getObjectByName('streetPedestrians')!;
  assert.equal(container.children.filter((c) => c.visible).length, 3);

  peds.setQuality('high');
  assert.equal(peds.getPedestrians().length, 6);
  let sawShadowCaster = false;
  peds.getPedestrians()[0].root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.castShadow) sawShadowCaster = true;
  });
  assert.equal(sawShadowCaster, true, 'Mức Cao phải bật lại bóng đổ');

  peds.dispose();
  assert.equal(peds.getPedestrians().length, 0);
  assert.equal(scene.getObjectByName('streetPedestrians'), undefined);

  const lowInitScene = new THREE.Scene();
  const lowInitPeds = createPedestrians(lowInitScene, 'low');
  assert.equal(lowInitPeds.getPedestrians().length, 3);
  for (const p of lowInitPeds.getPedestrians()) {
    p.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) assert.equal(obj.castShadow, false);
    });
  }
  lowInitPeds.dispose();
}

async function testCustomerStreetLifecycleAndPhysics(): Promise<void> {
  const prevMoney = gameStore.getState().money;
  const physics = await createPhysicsWorld();
  const actorBodies = createActorBodies(physics);
  const customer = createCustomerActor();
  const bus = createEventBus<GameEvents>();
  const orderMgr = createOrderManager(customer, bus, () => 480, () => {}, () => {});

  try {
    const baseBodies = physics.world.bodies.len();
    const pedScene = new THREE.Scene();
    const peds = createPedestrians(pedScene, 'high');
    assert.equal(physics.world.bodies.len(), baseBodies, 'Người đi đường GĐ9a chưa tạo thân vật lý');
    peds.dispose();

    // 1. Khách xuất hiện ở điểm đầu vỉa hè ngoài đường và giữ nguyên mốc chào G tại quầy
    orderMgr.setSpawning(true);
    orderMgr.update(1.2);
    assert.equal(customer.root.visible, true);
    assert.ok(Math.hypot(customer.root.position.x - CUSTOMER_SPAWN_POINT.x, customer.root.position.z - CUSTOMER_SPAWN_POINT.z) < 0.5);
    assert.equal(orderMgr.tryGreet(), false, 'Không chào được khi khách còn đi ngoài đường');

    actorBodies.sync(customer, []);
    physics.step(1 / 60);
    assert.ok(actorBodies.getCustomerBody() !== null, 'Khách đi ngoài đường phải có thân kinematic');

    for (let i = 0; i < 200 && !orderMgr.hasCustomerAtCounter(); i++) {
      orderMgr.update(0.05);
      actorBodies.sync(customer, []);
      physics.step(1 / 60);
    }
    assert.equal(orderMgr.hasCustomerAtCounter(), true);
    assert.ok(Math.abs(customer.root.position.z - -0.45) < 0.05);
    assert.ok(Math.abs(customer.root.rotation.y - Math.PI) < 1e-5);
    assert.equal(orderMgr.tryGreet(), true, 'Mốc chào G vẫn hoạt động ngay khi khách tới quầy');

    // 2. Đuổi khách (ngã + đi ra đường) rồi biến mất & xóa thân kinematic
    orderMgr.forceCustomerLeave('bi_nem', { x: 0, z: 1 });
    assert.equal(customer.isLeaving, true);
    let sawOutsideStreetExit = false;
    for (let i = 0; i < 240 && customer.root.visible; i++) {
      orderMgr.update(0.05);
      actorBodies.sync(customer, []);
      physics.step(1 / 60);
      if (customer.root.position.x > 5.0 && customer.root.position.z > SHOP_FRONT_WALL_Z) {
        sawOutsideStreetExit = true;
      }
    }
    assert.equal(sawOutsideStreetExit, true, 'Khách rời quán phải đi dọc vỉa hè ngoài đường');
    assert.equal(customer.root.visible, false);
    actorBodies.sync(customer, []);
    assert.equal(actorBodies.getCustomerBody(), null, 'Khách biến mất phải xóa thân kinematic');
    assert.equal(physics.world.bodies.len(), baseBodies);

    // 3. Kết ca / reset khi khách đang đi ngoài đường -> dọn sạch khách và thân vật lý
    for (let i = 0; i < 200 && !customer.root.visible; i++) orderMgr.update(0.1);
    assert.equal(customer.root.visible, true);
    assert.ok(customer.root.position.z > SHOP_FRONT_WALL_Z);
    actorBodies.sync(customer, []);
    assert.ok(actorBodies.getCustomerBody() !== null);

    orderMgr.resetForShift();
    actorBodies.sync(customer, []);
    assert.equal(customer.root.visible, false);
    assert.equal(customer.hitbox, null);
    assert.equal(actorBodies.getCustomerBody(), null);
    assert.equal(physics.world.bodies.len(), baseBodies);

    // 4. Ném trúng khách khi đang đi bộ ngoài vỉa hè -> đi tiếp ra vỉa hè phải chứ không đi xuyên tường
    orderMgr.setSpawning(true);
    for (let i = 0; i < 200 && !customer.root.visible; i++) orderMgr.update(0.1);
    assert.equal(customer.root.visible, true);
    for (let i = 0; i < 40; i++) orderMgr.update(0.05);
    assert.ok(customer.root.position.z > SHOP_FRONT_WALL_Z && customer.root.position.x < 0);
    orderMgr.forceCustomerLeave('bi_nem', { x: 0, z: 1 });
    for (let i = 0; i < 240 && customer.root.visible; i++) {
      orderMgr.update(0.05);
      if (customer.root.visible) {
        assert.ok(customer.root.position.z > SHOP_FRONT_WALL_Z, 'Bị ném ngoài đường phải ở ngoài đường tới khi biến mất');
      }
    }
    actorBodies.sync(customer, []);
    assert.equal(customer.root.visible, false);
    assert.equal(actorBodies.getCustomerBody(), null);
    // 5. Giao ly thành công -> khách đi ra vỉa hè ngoài đường tới cuối phố rồi xóa thân kinematic
    orderMgr.setSpawning(true);
    for (let i = 0; i < 200 && !customer.root.visible; i++) orderMgr.update(0.1);
    for (let i = 0; i < 200 && !orderMgr.hasCustomerAtCounter(); i++) {
      orderMgr.update(0.05);
      actorBodies.sync(customer, []);
      physics.step(1 / 60);
    }
    const order = orderMgr.getActiveOrder()!.order;
    const cup = { ...createEmptyCup(), base: order.base, sugar: order.sugar, ice: order.ice, topping: order.topping, sealed: true };
    assert.equal(orderMgr.deliverCup(cup), true);
    let sawDeliveredExit = false;
    for (let i = 0; i < 220 && customer.root.visible; i++) {
      orderMgr.update(0.05);
      actorBodies.sync(customer, []);
      if (customer.root.position.x > 6.0 && customer.root.position.z > SHOP_FRONT_WALL_Z) {
        sawDeliveredExit = true;
      }
    }
    assert.equal(sawDeliveredExit, true);
    assert.equal(customer.root.visible, false);
    actorBodies.sync(customer, []);
    assert.equal(actorBodies.getCustomerBody(), null);
    assert.equal(physics.world.bodies.len(), baseBodies);
  } finally {
    gameStore.updateState({ money: prevMoney });
    actorBodies.dispose();
    physics.dispose();
  }
}

// Tự kiểm tra cho Tab 3: người đi đường pool/Cao-Thấp/getPedestrians() và khách đi từ vỉa hè
export async function runSelfCheckStreetC(): Promise<void> {
  testPurePedestrianAndCustomerRoutes();
  testPedestriansThreeAndQuality();
  await testCustomerStreetLifecycleAndPhysics();
  console.log('selfCheckStreetC passed (pedestrian pool/quality/routes + customer street lifecycle)');
}
