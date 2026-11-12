import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createInteractionSystem } from '../interaction/interactionSystem.ts';
import { OUTLINE_ENABLED } from '../state/constantsGraphics.ts';
import {
  CUSTOMER_DOOR_OUTSIDE_POINT,
  SHOP_DOOR_WIDTH,
  SHOP_FRONT_WALL_Z,
  SHOP_WINDOW_SIZE,
  SHOP_WINDOW_XS,
  STREET_BOUNDS,
} from '../state/constantsStreet.ts';
import { createShopWorld } from '../world/shopWorld.ts';
import { BENCH_SPOTS, BIN_SPOTS, LAMP_SPOTS, TREE_SPOTS } from '../world/streetColliders.ts';
import { createStreet } from '../world/streetWorld.ts';
import {
  disposeTextures,
  getAsphaltTexture,
  getFacadeTexture,
  getShopSignTexture,
  getSidewalkTexture,
} from '../world/textures.ts';
import { addStreetColliders, buildStaticWorld } from './buildStaticWorld.ts';
import { FIXED_STEP, PLAYER_RADIUS, PLAYER_SPRINT_SPEED, PLAYER_WALK_SPEED } from './constantsPhysics.ts';
import { createFurnitureBodies } from './furnitureBodies.ts';
import { createPhysicsWorld, type PhysicsWorld } from './physicsWorld.ts';
import { createPlayerBody, type PlayerBody } from './playerBody.ts';

function stepPlayer(
  physics: PhysicsWorld,
  player: PlayerBody,
  vx: number,
  vz: number,
  steps: number,
): void {
  for (let i = 0; i < steps; i++) {
    player.setMoveVelocity(vx, vz, FIXED_STEP);
    physics.step(FIXED_STEP);
  }
}

function testStreetTexturesSafeAndCached(): void {
  assert.equal(getAsphaltTexture(), null);
  assert.equal(getSidewalkTexture(), null);
  assert.equal(getFacadeTexture(0), null);
  assert.equal(getFacadeTexture(1), null);
  assert.equal(getFacadeTexture(2), null);
  assert.equal(getShopSignTexture(true), null);
  assert.equal(getShopSignTexture(false), null);

  const prevDoc = (globalThis as { document?: unknown }).document;
  const noop = () => {};
  const ctxStub = {
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
  };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) =>
      tag === 'canvas' ? { width: 0, height: 0, getContext: () => ctxStub } : {},
  };

  try {
    const a1 = getAsphaltTexture();
    const a2 = getAsphaltTexture();
    assert.ok(a1 && a1 === a2, 'Texture đường nhựa phải được cache');
    const s1 = getSidewalkTexture();
    assert.ok(s1 && s1 === getSidewalkTexture(), 'Texture vỉa hè phải được cache');
    const f0 = getFacadeTexture(0);
    const f1 = getFacadeTexture(1);
    const f2 = getFacadeTexture(2);
    assert.ok(f0 && f1 && f2 && f0 !== f1 && f1 !== f2);
    const openTex = getShopSignTexture(true);
    const closedTex = getShopSignTexture(false);
    assert.ok(openTex && closedTex && openTex !== closedTex);
  } finally {
    disposeTextures();
    if (prevDoc === undefined) delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document?: unknown }).document = prevDoc;
  }
}

