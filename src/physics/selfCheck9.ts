import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createShopWorld } from '../world/shopWorld.ts';
import { buildStaticWorld, staticTagToThrowTarget } from './buildStaticWorld.ts';
import { COLLISION_GROUPS, canCollide } from './collisionGroups.ts';
import { FIXED_STEP, GRAVITY, MAX_SUBSTEPS, PLAYER_HEIGHT, PLAYER_RADIUS } from './constantsPhysics.ts';
import { createPhysicsDebug } from './physicsDebug.ts';
import { bindMesh, getInterpolatedPosition, unbindMesh, updateBoundMeshes } from './physicsSync.ts';
import { createPhysicsWorld, type BodyTag } from './physicsWorld.ts';
import { runSelfCheck9b } from './selfCheck9b.ts';
import { runSelfCheck9c } from './selfCheck9c.ts';
import { runSelfCheck9d } from './selfCheck9d.ts';

function stepFrames(physics: Awaited<ReturnType<typeof createPhysicsWorld>>, dts: readonly number[]): void {
  for (const dt of dts) physics.step(dt);
}

async function testBoxDropsAndStopsOnFloor(): Promise<void> {
  const physics = await createPhysicsWorld();
  try {
    physics.addStaticBox({ x: 0, y: -0.25, z: 0 }, { x: 5, y: 0.25, z: 5 }, 'floor');

    const immediateHit = physics.raycast({ x: 0, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }, 5);
    assert.ok(immediateHit && immediateHit.tag.kind === 'floor');
    assert.ok(Math.abs(immediateHit.point.y) < 1e-3);

    const contacts: Array<{ a: BodyTag; b: BodyTag; impulse: number }> = [];
    physics.onContact((a, b, impulse) => contacts.push({ a, b, impulse }));

    const halfY = 0.25;
    const box = physics.addDynamicBody({
      position: { x: 0, y: 2.0, z: 0 },
      mass: 2.0,
      friction: 0.7,
      restitution: 0,
      collisionGroups: COLLISION_GROUPS.CHAIR,
      shape: { type: 'box', hx: 0.25, hy: halfY, hz: 0.25 },
      tag: { kind: 'chair', id: 'drop-test' },
    });

    const dts = Array.from({ length: 120 }, () => FIXED_STEP);
    stepFrames(physics, dts);

    const y = box.translation().y;
    const vy = box.linvel().y;
    assert.ok(Math.abs(y - halfY) < 0.03, `Hộp phải dừng tại y ≈ ${halfY}, nhận y=${y}`);
    assert.ok(Math.abs(vy) < 0.05, `Vận tốc dọc khi dừng phải gần 0, nhận vy=${vy}`);

    const floorHit = contacts.find(
      (c) => (c.a.kind === 'chair' && c.b.kind === 'floor') || (c.b.kind === 'chair' && c.a.kind === 'floor'),
    );
    assert.ok(floorHit, 'onContact phải báo va chạm chair-floor');
    assert.ok(floorHit.impulse > 0, `Xung va chạm phải > 0, nhận ${floorHit.impulse}`);
  } finally {
    physics.dispose();
  }
}

