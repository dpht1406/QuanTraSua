import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { MAX_FLYING, MAX_LANDED, STUCK_SEC } from '../state/constantsThrow.ts';
import { createEmptyCup } from '../state/scoring.ts';
import { createProjectileVisual } from '../world/projectileMeshes.ts';
import { COLLISION_GROUPS } from './collisionGroups.ts';
import {
  CHAIR_FRICTION,
  CHAIR_LINEAR_DAMPING,
  CHAIR_MASS,
  CUP_HALF_HEIGHT,
  FIXED_STEP,
  PLAYER_HALF_HEIGHT,
  PLAYER_RADIUS,
} from './constantsPhysics.ts';
import { bindMesh, unbindMesh, updateBoundMeshes } from './physicsSync.ts';
import { createPhysicsWorld, type PhysicsWorld } from './physicsWorld.ts';
import { createProjectileSim, type ProjectileBounds, type ProjectileSim, type ProjectileSimEvent } from './projectileSim.ts';

const BOUNDS: ProjectileBounds = { minX: -5, maxX: 5, minY: 0, maxY: 3.4, minZ: -4, maxZ: 4 };

function stepPair(
  physics: PhysicsWorld,
  sim: ProjectileSim,
  steps: number,
  customerAtCounter = false,
  customerTargetable = true,
): ProjectileSimEvent[] {
  const all: ProjectileSimEvent[] = [];
  for (let i = 0; i < steps; i++) {
    physics.step(FIXED_STEP);
    updateBoundMeshes(physics.alpha);
    all.push(...sim.step(FIXED_STEP, BOUNDS, customerAtCounter, { customerTargetable }));
  }
  return all;
}