function testShopWindowsDoorwayAndStreetVisuals(): void {
  const scene = new THREE.Scene();
  const shop = createShopWorld(() => {});
  const street = createStreet(scene, 'high');
  scene.add(shop.root);
  scene.updateMatrixWorld(true);

  try {
    // 1. Cửa sổ nhìn xuyên ra đường (ray từ trong quán qua tâm kính không vướng shopWall)
    const ray = new THREE.Raycaster();
    for (const wx of SHOP_WINDOW_XS) {
      ray.set(new THREE.Vector3(wx, SHOP_WINDOW_SIZE.centerY, 2.0), new THREE.Vector3(0, 0, 1));
      const hits = ray.intersectObject(shop.root, true).filter((h) => h.object.name !== '__outline');
      assert.ok(hits.length > 0 && hits[0].object.name === 'shopWindowGlass', `Cửa sổ x=${wx} phải nhìn xuyên tới kính`);
      assert.equal(hits.some((h) => h.object.name === 'shopWall'), false, `Cửa sổ x=${wx} không được bị tường đặc che`);
    }

    // 2. Khoét cửa ra vào: ray qua tâm cửa đi thẳng ra ngoài không đụng tường hay kính
    ray.set(new THREE.Vector3(0, 1.4, 2.0), new THREE.Vector3(0, 0, 1));
    const doorRayHits = ray.intersectObject(shop.root, true).filter((h) => h.object.name !== '__outline');
    assert.equal(
      doorRayHits.some((h) => h.object.name === 'shopWall' || h.object.name === 'shopWindowGlass'),
      false,
      'Khoảng cửa phải thông hoàn toàn',
    );

    // 3. Biển Mở cửa / Đóng cửa đổi trạng thái hiển thị theo setShopOpen và tương tác E được
    const openSign = shop.root.getObjectByName('shopSignOpen')!;
    const closedSign = shop.root.getObjectByName('shopSignClosed')!;
    assert.ok(openSign && closedSign);
    shop.setShopOpen?.(true);
    assert.equal(openSign.visible, true);
    assert.equal(closedSign.visible, false);
    shop.setShopOpen?.(false);
    assert.equal(openSign.visible, false);
    assert.equal(closedSign.visible, true);

    const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 20);
    cam.position.set(0, 1.85, 2.5);
    cam.lookAt(0, 2.16, SHOP_FRONT_WALL_Z);
    cam.updateMatrixWorld(true);
    let doorInteracted = false;
    const interaction = createInteractionSystem(
      cam,
      [{ target: shop.stations.door, label: 'Mở ca', onInteract: () => { doorInteracted = true; } }],
      () => {},
    );
    interaction.update();
    assert.equal(interaction.getCurrentLabel(), 'Mở ca');
    interaction.trigger();
    assert.equal(doorInteracted, true);

    // 4. Vật liệu streetWorld dùng MeshStandardMaterial, không outline khi tắt, có đủ prop & đổi bóng Cao/Thấp
    const streetRoot = scene.getObjectByName('streetWorld')!;
    assert.ok(streetRoot);
    let treeCount = 0;
    let lampCount = 0;
    let benchCount = 0;
    let binCount = 0;
    let crosswalkCount = 0;
    streetRoot.traverse((obj) => {
      if (obj.name === 'streetTree') treeCount++;
      else if (obj.name === 'streetLamp') lampCount++;
      else if (obj.name === 'streetBench') benchCount++;
      else if (obj.name === 'streetTrashBin') binCount++;
      else if (obj.name === 'streetCrosswalkStripe') crosswalkCount++;
      if (obj instanceof THREE.Mesh) {
        assert.ok(OUTLINE_ENABLED || obj.name !== '__outline');
        assert.ok(obj.material instanceof THREE.MeshStandardMaterial);
      }
    });
    assert.ok(treeCount >= TREE_SPOTS.length);
    assert.equal(lampCount, LAMP_SPOTS.length);
    assert.equal(benchCount, BENCH_SPOTS.length);
    assert.equal(binCount, BIN_SPOTS.length);
    assert.ok(crosswalkCount >= 12);

    const road = streetRoot.getObjectByName('streetRoad') as THREE.Mesh;
    const building = streetRoot.getObjectByName('streetBuilding') as THREE.Mesh;
    const benchSeat = streetRoot.getObjectByName('streetBench')!.children[2] as THREE.Mesh;
    assert.equal(road.castShadow, false);
    assert.equal(road.receiveShadow, true);
    assert.equal(building.castShadow, true);
    assert.equal(benchSeat.castShadow, true);

    street.setQuality('low');
    assert.equal(building.castShadow, false);
    assert.equal(benchSeat.castShadow, false);
    street.setQuality('high');
    assert.equal(building.castShadow, true);
    assert.equal(benchSeat.castShadow, true);
    street.setDimmed?.(true);
  } finally {
    street.dispose();
  }
}