async function testFixedStepDeterminismAndInterpolation(): Promise<void> {
  assert.ok(GRAVITY < 0 && FIXED_STEP === 1 / 60 && MAX_SUBSTEPS === 5);

  const runSim = async (dtList: readonly number[]) => {
    const physics = await createPhysicsWorld();
    try {
      physics.addStaticBox({ x: 0, y: -0.25, z: 0 }, { x: 5, y: 0.25, z: 5 }, 'floor');
      const body = physics.addDynamicBody({
        position: { x: -1, y: 1.5, z: 0 },
        linvel: { x: 2.4, y: 1.2, z: -0.9 },
        mass: 1,
        restitution: 0.2,
        collisionGroups: COLLISION_GROUPS.CHAIR,
        shape: { type: 'box', hx: 0.2, hy: 0.2, hz: 0.2 },
        tag: { kind: 'chair', id: 'det-box' },
      });
      const mesh = new THREE.Object3D();
      bindMesh(body, mesh);
      stepFrames(physics, dtList);
      updateBoundMeshes(physics.alpha);
      const pos = body.translation();
      const vel = body.linvel();
      assert.ok(mesh.position.distanceTo(getInterpolatedPosition(body)) < 1e-6);
      return { alpha: physics.alpha, pos: { x: pos.x, y: pos.y, z: pos.z }, vel: { x: vel.x, y: vel.y, z: vel.z } };
    } finally {
      physics.dispose();
    }
  };

  // Hai chuỗi thời gian khác tần số khung hình nhưng cùng đúng 30 bước vật lý + phần dư 0.5 bước
  const sixtyHz = [...Array.from({ length: 30 }, () => FIXED_STEP), FIXED_STEP * 0.5];
  const halfStep = FIXED_STEP * 0.5;
  const highRefresh = Array.from({ length: 61 }, () => halfStep);

  const a = await runSim(sixtyHz);
  const b = await runSim(highRefresh);

  assert.ok(a.alpha >= 0 && a.alpha < 1 && Math.abs(a.alpha - 0.5) < 1e-5);
  assert.ok(b.alpha >= 0 && b.alpha < 1 && Math.abs(b.alpha - 0.5) < 1e-5);
  assert.deepEqual(a.pos, b.pos, 'Bước cố định phải cho vị trí giống hệt nhau giữa hai lần chạy');
  assert.deepEqual(a.vel, b.vel, 'Bước cố định phải cho vận tốc giống hệt nhau giữa hai lần chạy');

  const p0 = await (async () => {
    const physics = await createPhysicsWorld();
    try {
      const b0 = physics.addDynamicBody({
        position: { x: 0, y: 2, z: 0 }, linvel: { x: 6, y: 0, z: 0 }, gravityScale: 0,
        collisionGroups: COLLISION_GROUPS.CHAIR, shape: { type: 'box', hx: 0.1, hy: 0.1, hz: 0.1 }, tag: { kind: 'chair' },
      });
      const m = new THREE.Object3D();
      bindMesh(b0, m);
      physics.step(FIXED_STEP + FIXED_STEP * 0.5);
      const currX = b0.translation().x;
      updateBoundMeshes(0);
      const xAt0 = m.position.x;
      updateBoundMeshes(0.5);
      const xAtHalf = m.position.x;
      updateBoundMeshes(1);
      const xAt1 = m.position.x;
      unbindMesh(m);
      return { xAt0, xAtHalf, xAt1, currX };
    } finally {
      physics.dispose();
    }
  })();

  assert.ok(Math.abs(p0.xAt0 - 0) < 1e-6);
  assert.ok(Math.abs(p0.xAtHalf - p0.currX * 0.5) < 1e-6);
  assert.ok(Math.abs(p0.xAt1 - p0.currX) < 1e-6);

  // Khung hình cực chậm (dt=1.0s) bị chặn ở MAX_SUBSTEPS=5 để tránh xoắn ốc chết
  const [slowP, capP] = await Promise.all([createPhysicsWorld(), createPhysicsWorld()]);
  try {
    const d = { position: { x: 0, y: 5, z: 0 }, mass: 1, collisionGroups: COLLISION_GROUPS.CHAIR, shape: { type: 'box' as const, hx: 0.1, hy: 0.1, hz: 0.1 }, tag: { kind: 'chair' as const } };
    const slowBox = slowP.addDynamicBody(d), capBox = capP.addDynamicBody(d);
    slowP.step(1.0);
    stepFrames(capP, Array.from({ length: MAX_SUBSTEPS }, () => FIXED_STEP));
    assert.equal(slowP.alpha, 0, 'Phần dư khi chạm MAX_SUBSTEPS phải được xả về 0');
    assert.deepEqual(slowBox.translation(), capBox.translation(), 'dt lớn phải bị giới hạn đúng MAX_SUBSTEPS');
  } finally {
    slowP.dispose();
    capP.dispose();
  }
}

