import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { InputState } from '../core/input.ts';
import { createInteractionSystem } from '../interaction/interactionSystem.ts';
import { createFirstPersonController } from '../player/firstPersonController.ts';
import { createPlayerAvatar } from '../world/playerAvatar.ts';
import { createShopWorld } from '../world/shopWorld.ts';
import { buildStaticWorld } from './buildStaticWorld.ts';
import { COLLISION_GROUPS } from './collisionGroups.ts';
import {
  FIXED_STEP,
  PLAYER_EYE_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_SPRINT_SPEED,
  PLAYER_WALK_SPEED,
} from './constantsPhysics.ts';
import { createFurnitureBodies } from './furnitureBodies.ts';
import { createPhysicsWorld, type PhysicsWorld } from './physicsWorld.ts';
import { createPlayerBody, type PlayerBody } from './playerBody.ts';

function stepPlayer(
  physics: PhysicsWorld,
  player: PlayerBody,
  vx: number,
  vz: number,
  steps: number,
  dt = FIXED_STEP,
  onStep?: (i: number) => void,
): void {
  for (let i = 0; i < steps; i++) {
    player.setMoveVelocity(vx, vz, dt);
    physics.step(dt);
    onStep?.(i);
  }
}

function createMockPointerLockDom() {
  const listeners = new Map<string, Set<() => void>>();
  const doc = {
    pointerLockElement: null as unknown,
    addEventListener: (t: string, fn: () => void) => (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(fn),
    removeEventListener: (t: string, fn: () => void) => listeners.get(t)?.delete(fn),
    exitPointerLock() {
      doc.pointerLockElement = null;
      for (const fn of listeners.get('pointerlockchange') ?? []) fn();
    },
  };
  const el = {
    ownerDocument: doc,
    requestPointerLock() {
      doc.pointerLockElement = el;
      for (const fn of listeners.get('pointerlockchange') ?? []) fn();
    },
  } as unknown as HTMLElement;
  return el;
}

async function testStandSteadyAndGravity(): Promise<void> {
  const physics = await createPhysicsWorld();
  try {
    const shopWorld = createShopWorld(() => {});
    buildStaticWorld(physics, shopWorld.colliders);
    const player = createPlayerBody(physics, { x: 0, y: 0, z: 1.8 });

    assert.equal(player.isGrounded(), true, 'Đứng trên sàn phải báo isGrounded=true');
    let minY = Infinity;
    let maxY = -Infinity;
    stepPlayer(physics, player, 0, 0, 180, 1 / 144, () => {
      const eyeY = player.getEyePosition(physics.alpha).y;
      minY = Math.min(minY, eyeY);
      maxY = Math.max(maxY, eyeY);
    });
    assert.ok(Math.abs(minY - PLAYER_EYE_HEIGHT) < 1e-3, `Lệch độ cao mắt: ${minY}`);
    assert.ok(maxY - minY < 1e-3, `Đứng yên bị rung: diff=${maxY - minY}`);
    const p0 = player.getPosition(1);
    assert.ok(Math.hypot(p0.x, p0.z - 1.8) < 1e-5, 'Đứng yên không được trôi ngang');

    player.teleport(0, 1.0, 1.8);
    assert.equal(player.isGrounded(), false, 'Đang trên không phải báo isGrounded=false');
    stepPlayer(physics, player, 0, 0, 60);
    assert.equal(player.isGrounded(), true, 'Rơi xuống sàn phải chạm đất');
    assert.ok(Math.abs(player.getPosition(1).y) < 0.01);

    player.dispose();
    assert.equal(player.body, null);
  } finally {
    physics.dispose();
  }
}

async function testWallStopNoJitterAndZeroFrictionSlide(): Promise<void> {
  const physics = await createPhysicsWorld();
  try {
    const shopWorld = createShopWorld(() => {});
    buildStaticWorld(physics, shopWorld.colliders);
    const player = createPlayerBody(physics, { x: 4.0, y: 0, z: 0 });

    const wallXs: number[] = [];
    stepPlayer(physics, player, PLAYER_SPRINT_SPEED, 0, 240, 1 / 144, (i) => {
      if (i >= 140) wallXs.push(player.getPosition(physics.alpha).x);
    });
    const maxWallX = Math.max(...wallXs);
    const minWallX = Math.min(...wallXs);
    assert.ok(maxWallX <= 5.0 - PLAYER_RADIUS + 0.01, `Không được lọt tường đông: x=${maxWallX}`);
    assert.ok(maxWallX - minWallX < 1e-3, `Đứng sát tường bị rung ở 144Hz: diff=${maxWallX - minWallX}`);

    const zStart = player.getPosition(1).z;
    const diag = Math.SQRT1_2 * PLAYER_WALK_SPEED;
    stepPlayer(physics, player, diag, diag, 60);
    const dz = player.getPosition(1).z - zStart;
    assert.ok(dz > diag * 0.78, `Đi dọc tường bị dính/chậm bất thường: dz=${dz}`);
    assert.ok(player.getPosition(1).x <= 5.0 - PLAYER_RADIUS + 0.01);

    player.dispose();
  } finally {
    physics.dispose();
  }
}

async function testSmoothAccelDecelAndPushChairNoTableClip(): Promise<void> {
  const physics = await createPhysicsWorld();
  try {
    const shopWorld = createShopWorld(() => {});
    buildStaticWorld(physics, shopWorld.colliders);
    const player = createPlayerBody(physics, { x: 0, y: 0, z: 0 });

    stepPlayer(physics, player, PLAYER_WALK_SPEED, 0, 1);
    const speedAfter1 = Math.hypot(player.body!.linvel().x, player.body!.linvel().z);
    assert.ok(speedAfter1 > 0 && speedAfter1 < PLAYER_WALK_SPEED, `Tăng tốc phải mượt: v=${speedAfter1}`);

    stepPlayer(physics, player, PLAYER_WALK_SPEED, 0, 20);
    assert.ok(Math.abs(player.body!.linvel().x - PLAYER_WALK_SPEED) < 0.05);

    stepPlayer(physics, player, 0, 0, 20);
    assert.ok(Math.hypot(player.body!.linvel().x, player.body!.linvel().z) < 0.05, 'Nhả phím phải dừng lại');

    // Đẩy ghế thật của quán (ghế phải bàn 4 ở x=-2.38, z=1.8) ra khoảng trống
    const furniture = createFurnitureBodies(physics, shopWorld);
    const table4Chair = furniture.getChairBodies().find(
      (b) => Math.abs(b.translation().x - -2.38) < 0.05 && Math.abs(b.translation().z - 1.8) < 0.05,
    );
    assert.ok(table4Chair, 'Phải tìm thấy ghế phải bàn 4');
    player.teleport(-2.38, 0, 1.0);
    stepPlayer(physics, player, 0, PLAYER_WALK_SPEED, 60);
    assert.ok(table4Chair.translation().z > 2.4, `Đẩy ghế không dịch chuyển: z=${table4Chair.translation().z}`);
    assert.ok(Math.abs(player.getPosition(1).y) < 0.03);

    // Chạy nhanh ép ghế trái bàn 2 (x=2.38, z=0.4) vào bàn 2 (minX=2.64) -> không xuyên bàn, không vọt lên
    const table2Chair = furniture.getChairBodies().find(
      (b) => Math.abs(b.translation().x - 2.38) < 0.05 && Math.abs(b.translation().z - 0.4) < 0.05,
    );
    assert.ok(table2Chair, 'Phải tìm thấy ghế trái bàn 2');
    player.teleport(1.4, 0, 0.4);
    stepPlayer(physics, player, PLAYER_SPRINT_SPEED, 0, 120, FIXED_STEP, () => {
      assert.ok(player.getPosition(1).y < 0.05, `Bị nảy lên khi ép ghế vào bàn: y=${player.getPosition(1).y}`);
    });
    assert.ok(player.getPosition(1).x <= 2.64 - PLAYER_RADIUS + 0.02, `Xuyên vào vùng bàn: x=${player.getPosition(1).x}`);
    assert.ok(table2Chair.translation().x < 2.64, 'Ghế phải dừng trước mép bàn');

    // Thoát ngang theo +Z khi kẹt giữa bàn và ghế -> không kẹt
    const zBefore = player.getPosition(1).z;
    stepPlayer(physics, player, 0, PLAYER_WALK_SPEED, 60);
    assert.ok(player.getPosition(1).z - zBefore > 2.0, 'Bị kẹt giữa bàn và ghế');
    furniture.dispose();

    // Chạy chéo vào góc quầy pha chế (maxX=0.27, maxZ=-1.05) -> trượt mượt, không xuyên quầy
    player.teleport(0.9, 0, -0.5);
    stepPlayer(physics, player, -PLAYER_SPRINT_SPEED * 0.7, -PLAYER_SPRINT_SPEED * 0.7, 90);
    const pCorner = player.getPosition(1);
    const insideCounter = pCorner.x < 0.27 && pCorner.z < -1.05 && pCorner.x > -3.87 && pCorner.z > -1.95;
    assert.equal(insideCounter, false, 'Không được lọt xuyên góc quầy pha chế');

    // Vật ném (PROJECTILE) bay xuyên qua người chơi, không đẩy người chơi
    player.teleport(0, 0, 0);
    stepPlayer(physics, player, 0, 0, 5);
    physics.addDynamicBody({
      position: { x: -1.0, y: 1.0, z: 0 },
      linvel: { x: 10, y: 0, z: 0 },
      gravityScale: 0,
      ccdEnabled: true,
      collisionGroups: COLLISION_GROUPS.PROJECTILE,
      shape: { type: 'cylinder', halfHeight: 0.09, radius: 0.07 },
      tag: { kind: 'projectile', id: 99 },
    });
    stepPlayer(physics, player, 0, 0, 20);
    assert.ok(Math.hypot(player.getPosition(1).x, player.getPosition(1).z) < 1e-4, 'Vật ném không được đẩy người chơi');

    player.dispose();
  } finally {
    physics.dispose();
  }
}

async function testController144HzAndInteractionAvatarCompat(): Promise<void> {
  const physics = await createPhysicsWorld();
  let player: PlayerBody | null = null;
  try {
    const shopWorld = createShopWorld(() => {});
    buildStaticWorld(physics, shopWorld.colliders);
    player = createPlayerBody(physics, { x: 0, y: 0, z: 1.8 });

    const pressed = new Set<string>();
    const mockInput: InputState = {
      isDown: (code) => pressed.has(code),
      onInteract: () => () => {},
      onDigit: () => () => {},
      onKey: () => () => {},
      clear: () => pressed.clear(),
      dispose: () => {},
    };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 50);
    scene.add(camera);
    let lockState = false;
    const fpc = createFirstPersonController(
      camera,
      createMockPointerLockDom(),
      mockInput,
      player,
      (locked) => {
        lockState = locked;
      },
    );
    assert.ok(Math.abs(camera.position.y - PLAYER_EYE_HEIGHT) < 1e-5);
    assert.ok(Math.abs(camera.position.z - 1.8) < 1e-5);

    const avatar = createPlayerAvatar(scene, camera);
    avatar.setVisibleToSelf(true);
    let interacted = false;
    const targetBox = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshBasicMaterial());
    targetBox.position.set(0, 1.4, -0.4);
    scene.add(targetBox);
    targetBox.updateMatrixWorld(true);
    const interaction = createInteractionSystem(
      camera,
      [{ target: targetBox, label: 'Quầy test', onInteract: () => { interacted = true; } }],
      () => {},
    );

    fpc.lock();
    assert.equal(lockState, true);
    pressed.add('KeyW');
    pressed.add('ShiftLeft');

    let prevZ = 1.8;
    let maxStep = 0;
    let movedFrames = 0;
    for (let i = 0; i < 60; i++) {
      const dt = 1 / 144;
      fpc.update(dt);
      physics.step(dt);
      fpc.syncAfterPhysics?.(physics.alpha);
      avatar.update(dt);
      const step = prevZ - camera.position.z;
      assert.ok(step >= -1e-6, `Camera 144Hz bị giật lùi: step=${step}`);
      if (step > 1e-4) movedFrames++;
      maxStep = Math.max(maxStep, step);
      prevZ = camera.position.z;
    }
    assert.ok(movedFrames > 40, `Nội suy 144Hz phải mượt liên tục, movedFrames=${movedFrames}`);
    assert.ok(maxStep < (PLAYER_SPRINT_SPEED / 144) * 1.6, `Nhảy vọt 144Hz: maxStep=${maxStep}`);

    camera.updateMatrixWorld(true);
    interaction.update();
    assert.equal(interaction.getCurrentLabel(), 'Quầy test');
    interaction.trigger();
    assert.equal(interacted, true);

    fpc.unlock();
    assert.equal(lockState, false);
    assert.equal(pressed.size, 0);
    assert.ok(Math.hypot(player.body!.linvel().x, player.body!.linvel().z) < 1e-5);

    avatar.dispose();
    fpc.dispose();
  } finally {
    player?.dispose();
    physics.dispose();
  }
}

// Tự kiểm tra GĐ9d: thân capsule động người chơi, tường, trượt không dính, đẩy ghế, nội suy 144Hz
export async function runSelfCheck9d(): Promise<void> {
  await testStandSteadyAndGravity();
  await testWallStopNoJitterAndZeroFrictionSlide();
  await testSmoothAccelDecelAndPushChairNoTableClip();
  await testController144HzAndInteractionAvatarCompat();
  console.log('selfCheck9d passed (player dynamic capsule, 144Hz interp, wall slide, chair push, compat)');
}
