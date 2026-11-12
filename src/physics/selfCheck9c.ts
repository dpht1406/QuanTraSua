import assert from 'node:assert/strict';
import { STAFF_CANDIDATES } from '../state/constants.ts';
import { FALL_DOWN_SEC, STUN_SEC } from '../state/constantsThrow.ts';
import { createCustomerActor } from '../world/customer.ts';
import { createShopWorld } from '../world/shopWorld.ts';
import { createStaffActor } from '../world/staffMember.ts';
import { createActorBodies, setCustomerKinematic } from './actorBodies.ts';
import { buildStaticWorld } from './buildStaticWorld.ts';
import { COLLISION_GROUPS, canCollide } from './collisionGroups.ts';
import {
  CUSTOMER_COLLIDER_HALF_W,
  CUSTOMER_COLLIDER_HEIGHT,
  FIXED_STEP,
  PLAYER_HALF_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_MASS,
  PLAYER_RADIUS,
  STAFF_COLLIDER_HALF_W,
  STAFF_COLLIDER_HEIGHT,
} from './constantsPhysics.ts';
import { createFurnitureBodies } from './furnitureBodies.ts';
import { updateBoundMeshes } from './physicsSync.ts';
import { createPhysicsWorld } from './physicsWorld.ts';

function stepN(physics: Awaited<ReturnType<typeof createPhysicsWorld>>, n: number): void {
  for (let i = 0; i < n; i++) physics.step(FIXED_STEP);
}

async function testDynamicChairsAndReset(): Promise<void> {
  const physics = await createPhysicsWorld();
  const world = createShopWorld(() => {});
  buildStaticWorld(physics, world.colliders);
  const furniture = createFurnitureBodies(physics, world);

  try {
    const bodies = furniture.getChairBodies();
    assert.equal(bodies.length, 8, 'Quán có 4 bàn = 8 ghế động');

    // 1. Ghế đứng yên vững khi mới tạo (không tự trôi hay lật) và tự ngủ sau khi đứng yên
    const initialPositions = bodies.map((b) => ({ ...b.translation() }));
    stepN(physics, 180);
    updateBoundMeshes(1);

    bodies.forEach((b, i) => {
      const p = b.translation();
      const init = initialPositions[i];
      assert.ok(Math.hypot(p.x - init.x, p.y - init.y, p.z - init.z) < 1e-3, `Ghế ${i} bị tự trôi`);
      assert.equal(b.isSleeping(), true, `Ghế ${i} đứng yên phải tự ngủ`);
      const m = world.chairs[i].mesh.position;
      assert.ok(Math.hypot(m.x - init.x, m.y - init.y, m.z - init.z) < 1e-3);
    });

    // 2. Bị thân PLAYER đẩy thì ghế di chuyển và mesh nội suy theo
    const targetChair = bodies[0];
    const init0 = initialPositions[0];
    const player = physics.addDynamicBody({
      type: 'dynamic',
      position: { x: init0.x, y: PLAYER_HEIGHT * 0.5, z: init0.z + 0.7 },
      linvel: { x: 0, y: 0, z: -3.2 },
      mass: PLAYER_MASS,
      gravityScale: 0,
      lockRotations: true,
      friction: 0,
      collisionGroups: COLLISION_GROUPS.PLAYER,
      shape: { type: 'capsule', halfHeight: PLAYER_HALF_HEIGHT, radius: PLAYER_RADIUS },
      tag: { kind: 'player' },
    });

    for (let i = 0; i < 30; i++) {
      player.setLinvel({ x: 0, y: 0, z: -3.2 }, true);
      physics.step(FIXED_STEP);
    }
    updateBoundMeshes(1);

    const movedPos = targetChair.translation();
    assert.ok(movedPos.z < init0.z - 0.15, `Ghế phải dịch chuyển khi bị đẩy, z=${movedPos.z} vs ${init0.z}`);
    assert.ok(Math.abs(world.chairs[0].mesh.position.z - movedPos.z) < 1e-3);
    physics.removeBody(player.handle);
    stepN(physics, 180);
    assert.equal(targetChair.isSleeping(), true, 'Ghế sau khi bị đẩy dừng lại phải tự ngủ');

    // 3. resetChairs() đưa ghế về đúng vị trí, góc quay ban đầu và vận tốc = 0
    furniture.resetChairs();
    const resetPos = targetChair.translation();
    const vel = targetChair.linvel();
    const ang = targetChair.angvel();
    assert.ok(Math.hypot(resetPos.x - init0.x, resetPos.y - init0.y, resetPos.z - init0.z) < 1e-6);
    assert.ok(Math.hypot(vel.x, vel.y, vel.z) < 1e-6);
    assert.ok(Math.hypot(ang.x, ang.y, ang.z) < 1e-6);
    assert.ok(Math.hypot(world.chairs[0].mesh.position.x - init0.x, world.chairs[0].mesh.position.z - init0.z) < 1e-6);

    // 4. Tự động reset khi ghế rơi quá thấp / ra ngoài ranh giới hoặc lật úp lâu
    targetChair.setTranslation({ x: init0.x, y: -2.0, z: init0.z }, true);
    furniture.update(0.3);
    assert.ok(Math.abs(targetChair.translation().y - init0.y) < 1e-4, 'Ghế rơi y<-1 phải tự reset');

    targetChair.setRotation({ x: 1, y: 0, z: 0, w: 0 }, false);
    targetChair.setLinvel({ x: 0, y: 0, z: 0 }, false);
    for (let i = 0; i < 8; i++) furniture.update(0.3);
    const rotAfterFlipReset = targetChair.rotation();
    const upY = 1 - 2 * (rotAfterFlipReset.x ** 2 + rotAfterFlipReset.z ** 2);
    assert.ok(upY > 0.99, `Ghế lật úp lâu phải tự quay về tư thế đứng, upY=${upY}`);
  } finally {
    furniture.dispose();
    physics.dispose();
  }
}