async function testCupFloorTableAndBin(): Promise<void> {
  const physics = await createPhysicsWorld();
  const sim = createProjectileSim(physics);
  try {
    physics.addStaticBox({ x: 0, y: -0.25, z: 0 }, { x: 5, y: 0.25, z: 4 }, 'floor');
    physics.addStaticBox({ x: 2, y: 0.385, z: 0 }, { x: 0.9, y: 0.385, z: 0.45 }, 'table');
    physics.addStaticBox({ x: -2, y: 0.265, z: 0 }, { x: 0.23, y: 0.265, z: 0.23 }, 'bin');

    // 1. Ném ly xuống sàn -> vỡ đổ
    sim.spawn({ kind: 'cup', cup: createEmptyCup(), pos: { x: 0, y: 1.2, z: 0 }, vel: { x: 0, y: -3, z: 0 }, power: 3 });
    const floorEvs = stepPair(physics, sim, 40);
    const floorHit = floorEvs.find((e) => e.type === 'hit' && e.target === 'floor');
    assert.ok(floorHit && floorHit.type === 'hit');
    assert.equal(floorHit.consequence.broken, true);
    assert.equal(floorHit.consequence.spawnSpill, true);
    assert.equal(sim.getFlying().length, 0);
    assert.equal(sim.getLanded().length, 0);

    // 2. Ném ly vào bàn nhẹ -> đứng yên, giữ nguyên dữ liệu ly, khóa xoay và nội suy mesh khớp mặt bàn
    const cupData = { ...createEmptyCup(), base: 'matcha' as const, sugar: 50 as const, sealed: true };
    const { item: tableCup } = sim.spawn({
      kind: 'cup',
      cup: cupData,
      pos: { x: 2, y: 1.05, z: 0 },
      vel: { x: 0, y: -1.5, z: 0 },
      power: 3,
      yaw: 0.5,
    });
    const vis = createProjectileVisual('cup', cupData);
    assert.ok(tableCup.body);
    bindMesh(tableCup.body, vis.root, { offset: { x: 0, y: -(CUP_HALF_HEIGHT - 0.07), z: 0 } });

    const tableEvs = stepPair(physics, sim, 45);
    const tableHit = tableEvs.find((e) => e.type === 'hit' && e.target === 'table');
    assert.ok(tableHit && tableHit.type === 'hit' && !tableHit.consequence.broken && tableHit.consequence.restOnSurface);
    assert.ok(tableEvs.some((e) => e.type === 'landed'));
    assert.equal(sim.getLanded().length, 1);
    assert.deepEqual(sim.getLanded()[0].cup, cupData);
    assert.ok(Math.abs(vis.root.position.y - 0.84) < 0.02, `Ly đặt trên bàn 0.77 phải có tâm mesh ~0.84, nhận ${vis.root.position.y}`);
    assert.ok(Math.abs(vis.root.quaternion.x) < 1e-4 && Math.abs(vis.root.quaternion.z) < 1e-4, 'Ly khóa xoay phải đứng thẳng');

    const picked = sim.removeLanded(tableCup.id);
    unbindMesh(vis.root);
    assert.ok(picked && picked.id === tableCup.id);
    assert.equal(tableCup.body.isValid(), false);

    // 3. Ném ly mạnh vào bàn (> CUP_BREAK_POWER) -> vỡ
    sim.spawn({ kind: 'cup', cup: createEmptyCup(), pos: { x: 2, y: 1.4, z: 0 }, vel: { x: 0, y: -9.5, z: 0 }, power: 9.5 });
    const hardEvs = stepPair(physics, sim, 30);
    const hardHit = hardEvs.find((e) => e.type === 'hit' && e.target === 'table');
    assert.ok(hardHit && hardHit.type === 'hit' && hardHit.consequence.broken);

    // 4. Ném ly nhẹ vào thùng rác -> binDiscard
    sim.spawn({ kind: 'cup', cup: createEmptyCup(), pos: { x: -2, y: 0.9, z: 0 }, vel: { x: 0, y: -2, z: 0 }, power: 3 });
    const binEvs = stepPair(physics, sim, 30);
    const binHit = binEvs.find((e) => e.type === 'hit' && e.target === 'bin');
    assert.ok(binHit && binHit.type === 'hit' && binHit.consequence.binDiscard && !binHit.consequence.broken);

    // 5. Chổi rơi xuống sàn -> nảy nhẹ rồi dừng và đăng ký nằm sàn
    const { item: broom } = sim.spawn({ kind: 'broom', pos: { x: 0, y: 1.4, z: 0 }, vel: { x: 1, y: 0, z: 0 }, power: 4 });
    let sawBounce = false;
    let broomLanded = false;
    for (let i = 0; i < 180; i++) {
      const evs = stepPair(physics, sim, 1);
      if (broom.body?.isValid() && broom.body.linvel().y > 0.2) sawBounce = true;
      if (evs.some((e) => e.type === 'landed' && e.item.kind === 'broom')) {
        broomLanded = true;
        break;
      }
    }
    assert.equal(sawBounce, true, 'Chổi rơi xuống sàn phải có nhịp nảy nhẹ');
    assert.equal(broomLanded, true, 'Chổi sau khi nảy phải nằm yên trên sàn');
  } finally {
    sim.dispose();
    physics.dispose();
  }
}