async function testCollisionGroupFilteringAndContactTags(): Promise<void> {
  assert.equal(canCollide(COLLISION_GROUPS.PROJECTILE, COLLISION_GROUPS.PLAYER), false);
  assert.equal(canCollide(COLLISION_GROUPS.PROJECTILE, COLLISION_GROUPS.PROJECTILE), false);
  assert.equal(canCollide(COLLISION_GROUPS.PLAYER, COLLISION_GROUPS.CUSTOMER), false);
  assert.equal(canCollide(COLLISION_GROUPS.PLAYER, COLLISION_GROUPS.STAFF), false);
  assert.equal(canCollide(COLLISION_GROUPS.CUSTOMER, COLLISION_GROUPS.CHAIR), false);
  assert.equal(canCollide(COLLISION_GROUPS.CUSTOMER, COLLISION_GROUPS.STATIC), false);
  assert.equal(canCollide(COLLISION_GROUPS.CUSTOMER, COLLISION_GROUPS.PROJECTILE), true);
  assert.equal(canCollide(COLLISION_GROUPS.CHAIR, COLLISION_GROUPS.PLAYER), true);
  assert.equal(canCollide(COLLISION_GROUPS.CHAIR, COLLISION_GROUPS.STAFF), true);

  const physics = await createPhysicsWorld();
  try {
    const events: string[] = [];
    physics.onContact((a, b) => events.push(`${a.kind}:${b.kind}`));

    const player = physics.addDynamicBody({
      position: { x: 0, y: 1, z: 0 },
      gravityScale: 0,
      lockRotations: true,
      collisionGroups: COLLISION_GROUPS.PLAYER,
      shape: { type: 'capsule', halfHeight: (PLAYER_HEIGHT - 2 * PLAYER_RADIUS) * 0.5, radius: PLAYER_RADIUS },
      tag: { kind: 'player' },
    });

    const proj1 = physics.addDynamicBody({
      position: { x: -1.0, y: 1, z: 0 },
      linvel: { x: 8, y: 0, z: 0 },
      gravityScale: 0,
      ccdEnabled: true,
      collisionGroups: COLLISION_GROUPS.PROJECTILE,
      shape: { type: 'box', hx: 0.1, hy: 0.1, hz: 0.1 },
      tag: { kind: 'projectile', id: 1 },
    });

    stepFrames(physics, Array.from({ length: 20 }, () => FIXED_STEP));
    assert.equal(events.length, 0, 'PROJECTILE đi qua PLAYER không được phát sinh va chạm');
    assert.ok(Math.abs(player.translation().x) < 1e-6 && Math.abs(player.linvel().x) < 1e-6);
    physics.removeBody(proj1.handle);

    // Hai PROJECTILE đi xuyên qua nhau
    const pA = physics.addDynamicBody({
      position: { x: -1, y: 2.2, z: 0 },
      linvel: { x: 4, y: 0, z: 0 },
      gravityScale: 0,
      collisionGroups: COLLISION_GROUPS.PROJECTILE,
      shape: { type: 'box', hx: 0.1, hy: 0.1, hz: 0.1 },
      tag: { kind: 'projectile', id: 10 },
    });
    const pB = physics.addDynamicBody({
      position: { x: 1, y: 2.2, z: 0 },
      linvel: { x: -4, y: 0, z: 0 },
      gravityScale: 0,
      collisionGroups: COLLISION_GROUPS.PROJECTILE,
      shape: { type: 'box', hx: 0.1, hy: 0.1, hz: 0.1 },
      tag: { kind: 'projectile', id: 11 },
    });
    stepFrames(physics, Array.from({ length: 30 }, () => FIXED_STEP));
    assert.equal(events.length, 0, 'PROJECTILE-PROJECTILE không được va chạm');
    physics.removeBody(pA.handle);
    physics.removeBody(pB.handle);

    // CUSTOMER kinematic chỉ va chạm với PROJECTILE, không va chạm với PLAYER
    physics.addDynamicBody({
      type: 'kinematicPosition',
      position: { x: 3, y: 0.8, z: 0 },
      collisionGroups: COLLISION_GROUPS.CUSTOMER,
      activeCollisionTypes: RAPIER.ActiveCollisionTypes.DEFAULT,
      shape: { type: 'box', hx: 0.3, hy: 0.8, hz: 0.3 },
      tag: { kind: 'customer', id: 'cust-1' },
    });

    // Đẩy PLAYER đi xuyên qua CUSTOMER ở x=3
    player.setLinvel({ x: 6, y: 0, z: 0 }, true);
    stepFrames(physics, Array.from({ length: 40 }, () => FIXED_STEP));
    assert.ok(player.translation().x > 3.5, 'PLAYER phải đi xuyên qua CUSTOMER');
    assert.equal(events.length, 0, 'PLAYER-CUSTOMER không được sinh va chạm');

    // Bắn PROJECTILE trúng CUSTOMER ở x=3
    const custHits: BodyTag[] = [];
    physics.onContact((a, b) => {
      if (a.kind === 'projectile' && b.kind === 'customer') custHits.push(b);
      if (b.kind === 'projectile' && a.kind === 'customer') custHits.push(a);
    });
    physics.addDynamicBody({
      position: { x: 2.0, y: 0.8, z: 0 },
      linvel: { x: 8, y: 0, z: 0 },
      gravityScale: 0,
      ccdEnabled: true,
      collisionGroups: COLLISION_GROUPS.PROJECTILE,
      shape: { type: 'cylinder', halfHeight: 0.09, radius: 0.07 },
      tag: { kind: 'projectile', id: 2 },
    });
    stepFrames(physics, Array.from({ length: 20 }, () => FIXED_STEP));
    assert.equal(custHits.length, 1, 'PROJECTILE phải báo va chạm đúng 1 lần với CUSTOMER');
    assert.equal(custHits[0].id, 'cust-1');
  } finally {
    physics.dispose();
  }
}