async function testCustomerAndStaffActors(): Promise<void> {
  assert.equal(canCollide(COLLISION_GROUPS.CUSTOMER, COLLISION_GROUPS.PLAYER), false);
  assert.equal(canCollide(COLLISION_GROUPS.CUSTOMER, COLLISION_GROUPS.STAFF), false);
  assert.equal(canCollide(COLLISION_GROUPS.CUSTOMER, COLLISION_GROUPS.PROJECTILE), true);
  assert.equal(canCollide(COLLISION_GROUPS.STAFF, COLLISION_GROUPS.CHAIR), true);

  const physics = await createPhysicsWorld();
  const world = createShopWorld(() => {});
  buildStaticWorld(physics, world.colliders);
  const furniture = createFurnitureBodies(physics, world);
  const actors = createActorBodies(physics);

  try {
    const customer = createCustomerActor();
    customer.spawnAt([{ x: 0, z: 0 }], () => {});

    const staff = createStaffActor({ ...STAFF_CANDIDATES[0] }, world.colliders, 1.0, 1.0);
    actors.sync(customer, [staff]);
    stepN(physics, 1);

    // 1. Khớp kích thước hitbox đứng: khách 1.56, nhân viên 1.32
    const custBody = actors.getCustomerBody()!;
    const staffBody = actors.getStaffBody(staff.member.id)!;
    assert.ok(custBody && staffBody);

    const custHe = custBody.collider(0).halfExtents()!;
    assert.ok(Math.abs(custHe.x - CUSTOMER_COLLIDER_HALF_W) < 1e-4);
    assert.ok(Math.abs(custHe.y * 2 - CUSTOMER_COLLIDER_HEIGHT) < 1e-4);
    const custRayHigh = physics.raycast({ x: -1, y: 1.45, z: 0 }, { x: 1, y: 0, z: 0 }, 3);
    assert.ok(custRayHigh && custRayHigh.tag.kind === 'customer');
    const custRayOver = physics.raycast({ x: -1, y: 1.65, z: 0 }, { x: 1, y: 0, z: 0 }, 3);
    assert.equal(custRayOver, null);

    const staffHe = staffBody.collider(0).halfExtents()!;
    assert.ok(Math.abs(staffHe.x - STAFF_COLLIDER_HALF_W) < 1e-4);
    assert.ok(Math.abs(staffHe.y * 2 - STAFF_COLLIDER_HEIGHT) < 1e-4);

    // 2. CUSTOMER không va chạm PLAYER
    const contacts: string[] = [];
    const unsub = physics.onContact((a, b) => contacts.push(`${a.kind}-${b.kind}`));
    const player = physics.addDynamicBody({
      type: 'dynamic',
      position: { x: -1.0, y: PLAYER_HEIGHT * 0.5, z: 0 },
      linvel: { x: 5.0, y: 0, z: 0 },
      gravityScale: 0,
      lockRotations: true,
      collisionGroups: COLLISION_GROUPS.PLAYER,
      shape: { type: 'capsule', halfHeight: PLAYER_HALF_HEIGHT, radius: PLAYER_RADIUS },
      tag: { kind: 'player' },
    });
    for (let i = 0; i < 30; i++) {
      player.setLinvel({ x: 5.0, y: 0, z: 0 }, true);
      physics.step(FIXED_STEP);
    }
    assert.ok(player.translation().x > 0.8, 'PLAYER phải đi xuyên qua CUSTOMER không bị chặn');
    assert.equal(contacts.some((c) => c.includes('customer')), false, 'CUSTOMER không được sinh va chạm với PLAYER');
    unsub();
    physics.removeBody(player.handle);

    // 3. Nhân viên kinematic đẩy được ghế khi đi qua mà không bị kẹt
    const chairBody = furniture.getChairBodies()[0];
    const chairInit = { ...chairBody.translation() };
    staff.resetHome(chairInit.x, chairInit.z + 0.65);
    actors.sync(customer, [staff]);
    stepN(physics, 1);

    for (let i = 0; i < 50; i++) {
      staff.moveToward(chairInit.x, chairInit.z - 0.65, FIXED_STEP);
      actors.sync(customer, [staff]);
      physics.step(FIXED_STEP);
    }
    assert.ok(staff.root.position.z < chairInit.z, 'Nhân viên không được bị kẹt bởi ghế');
    assert.ok(
      Math.hypot(chairBody.translation().x - chairInit.x, chairBody.translation().z - chairInit.z) > 0.2,
      'Ghế phải bị nhân viên đẩy dịch đi',
    );

    // 4. Projectile trúng hitbox CUSTOMER và STAFF (đồng thời CUSTOMER không đẩy ghế)
    const projContacts: Array<{ kind: string; id: unknown }> = [];
    const unsubProj = physics.onContact((a, b) => {
      if (a.kind === 'projectile' && (b.kind === 'customer' || b.kind === 'staff')) {
        projContacts.push({ kind: b.kind, id: b.id });
      } else if (b.kind === 'projectile' && (a.kind === 'customer' || a.kind === 'staff')) {
        projContacts.push({ kind: a.kind, id: a.id });
      }
    });
    const projToCust = physics.addDynamicBody({
      position: { x: -0.9, y: 1.0, z: 0 },
      linvel: { x: 8, y: 0, z: 0 },
      gravityScale: 0,
      ccdEnabled: true,
      collisionGroups: COLLISION_GROUPS.PROJECTILE,
      shape: { type: 'ball', radius: 0.08 },
      tag: { kind: 'projectile', id: 'p-cust' },
    });
    const staffPosNow = staffBody.translation();
    const projToStaff = physics.addDynamicBody({
      position: { x: staffPosNow.x - 0.9, y: 0.8, z: staffPosNow.z },
      linvel: { x: 8, y: 0, z: 0 },
      gravityScale: 0,
      ccdEnabled: true,
      collisionGroups: COLLISION_GROUPS.PROJECTILE,
      shape: { type: 'ball', radius: 0.08 },
      tag: { kind: 'projectile', id: 'p-staff' },
    });
    stepN(physics, 20);
    unsubProj();
    physics.removeBody(projToCust.handle);
    physics.removeBody(projToStaff.handle);
    assert.ok(projContacts.some((h) => h.kind === 'customer' && h.id === 'customer'), 'Projectile phải trúng hitbox CUSTOMER');
    assert.ok(projContacts.some((h) => h.kind === 'staff' && h.id === staff.member.id), 'Projectile phải trúng hitbox STAFF');

    // 5. Hitbox hạ thấp khi khách và nhân viên ngã/nằm (theo computeFallHitbox)
    customer.leaveAlong([{ x: 0, z: 2 }], () => {}, { fall: true, hitDir: { x: 0, z: 1 } });
    customer.update(FALL_DOWN_SEC + 0.1);
    staff.triggerFall(STUN_SEC, { x: 1, z: 0 });
    staff.updateFall(FALL_DOWN_SEC + 0.1);
    actors.sync(customer, [staff]);
    stepN(physics, 1);

    const custLieHe = custBody.collider(0).halfExtents()!;
    const staffLieHe = staffBody.collider(0).halfExtents()!;
    assert.ok(custLieHe.y * 2 < 0.6, `Hitbox khách khi nằm phải thấp < 0.6, nhận ${custLieHe.y * 2}`);
    assert.ok(staffLieHe.y * 2 < 0.6, `Hitbox nhân viên khi nằm phải thấp < 0.6, nhận ${staffLieHe.y * 2}`);
    assert.equal(physics.raycast({ x: -1, y: 1.2, z: 0 }, { x: 1, y: 0, z: 0 }, 3), null, 'Raycast cao 1.2m phải trượt qua khách đang nằm');

    // 6. Chuyển đổi thân khách kinematic <-> dynamic cho GĐ9c sau này
    setCustomerKinematic(custBody, false);
    assert.equal(custBody.isDynamic(), true);
    setCustomerKinematic(custBody, true);
    assert.equal(custBody.isKinematic(), true);

    // 7. Dọn sạch thân vật lý khi khách/nhân viên biến mất
    const bodiesBeforeHide = physics.world.bodies.len();
    customer.hide();
    actors.sync(customer, []);
    assert.equal(actors.getCustomerBody(), null);
    assert.equal(actors.getStaffBody(staff.member.id), null);
    assert.equal(physics.world.bodies.len(), bodiesBeforeHide - 2);
  } finally {
    actors.dispose();
    furniture.dispose();
    physics.dispose();
  }
}

// Tự kiểm tra GĐ9c: ghế động, resetChairs, thân kinematic nhân viên/khách và va chạm hitbox
export async function runSelfCheck9c(): Promise<void> {
  await testDynamicChairsAndReset();
  await testCustomerAndStaffActors();
  console.log('selfCheck9c passed (dynamic chairs, resetChairs, kinematic staff/customer hitboxes)');
}