async function testCustomerStaffPlayerAndChair(): Promise<void> {
  const physics = await createPhysicsWorld();
  const sim = createProjectileSim(physics);
  try {
    physics.addStaticBox({ x: 0, y: -0.25, z: 0 }, { x: 5, y: 0.25, z: 4 }, 'floor');
    physics.addDynamicBody({
      type: 'kinematicPosition',
      position: { x: 0, y: 0.78, z: -2 },
      collisionGroups: COLLISION_GROUPS.CUSTOMER,
      activeCollisionTypes: RAPIER.ActiveCollisionTypes.DEFAULT,
      shape: { type: 'box', hx: 0.28, hy: 0.78, hz: 0.28 },
      tag: { kind: 'customer', id: 'cust-1' },
    });
    physics.addDynamicBody({
      type: 'kinematicPosition',
      position: { x: 2, y: 0.66, z: -2 },
      collisionGroups: COLLISION_GROUPS.STAFF,
      activeCollisionTypes: RAPIER.ActiveCollisionTypes.DEFAULT,
      shape: { type: 'box', hx: 0.28, hy: 0.66, hz: 0.28 },
      tag: { kind: 'staff', id: 'na', meta: { staffRole: 'cleaner' } },
    });
    const player = physics.addDynamicBody({
      position: { x: -2.5, y: 0.875, z: 0 },
      gravityScale: 0,
      lockRotations: true,
      collisionGroups: COLLISION_GROUPS.PLAYER,
      shape: { type: 'capsule', halfHeight: PLAYER_HALF_HEIGHT, radius: PLAYER_RADIUS },
      tag: { kind: 'player' },
    });
    const chair = physics.addDynamicBody({
      position: { x: -2, y: 0.3, z: 2.2 },
      mass: CHAIR_MASS,
      friction: CHAIR_FRICTION,
      linearDamping: CHAIR_LINEAR_DAMPING,
      collisionGroups: COLLISION_GROUPS.CHAIR,
      shape: { type: 'box', hx: 0.23, hy: 0.25, hz: 0.23 },
      tag: { kind: 'chair', id: 'chair-1' },
    });

    // 1. Trúng khách -> customerLeaves + broken + reputationDelta < 0
    sim.spawn({ kind: 'cup', cup: createEmptyCup(), pos: { x: 0, y: 0.9, z: -0.9 }, vel: { x: 0, y: 0, z: -8 }, power: 8 });
    const custEvs = stepPair(physics, sim, 20, true, true);
    const custHit = custEvs.find((e) => e.type === 'hit' && e.target === 'customer');
    assert.ok(custHit && custHit.type === 'hit');
    assert.equal(custHit.consequence.customerLeaves, true);
    assert.equal(custHit.consequence.broken, true);
    assert.ok(custHit.consequence.reputationDelta < 0);

    // Khách đang rời đi (customerTargetable=false) không bị ném trúng tiếp
    sim.spawn({ kind: 'broom', pos: { x: 0, y: 0.9, z: -1.1 }, vel: { x: 0, y: 0, z: -6 }, power: 6 });
    const ignoredCustEvs = stepPair(physics, sim, 20, false, false);
    assert.equal(ignoredCustEvs.some((e) => e.type === 'hit' && e.target === 'customer'), false);
    sim.clearAll();

    // 2. Chổi trúng nhân viên -> staffId/staffRole đúng, hitVel giữ hướng bay, chỉ trúng 1 lần rồi rơi xuống sàn nằm yên
    sim.spawn({ kind: 'broom', pos: { x: 2, y: 0.75, z: -3.2 }, vel: { x: 0, y: 0, z: 6 }, power: 6 });
    const staffEvs = stepPair(physics, sim, 90, true, true);
    const staffHits = staffEvs.filter((e) => e.type === 'hit' && e.target === 'staff');
    assert.equal(staffHits.length, 1);
    const sh = staffHits[0];
    assert.ok(sh.type === 'hit' && sh.staffId === 'na' && sh.staffRole === 'cleaner');
    assert.ok(sh.consequence.staffStunSec > 0 && sh.consequence.reputationDelta < 0);
    assert.ok(sh.hitVel.z > 0, 'hitVel phải giữ hướng bay trước khi nảy');
    assert.ok(staffEvs.some((e) => e.type === 'landed'), 'Chổi sau khi trúng nhân viên phải rơi xuống sàn và dừng lại');
    sim.clearAll();

    // 3. Người chơi không bị ly ném trúng
    sim.spawn({ kind: 'cup', cup: createEmptyCup(), pos: { x: -3.6, y: 1.0, z: 0 }, vel: { x: 7, y: 0, z: 0 }, power: 7 });
    const playerEvs = stepPair(physics, sim, 15, false, true);
    assert.equal(playerEvs.some((e) => e.type === 'hit'), false);
    assert.ok(Math.abs(player.translation().x - -2.5) < 1e-5 && Math.abs(player.linvel().x) < 1e-5);
    sim.clearAll();

    // 4. Chổi trúng ghế động -> đẩy ghế nhẹ (ánh xạ target 'table', không lỗi)
    stepPair(physics, sim, 25);
    const chairStartZ = chair.translation().z;
    sim.spawn({ kind: 'broom', pos: { x: -2, y: 0.5, z: 1.3 }, vel: { x: 0, y: 0, z: 9 }, power: 9 });
    const chairEvs = stepPair(physics, sim, 30);
    assert.ok(chairEvs.some((e) => e.type === 'hit' && e.target === 'table'));
    assert.ok(chair.translation().z > chairStartZ + 0.005, 'Chổi trúng ghế phải đẩy ghế nhẹ');
  } finally {
    sim.dispose();
    physics.dispose();
  }
}