async function testStaticWorldAndDebug(): Promise<void> {
  const physics = await createPhysicsWorld();
  const scene = new THREE.Scene();
  const debug = createPhysicsDebug(scene, physics);
  try {
    const world = createShopWorld(() => {});
    const colliders = buildStaticWorld(physics, world.colliders);
    assert.ok(colliders.length >= world.colliders.length + 2);

    const counterHit = physics.raycast({ x: -1.8, y: 2.5, z: -1.5 }, { x: 0, y: -1, z: 0 }, 4);
    assert.ok(counterHit && (counterHit.tag.kind === 'counter' || counterHit.tag.kind === 'machine'));

    const floorHit = physics.raycast({ x: 0, y: 1.5, z: 2.0 }, { x: 0, y: -1, z: 0 }, 3);
    assert.ok(floorHit && floorHit.tag.kind === 'floor');

    const wallHit = physics.raycast({ x: 0, y: 1.5, z: 0 }, { x: 0, y: 0, z: -1 }, 6);
    assert.ok(wallHit && wallHit.tag.kind === 'wall');

    assert.equal(staticTagToThrowTarget('bin'), 'bin');
    assert.equal(staticTagToThrowTarget('machine'), 'wall');
    assert.equal(staticTagToThrowTarget('rack'), 'wall');

    assert.equal(debug.isEnabled(), false);
    assert.equal(debug.toggle(), true);
    debug.update();
    const lines = scene.getObjectByName('__physicsDebugLines') as THREE.LineSegments | undefined;
    assert.ok(lines && lines.visible === true);
    assert.ok((lines.geometry.getAttribute('position')?.count ?? 0) > 0);
    assert.equal(debug.toggle(), false);
  } finally {
    debug.dispose();
    physics.dispose();
  }
}

export async function runSelfCheck9(): Promise<void> {
  await testBoxDropsAndStopsOnFloor();
  await testFixedStepDeterminismAndInterpolation();
  await testCollisionGroupFilteringAndContactTags();
  await testStaticWorldAndDebug();
  await runSelfCheck9b();
  await runSelfCheck9c();
  await runSelfCheck9d();
  console.log('selfCheck9 passed (Rapier physics core, fixed-step determinism, groups, static world, debug)');
}

await runSelfCheck9();