async function testStreetPhysicsWalkthroughAndBounds(): Promise<void> {
  assert.ok(SHOP_DOOR_WIDTH >= 1.2);
  const physics = await createPhysicsWorld();
  const scene = new THREE.Scene();
  const shop = createShopWorld(() => {});
  const street = createStreet(scene, 'high');
  let player: PlayerBody | null = null;

  try {
    assert.ok(street.colliders.some((c) => c.tag === 'floor'), 'Danh sách collider đường phải có sàn floor');
    const created = buildStaticWorld(physics, shop.colliders, { streetColliders: street.colliders });
    const nonFloorStreetCount = street.colliders.filter((c) => c.tag !== 'floor').length;
    assert.equal(created.length, 2 + shop.colliders.length + nonFloorStreetCount);

    // Kiểm tra addStreetColliders hoạt động độc lập (tạo cả floor đường)
    const standalone = await createPhysicsWorld();
    try {
      const cols = addStreetColliders(standalone, street.colliders);
      assert.equal(cols.length, street.colliders.length);
    } finally {
      standalone.dispose();
    }

    // 1. Capsule người chơi đi từ trong quán qua cửa ra vỉa hè, băng qua đường (không vấp bờ lề) và quay lại
    player = createPlayerBody(physics, { x: 0, y: 0, z: 2.6 });
    stepPlayer(physics, player, 0, PLAYER_WALK_SPEED, 80);
    const outsidePos = player.getPosition(1);
    assert.ok(outsidePos.z > CUSTOMER_DOOR_OUTSIDE_POINT.z, `Phải đi qua cửa ra vỉa hè, z=${outsidePos.z}`);
    assert.ok(Math.abs(outsidePos.y) < 0.03, `Đi qua cửa/vỉa hè không được nảy: y=${outsidePos.y}`);

    stepPlayer(physics, player, 0, PLAYER_WALK_SPEED, 110);
    const roadCrossed = player.getPosition(1);
    assert.ok(roadCrossed.z > 10.0, `Phải băng qua lòng đường mượt không vấp bờ lề, z=${roadCrossed.z}`);
    assert.ok(Math.abs(roadCrossed.y) < 0.03);

    stepPlayer(physics, player, 0, -PLAYER_SPRINT_SPEED, 140);
    const backInside = player.getPosition(1);
    assert.ok(backInside.z < 3.0, `Phải đi ngược từ phố qua cửa vào lại quán, z=${backInside.z}`);

    // 2. Không đi xuyên qua 2 cửa sổ kính hay tường quanh cửa sổ
    for (const wx of SHOP_WINDOW_XS) {
      player.teleport(wx, 0, 2.8);
      stepPlayer(physics, player, 0, PLAYER_SPRINT_SPEED, 80);
      assert.ok(player.getPosition(1).z <= 4.0 - PLAYER_RADIUS + 0.02, `Không được đi xuyên cửa sổ x=${wx}`);
    }

    // 3. Không đi ra ngoài rìa đường (đông, tây, nam, góc bắc)
    player.teleport(STREET_BOUNDS.minX + 1.0, 0, 9.2);
    stepPlayer(physics, player, -PLAYER_SPRINT_SPEED, 0, 80);
    assert.ok(player.getPosition(1).x >= STREET_BOUNDS.minX + PLAYER_RADIUS - 0.02);

    player.teleport(STREET_BOUNDS.maxX - 1.0, 0, 9.2);
    stepPlayer(physics, player, PLAYER_SPRINT_SPEED, 0, 80);
    assert.ok(player.getPosition(1).x <= STREET_BOUNDS.maxX - PLAYER_RADIUS + 0.02);

    player.teleport(-4.5, 0, STREET_BOUNDS.maxZ - 1.2);
    stepPlayer(physics, player, 0, PLAYER_SPRINT_SPEED, 80);
    assert.ok(player.getPosition(1).z <= STREET_BOUNDS.maxZ - PLAYER_RADIUS + 0.02);

    player.teleport(-7.5, 0, 5.5);
    stepPlayer(physics, player, 0, -PLAYER_SPRINT_SPEED, 80);
    assert.ok(player.getPosition(1).z >= STREET_BOUNDS.minZ + PLAYER_RADIUS - 0.02);

    // 4. Các prop tĩnh ngoài đường (cây, cột đèn, ghế đá, thùng rác) đều có collider 'wall'
    for (const spot of [TREE_SPOTS[3], LAMP_SPOTS[2], BENCH_SPOTS[1], BIN_SPOTS[1]]) {
      const hit = physics.raycast({ x: spot.x, y: 0.45, z: spot.z - 2.0 }, { x: 0, y: 0, z: 1 }, 2.2);
      assert.ok(hit && hit.tag.kind === 'wall', `Prop tại (${spot.x}, ${spot.z}) phải có collider tĩnh 'wall'`);
    }

    // 5. Ghế động đẩy qua cửa ra ngoài vỉa hè được
    const furniture = createFurnitureBodies(physics, shop);
    try {
      const chair = furniture.getChairBodies()[0];
      chair.setTranslation({ x: 0, y: chair.translation().y, z: 3.3 }, true);
      chair.setLinvel({ x: 0, y: 0, z: 0 }, true);
      player.teleport(0, 0, 2.4);
      stepPlayer(physics, player, 0, PLAYER_WALK_SPEED, 90);
      assert.ok(chair.translation().z > 4.5, `Ghế phải đi qua cửa ra vỉa hè được, z=${chair.translation().z}`);
    } finally {
      furniture.dispose();
    }
  } finally {
    player?.dispose();
    street.dispose();
    physics.dispose();
  }
}

// Tự kiểm tra cho Tab 2: đường phố 3D, texture, cửa sổ kính nhìn xuyên, cửa đi thông và vật lý Rapier
export async function runSelfCheckStreetB(): Promise<void> {
  testStreetTexturesSafeAndCached();
  testShopWindowsDoorwayAndStreetVisuals();
  await testStreetPhysicsWalkthroughAndBounds();
  console.log('selfCheckStreetB passed (street visuals/textures, real windows, open doorway, Rapier static colliders)');
}