async function testSpawnBoundsCapacityAndReset(): Promise<void> {
  const physics = await createPhysicsWorld();
  const sim = createProjectileSim(physics);
  try {
    physics.addStaticBox({ x: 0, y: -0.25, z: 0 }, { x: 5, y: 0.25, z: 4 }, 'floor');
    physics.addStaticBox({ x: 0, y: 1.5, z: -4.1 }, { x: 5.2, y: 1.7, z: 0.1 }, 'wall');
    physics.addStaticBox({ x: 2, y: 0.385, z: 0 }, { x: 1.5, y: 0.385, z: 1.0 }, 'table');

    const safe = sim.computeSafeSpawn({ x: 0, y: 1.5, z: -3.6 }, { x: 0, y: 1.5, z: -4.2 }, 'cup');
    assert.ok(safe.z > -4.0, `computeSafeSpawn phải kéo điểm thả về trước tường, nhận z=${safe.z}`);

    // Ngoài biên -> lost 'bounds'
    sim.spawn({ kind: 'mop', pos: { x: 5.5, y: 1, z: 0 }, vel: { x: 1, y: 0, z: 0 }, power: 4 });
    const oobEvs = stepPair(physics, sim, 2);
    assert.ok(oobEvs.some((e) => e.type === 'lost' && e.reason === 'bounds'));

    // Kẹt quá STUCK_SEC trên vật 'wall' -> lost 'stuck'
    physics.addStaticBox({ x: 0, y: 2.0, z: 0 }, { x: 3.0, y: 0.05, z: 2.5 }, 'wall');
    sim.spawn({ kind: 'broom', pos: { x: 0, y: 2.55, z: 0 }, vel: { x: 0, y: 0, z: 0 }, power: 2 });
    const stuckEvs = stepPair(physics, sim, Math.ceil((STUCK_SEC + 3.0) / FIXED_STEP));
    assert.ok(stuckEvs.some((e) => e.type === 'lost' && e.reason === 'stuck'), 'Kẹt quá STUCK_SEC phải báo lost stuck');
    sim.clearAll();

    // Giới hạn MAX_FLYING
    let capLost = 0;
    for (let i = 0; i < MAX_FLYING + 2; i++) {
      const { lost } = sim.spawn({ kind: 'cup', cup: createEmptyCup(), pos: { x: -3 + i * 0.3, y: 2.5, z: 0 }, vel: { x: 0, y: 0, z: 0 }, power: 2 });
      if (lost?.type === 'lost' && lost.reason === 'capacity') capLost++;
    }
    assert.equal(sim.getFlying().length, MAX_FLYING);
    assert.equal(capLost, 2);
    sim.clearAll();

    // Giới hạn MAX_LANDED
    let evicted = 0;
    for (let i = 0; i < MAX_LANDED + 2; i++) {
      sim.spawn({ kind: 'cup', cup: createEmptyCup(), pos: { x: 1.0 + i * 0.2, y: 0.9, z: 0 }, vel: { x: 0, y: -1, z: 0 }, power: 2 });
      evicted += stepPair(physics, sim, 30).filter((e) => e.type === 'evictedLanded').length;
    }
    assert.equal(sim.getLanded().length, MAX_LANDED);
    assert.equal(evicted, 2);

    // Reset (clearAll) xóa sạch toàn bộ thân đạn bay & nằm
    sim.spawn({ kind: 'broom', pos: { x: 0, y: 2.2, z: 0 }, vel: { x: 0, y: 0, z: 0 }, power: 3 });
    const prevFlying = sim.getFlying()[0];
    const prevLanded = sim.getLanded()[0];
    const cleared = sim.clearAll();
    assert.equal(cleared.flying.length, 1);
    assert.equal(cleared.landed.length, MAX_LANDED);
    assert.equal(sim.getFlying().length, 0);
    assert.equal(sim.getLanded().length, 0);
    assert.equal(prevFlying.body?.isValid(), false);
    assert.equal(prevLanded.body?.isValid(), false);
  } finally {
    sim.dispose();
    physics.dispose();
  }
}

// Tự kiểm tra GĐ9b: ném ly, chổi, cây lau bằng Rapier, va chạm, khóa xoay ly, không trúng người chơi và reset
export async function runSelfCheck9b(): Promise<void> {
  await testCupFloorTableAndBin();
  await testCustomerStaffPlayerAndChair();
  await testSpawnBoundsCapacityAndReset();
  console.log('selfCheck9b passed (Rapier projectile simulation, hits, upright cup, player bypass, reset)');
}
