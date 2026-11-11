import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOrderManager } from '../gameplay/orderManager.ts';
import { createStaffManager } from '../gameplay/staffManager.ts';
import type { AabbBox } from '../player/collision.ts';
import { createCleanlinessStore } from '../state/cleanliness.ts';
import { STAFF_CANDIDATES } from '../state/constants.ts';
import { CAT_BASE_HEIGHT } from '../state/constantsCat.ts';
import { FALL_DOWN_SEC, MAX_STAFF_HITS_PER_DAY, STUN_SEC } from '../state/constantsThrow.ts';
import { createEventBus } from '../state/eventBus.ts';
import type { GameEvents } from '../state/gameState.ts';
import { createInventoryStore } from '../state/inventory.ts';
import { createStaffStore } from '../state/staff.ts';
import { createStaffHitTracker } from '../state/staffStun.ts';
import type { CustomerActor } from './customer.ts';
import type { ShopWorld } from './shopWorld.ts';
import { createStaffActor, getStaffCatVariant } from './staffMember.ts';

function createStubCustomer(): CustomerActor {
  const root = new THREE.Group();
  return {
    root,
    hitbox: null,
    isLeaving: false,
    spawnAt: () => {},
    leaveAlong: () => {},
    update: () => {},
    hide: () => {},
    clearFall: () => {},
  };
}

