import assert from 'node:assert/strict';
import { discardCupInBin } from '../gameplay/cupDisposal.ts';
import { createCleanlinessStore } from './cleanliness.ts';
import { INVENTORY_CONFIG } from './constants.ts';
import {
  CUP_BREAK_POWER,
  DROP_POWER,
  MAX_STAFF_HITS_PER_DAY,
  STUN_SEC,
} from './constantsThrow.ts';
import { createEventBus } from './eventBus.ts';
import type { GameEvents } from './gameState.ts';
import { createInventoryStore } from './inventory.ts';
import { applyCupStep, createEmptyCup } from './scoring.ts';
import { createStaffStore } from './staff.ts';
import { createStaffHitTracker } from './staffStun.ts';
import { resolveThrow } from './throwConsequence.ts';

// Tự kiểm tra GĐ6c: hậu quả ném từng mục tiêu, bỏ ly không hoàn, choáng/nghỉ nhân viên theo ngày và giới hạn vật bay/nằm
export function runSelfCheck6c(): void {
  // 1. Hậu quả cho từng mục tiêu: khách, nhân viên, thùng rác, sàn, tường, bàn/quầy
  const hitCustCup = resolveThrow({ kind: 'cup', target: 'customer', power: 3, customerAtCounter: true });
  assert.equal(hitCustCup.broken, true);
  assert.equal(hitCustCup.spawnSpill, true);
  assert.equal(hitCustCup.customerLeaves, true);
  assert.ok(hitCustCup.reputationDelta < 0);

  const hitCustBroom = resolveThrow({ kind: 'broom', target: 'customer', power: 5, customerAtCounter: false });
  assert.equal(hitCustBroom.broken, false);
  assert.equal(hitCustBroom.spawnSpill, false);
  assert.equal(hitCustBroom.customerLeaves, true);
  assert.ok(hitCustBroom.reputationDelta < 0);

  // Trừ uy tín nhân viên chỉ khi có khách ở quầy
  const hitStaffWithCust = resolveThrow({ kind: 'mop', target: 'staff', power: 5, customerAtCounter: true });
  assert.equal(hitStaffWithCust.staffStunSec, STUN_SEC);
  assert.ok(hitStaffWithCust.reputationDelta < 0);

  const hitStaffAlone = resolveThrow({ kind: 'mop', target: 'staff', power: 5, customerAtCounter: false });
  assert.equal(hitStaffAlone.staffStunSec, STUN_SEC);
  assert.equal(hitStaffAlone.reputationDelta, 0);

  const hitStaffHardCup = resolveThrow({
    kind: 'cup',
    target: 'staff',
    power: CUP_BREAK_POWER + 1,
    customerAtCounter: false,
  });
  assert.equal(hitStaffHardCup.broken, true);
  assert.equal(hitStaffHardCup.spawnSpill, true);
  assert.equal(hitStaffHardCup.staffStunSec, STUN_SEC);

  // Thùng rác: ly nhẹ -> bỏ ly vào thùng; ly quá mạnh -> vỡ đổ; dụng cụ -> không bỏ
  const binCupLight = resolveThrow({ kind: 'cup', target: 'bin', power: 5, customerAtCounter: false });
  assert.equal(binCupLight.binDiscard, true);
  assert.equal(binCupLight.broken, false);

  const binCupHard = resolveThrow({
    kind: 'cup',
    target: 'bin',
    power: CUP_BREAK_POWER + 1,
    customerAtCounter: false,
  });
  assert.equal(binCupHard.binDiscard, false);
  assert.equal(binCupHard.broken, true);
  assert.equal(binCupHard.spawnSpill, true);

  const binBroom = resolveThrow({ kind: 'broom', target: 'bin', power: 5, customerAtCounter: false });
  assert.equal(binBroom.binDiscard, false);
  assert.equal(binBroom.broken, false);

  // Sàn & tường: ly luôn vỡ/đổ (kể cả thả nhẹ); chổi/cây lau nằm lại trên sàn
  const floorCupDrop = resolveThrow({ kind: 'cup', target: 'floor', power: DROP_POWER, customerAtCounter: false });
  assert.equal(floorCupDrop.broken, true);
  assert.equal(floorCupDrop.spawnSpill, true);
  assert.equal(floorCupDrop.restOnSurface, false);

  const floorMop = resolveThrow({ kind: 'mop', target: 'floor', power: 4, customerAtCounter: false });
  assert.equal(floorMop.broken, false);
  assert.equal(floorMop.restOnSurface, true);

  const wallCup = resolveThrow({ kind: 'cup', target: 'wall', power: 4, customerAtCounter: false });
  assert.equal(wallCup.broken, true);
  assert.equal(wallCup.spawnSpill, true);

  const wallBroom = resolveThrow({ kind: 'broom', target: 'wall', power: 6, customerAtCounter: false });
  assert.equal(wallBroom.broken, false);
  assert.equal(wallBroom.restOnSurface, false);

  // Bàn/quầy: ly nhẹ đứng yên, ly quá mạnh vỡ
  for (const surface of ['table', 'counter'] as const) {
    const lightCup = resolveThrow({ kind: 'cup', target: surface, power: CUP_BREAK_POWER, customerAtCounter: false });
    assert.equal(lightCup.broken, false);
    assert.equal(lightCup.restOnSurface, true);

    const hardCup = resolveThrow({
      kind: 'cup',
      target: surface,
      power: CUP_BREAK_POWER + 0.5,
      customerAtCounter: false,
    });
    assert.equal(hardCup.broken, true);
    assert.equal(hardCup.spawnSpill, true);
    assert.equal(hardCup.restOnSurface, false);
  }

  // 2. Bỏ ly cách 1 (ném vỡ / ném vào thùng rác): không hoàn nguyên liệu đã tiêu hao
  const inv = createInventoryStore();
  assert.equal(inv.consume('cup'), true);
  const brokenCup = createEmptyCup();
  assert.equal(applyCupStep(brokenCup, 'base', 'traditional', (it) => inv.consume(it)).ok, true);
  assert.equal(applyCupStep(brokenCup, 'sugar', 50, (it) => inv.consume(it)).ok, true);
  const cleanStore = createCleanlinessStore(undefined, { rng: () => 0.99 });
  const binRes = discardCupInBin(brokenCup, {
    cleanliness: cleanStore,
    onTrashChanged: () => {},
    notify: () => {},
  });
  assert.equal(binRes.ok, true);
  assert.equal(cleanStore.getTrashCups(), 1);
  assert.equal(inv.getCount('cup'), INVENTORY_CONFIG.cup.initial - 1);
  assert.equal(inv.getCount('traditional'), INVENTORY_CONFIG.traditional.initial - 1);
  assert.equal(inv.getCount('sugar'), INVENTORY_CONFIG.sugar.initial - 1);

  // 3. Đếm lượt trúng nhân viên mỗi ngày, cho nghỉ khi đủ MAX_STAFF_HITS_PER_DAY và reset qua ngày
  const bus = createEventBus<GameEvents>();
  const firedLog: Array<{ id: string; reason?: string }> = [];
  bus.on('staffFired', ({ staff, reason }) => firedLog.push({ id: staff.id, reason }));

  const staffStore = createStaffStore(bus);
  assert.equal(staffStore.hire('na', 'closed').ok, true);
  assert.equal(staffStore.hire('linh', 'closed').ok, true);

  const tracker = createStaffHitTracker(1);
  for (let i = 1; i < MAX_STAFF_HITS_PER_DAY; i++) {
    const res = tracker.recordHit('na', staffStore, bus);
    assert.equal(res.hitsToday, i);
    assert.equal(res.fired, false);
  }
  assert.equal(staffStore.isHired('na'), true);
  const finalNa = tracker.recordHit('na', staffStore, bus);
  assert.equal(finalNa.fired, true);
  assert.equal(staffStore.isHired('na'), false);
  assert.equal(staffStore.isHired('linh'), true);
  assert.deepEqual(firedLog, [{ id: 'na', reason: 'bi_nem_nhieu_lan' }]);

  // Trúng 'linh' ít hơn ngưỡng trong ngày 1 rồi sang ngày 2 -> đếm reset về 0
  for (let i = 0; i < MAX_STAFF_HITS_PER_DAY - 1; i++) {
    assert.equal(tracker.recordHit('linh', staffStore, bus).fired, false);
  }
  assert.equal(tracker.getHits('linh'), MAX_STAFF_HITS_PER_DAY - 1);
  assert.equal(tracker.syncDay(2), true);
  assert.equal(tracker.getHits('linh'), 0);
  for (let i = 1; i < MAX_STAFF_HITS_PER_DAY; i++) {
    assert.equal(tracker.recordHit('linh', staffStore, bus).fired, false);
  }
  assert.equal(tracker.recordHit('linh', staffStore, bus).fired, true);
  assert.equal(staffStore.isHired('linh'), false);
  assert.equal(firedLog[1].id, 'linh');
  assert.equal(firedLog[1].reason, 'bi_nem_nhieu_lan');
}