// Tự kiểm tra GĐ7 Tab 3: biến thể mèo nhân viên, đồng phục, chiều cao hitbox, hoạt ảnh, né vật cản và ngã/biến mất khi bị đuổi
export function runSelfCheck7c(): void {
  // 1. 4 ứng viên cố định ánh xạ đúng 4 biến thể mèo khác nhau theo thứ tự ứng viên
  const expectedIds = ['tabby', 'calico', 'ginger', 'gray'] as const;
  const seenVariants = new Set<string>();
  STAFF_CANDIDATES.forEach((cand, i) => {
    const v = getStaffCatVariant(cand.id);
    assert.equal(v.id, expectedIds[i]);
    seenVariants.add(v.id);
  });
  assert.equal(seenVariants.size, 4);
  assert.equal(getStaffCatVariant('unknown_id').id, 'tabby');

  // 2. Tạo actor cho cả 4 ứng viên: khớp chiều cao hitbox 1.32, có tay cầm dụng cụ/ly và đồng phục
  for (const cand of STAFF_CANDIDATES) {
    const actor = createStaffActor({ ...cand }, [], 1, -2);
    assert.equal(actor.root.position.x, 1);
    assert.equal(actor.root.position.z, -2);

    const rigRoot = actor.root.children[0];
    assert.ok(rigRoot);
    assert.ok(Math.abs(rigRoot.scale.y - 1.32 / CAT_BASE_HEIGHT) < 1e-6);

    actor.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(actor.root);
    const visualHeight = bounds.max.y - bounds.min.y;
    assert.ok(Math.abs(visualHeight - 1.32) < 0.06, `${cand.id} visualHeight=${visualHeight}`);

    const box = actor.hitbox;
    assert.ok(box);
    assert.equal(box.minY, 0);
    assert.equal(box.maxY, 1.32);
    assert.ok(Math.abs(box.maxX - box.minX - 0.56) < 1e-6);

    const handL = actor.root.getObjectByName('handAnchorL');
    assert.ok(handL && handL.children.length > 0, `${cand.id} phải có dụng cụ/ly trên tay`);
  }

  // 3. Kiểm tra di chuyển, né vật cản AABB, giữ nhịp walk khi updateBarista gọi animateWork(false, dt) và idle khi dừng/hết điện
  const obstacle: AabbBox = { minX: -0.35, maxX: 0.35, minZ: -1.1, maxZ: -0.7 };
  const walker = createStaffActor({ ...STAFF_CANDIDATES[2] }, [obstacle], 0, 0);
  const armL = walker.root.getObjectByName('handAnchorL')!.parent!;

  let arrived = false;
  let sawDetour = false;
  for (let i = 0; i < 80; i++) {
    arrived = walker.moveToward(0, -1.8, 0.05);
    if (Math.abs(walker.root.position.x) > 0.05) sawDetour = true;
    if (!arrived) {
      assert.ok(Math.abs(armL.rotation.z - 0.12) < 1e-6, 'Đang đi phải giữ mode walk');
      // Mô phỏng updateBarista gọi animateWork(false, dt) ngay sau moveToward trong cùng frame
      walker.animateWork(false, 0.05);
      assert.ok(Math.abs(armL.rotation.z - 0.12) < 1e-6, 'animateWork(false, dt) không được ghi đè walk cùng frame');
    } else {
      break;
    }
  }
  assert.equal(arrived, true);
  assert.equal(sawDetour, true, 'Phải né vòng qua vật cản AABB');
  assert.ok(Math.abs(armL.rotation.z - 0.1) < 1e-6, 'Đến nơi phải chuyển về idle');

  // Hết điện / đứng chờ gọi animateWork(false, dt) độc lập -> vẫn về idle
  walker.animateWork(true, 0.05);
  assert.ok(Math.abs(armL.rotation.z - 0.16) < 1e-6, 'Đang làm việc phải dùng mode work');
  assert.equal(walker.root.rotation.z, 0, 'animateWork không xoay root.rotation.z');
  walker.animateWork(false, 0.05);
  assert.ok(Math.abs(armL.rotation.z - 0.1) < 1e-6, 'Dừng làm việc phải về mode idle');

  // 4. Ngã và tự nghỉ sau 3 lần ném: ngã rồi biến mất khỏi world.root
  const bus = createEventBus<GameEvents>();
  const staffStore = createStaffStore(bus);
  assert.equal(staffStore.hire('na', 'closed').ok, true);
  assert.equal(staffStore.hire('linh', 'closed').ok, true);

  const worldRoot = new THREE.Group();
  const fakeWorld = { root: worldRoot, colliders: [] as AabbBox[] } as unknown as ShopWorld;
  const cleanliness = createCleanlinessStore(bus);
  const orderManager = createOrderManager(createStubCustomer(), bus, () => 480, () => {}, () => {});
  const inv = createInventoryStore();
  const mgr = createStaffManager(fakeWorld, staffStore, cleanliness, () => {}, orderManager, inv, () => false, bus);

  assert.equal(mgr.getActors().length, 2);
  const naActor = mgr.getActors().find((a) => a.member.id === 'na')!;
  const tracker = createStaffHitTracker(1);

  for (let i = 0; i < MAX_STAFF_HITS_PER_DAY; i++) {
    mgr.stunStaff('cleaner', STUN_SEC, { x: 0, z: 1 });
    tracker.recordHit('na', staffStore, bus);
  }

  // Ngay sau lần ném thứ 3: vẫn còn trong worldRoot để chạy hoạt ảnh ngã và hitbox hạ thấp
  assert.equal(staffStore.isHired('na'), false);
  assert.equal(naActor.root.parent, worldRoot);
  mgr.update(0.1, 'open');
  assert.ok((naActor.hitbox?.maxY ?? 9) < 1.32);

  // Sau khi hết thời gian ngã (FALL_DOWN_SEC + 0.55) -> biến mất khỏi scene, nhân viên còn lại vẫn giữ nguyên
  for (let i = 0; i < Math.ceil((FALL_DOWN_SEC + 0.7) / 0.1); i++) {
    mgr.update(0.1, 'open');
  }
  assert.equal(naActor.root.parent, null);
  assert.equal(mgr.getActors().length, 1);
  assert.equal(mgr.getActors()[0].member.id, 'linh');

  // Kiểm tra resetHome đưa nhân viên về vị trí và tư thế đứng thẳng
  const linhActor = mgr.getActors()[0];
  linhActor.triggerFall(1.5, { x: 1, z: 0 });
  linhActor.updateFall(0.2);
  linhActor.resetHome(-2, -2.5);
  assert.equal(linhActor.root.position.x, -2);
  assert.equal(linhActor.root.position.z, -2.5);
  assert.equal(linhActor.root.position.y, 0);
  assert.equal(linhActor.hitbox?.maxY, 1.32);
}
