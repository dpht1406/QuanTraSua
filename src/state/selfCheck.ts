import assert from 'node:assert/strict';
import {
  CLEANLINESS_PENALTIES,
  CUSTOMER_GAP_NORMAL,
  CUSTOMER_GAP_PEAK,
  CUSTOMERS_PER_DIRTY_TABLE,
  INVENTORY_CONFIG,
  MAX_STAINS,
  SHIFT_REAL_DURATION_SEC,
  STAIN_SPAWN_INTERVAL_SEC,
  TRASH_FULL_CUPS,
} from './constants.ts';
import { calcCleanliness, createCleanlinessStore } from './cleanliness.ts';
import { createEventBus } from './eventBus.ts';
import { createGameStore, DEFAULT_GAME_STATE, type GameEvents } from './gameState.ts';
import { costOf, createInventoryStore } from './inventory.ts';
import {
  DRINK_BASE_LIST,
  generateOrder,
  getOrderPrice,
  LEVEL_PERCENT_LIST,
  TOPPING_LIST,
  type DrinkOrder,
} from './menu.ts';
import {
  applyCupStep,
  consumeCupIngredients,
  createEmptyCup,
  findMissingCupItem,
  scoreDrink,
} from './scoring.ts';
import {
  buildShiftSummary,
  formatGameTime,
  getCustomerGapRange,
  isPeakHour,
  realElapsedToGameMinutes,
  settleWages,
  transitionShift,
} from './shift.ts';
import { buildBaristaCup, createStaffStore } from './staff.ts';
import { runPhase5aSelfCheck } from './selfCheck5a.ts';
import { runPhase5bSelfCheck } from './selfCheck5b.ts';
import { runSelfCheck6 } from './selfCheck6.ts';
import { runSelfCheck7 } from './selfCheck7.ts';
import { runSelfCheck7b } from './selfCheck7b.ts';
import { resolveAabbMove, type AabbBox } from '../player/collision.ts';

// Tự kiểm tra GameState: giá trị mặc định và cập nhật
const store = createGameStore();
assert.deepEqual(store.getState(), DEFAULT_GAME_STATE);

const updated = store.updateState({ money: 650000, day: 2, cleanliness: 92 });
assert.equal(updated.money, 650000);
assert.equal(updated.day, 2);
assert.equal(updated.cleanliness, 92);
assert.equal(updated.time, '08:00');
assert.equal(updated.reputation, 50);

// Tự kiểm tra EventBus: on, emit và off
const bus = createEventBus<{ ping: number }>();
let received = 0;
const onPing = (value: number) => {
  received += value;
};
bus.on('ping', onPing);
bus.emit('ping', 5);
assert.equal(received, 5);
bus.off('ping', onPing);
bus.emit('ping', 10);
assert.equal(received, 5);

// Tự kiểm tra AABB: đi tự do, đâm tường, và trượt dọc tường
const wall: AabbBox = { minX: 2, maxX: 3, minZ: -2, maxZ: 2 };
const radius = 0.3;

const free = resolveAabbMove(0, 0, 1, 0.5, radius, [wall]);
assert.deepEqual(free, { x: 1, z: 0.5 });

const blocked = resolveAabbMove(1.5, 0, 2.2, 0, radius, [wall]);
assert.ok(blocked.x <= wall.minX - radius);
assert.equal(blocked.z, 0);

const slide = resolveAabbMove(1.5, 0, 2.2, 0.8, radius, [wall]);
assert.ok(slide.x <= wall.minX - radius);
assert.equal(slide.z, 0.8);

// Tự kiểm tra generateOrder và tính giá món
for (let i = 0; i < 20; i++) {
  const order = generateOrder();
  assert.ok(DRINK_BASE_LIST.includes(order.base));
  assert.ok(LEVEL_PERCENT_LIST.includes(order.sugar));
  assert.ok(LEVEL_PERCENT_LIST.includes(order.ice));
  assert.ok(TOPPING_LIST.includes(order.topping));
}
assert.equal(getOrderPrice({ base: 'traditional', sugar: 50, ice: 50, topping: 'none' }), 30000);
assert.equal(getOrderPrice({ base: 'matcha', sugar: 100, ice: 50, topping: 'pearl' }), 45000);

// Tự kiểm tra scoreDrink với các trường hợp chấm điểm và làm tròn payout
const sampleOrder: DrinkOrder = { base: 'peach', sugar: 50, ice: 100, topping: 'pearl' };
const baseCup = {
  ...createEmptyCup(),
  base: 'peach' as const,
  sugar: 50 as const,
  ice: 100 as const,
  topping: 'pearl' as const,
  sealed: true,
};
assert.equal(scoreDrink(sampleOrder, baseCup, 30, 60).payout, 40000);
assert.equal(scoreDrink(sampleOrder, { ...baseCup, sugar: 100 }, 20, 60).payout, 32000);
assert.equal(scoreDrink(sampleOrder, { ...baseCup, base: 'traditional' }, 10, 60).payout, 0);
const order35k: DrinkOrder = { base: 'traditional', sugar: 50, ice: 50, topping: 'pearl' };
const lateCup = { ...baseCup, base: 'traditional' as const, ice: 50 as const };
assert.equal(scoreDrink(order35k, lateCup, 51, 60).payout, 32000);
assert.equal(scoreDrink(sampleOrder, baseCup, 60, 60).payout, 0);

// Tự kiểm tra kho nguyên liệu: consume, hết hàng, restock, costOf
const inv = createInventoryStore();
assert.equal(inv.getCount('cup'), INVENTORY_CONFIG.cup.initial);
assert.equal(inv.canConsume('cup', 25), true);
assert.equal(inv.consume('cup', 25), true);
assert.equal(inv.getCount('cup'), 0);
assert.equal(inv.canConsume('cup'), false);
assert.equal(inv.consume('cup'), false);
assert.equal(costOf('cup', 2), 80000);
assert.equal(inv.restock('cup', 1), 20);
assert.equal(inv.getCount('cup'), 20);

// Tự kiểm tra chuyển trạng thái ca làm việc (hợp lệ & không hợp lệ)
let s = transitionShift('closed', 'open');
s = transitionShift(s, 'closing');
s = transitionShift(s, 'summary');
s = transitionShift(s, 'closed');
assert.equal(s, 'closed');
assert.throws(() => transitionShift('closed', 'summary'));
assert.throws(() => transitionShift('summary', 'open'));
assert.throws(() => transitionShift('open', 'closed'));

// Tự kiểm tra quy đổi giờ game, giờ cao điểm và tổng kết lợi nhuận ca
assert.equal(formatGameTime(realElapsedToGameMinutes(0)), '08:00');
assert.equal(formatGameTime(realElapsedToGameMinutes(SHIFT_REAL_DURATION_SEC / 2)), '15:00');
assert.equal(formatGameTime(realElapsedToGameMinutes(SHIFT_REAL_DURATION_SEC)), '22:00');
assert.equal(isPeakHour(11 * 60 + 30), true);
assert.equal(isPeakHour(14 * 60), false);
assert.equal(isPeakHour(18 * 60), true);
assert.deepEqual(getCustomerGapRange(12 * 60), CUSTOMER_GAP_PEAK);
assert.deepEqual(getCustomerGapRange(15 * 60), CUSTOMER_GAP_NORMAL);

const summary = buildShiftSummary({
  revenue: 175000,
  servedCount: 5,
  failedCount: 1,
  totalStars: 22,
  ingredientCost: 65000,
  staffWages: 80000,
});
assert.equal(summary.avgStars, 4.4);
assert.equal(summary.staffWages, 80000);
assert.equal(summary.profit, 30000);
assert.deepEqual(settleWages(50000, 80000), { money: 0, debt: 30000, prevDebtPaid: 0 });
assert.deepEqual(settleWages(200000, 80000), { money: 120000, debt: 0, prevDebtPaid: 0 });

// Bước 0: kiểm tra chỉ trừ nguyên liệu ở lần chọn đầu tiên trên cùng 1 ly
const cupInv = createInventoryStore();
const stepCup = createEmptyCup();
assert.equal(applyCupStep(stepCup, 'base', 'traditional', (it) => cupInv.consume(it)).ok, true);
assert.equal(cupInv.getCount('traditional'), INVENTORY_CONFIG.traditional.initial - 1);
assert.equal(applyCupStep(stepCup, 'base', 'peach', (it) => cupInv.consume(it)).ok, true);
assert.equal(cupInv.getCount('peach'), INVENTORY_CONFIG.peach.initial);
assert.equal(cupInv.getCount('traditional'), INVENTORY_CONFIG.traditional.initial - 1);
assert.equal(applyCupStep(stepCup, 'ice', 0, (it) => cupInv.consume(it)).ok, true);
assert.equal(cupInv.getCount('ice'), INVENTORY_CONFIG.ice.initial);
assert.equal(applyCupStep(stepCup, 'ice', 50, (it) => cupInv.consume(it)).ok, true);
assert.equal(applyCupStep(stepCup, 'ice', 100, (it) => cupInv.consume(it)).ok, true);
assert.equal(applyCupStep(stepCup, 'ice', 0, (it) => cupInv.consume(it)).ok, true);
assert.equal(cupInv.getCount('ice'), INVENTORY_CONFIG.ice.initial - 1);
assert.equal(applyCupStep(stepCup, 'topping', 'pearl', (it) => cupInv.consume(it)).ok, true);
assert.equal(applyCupStep(stepCup, 'topping', 'jelly', (it) => cupInv.consume(it)).ok, true);
assert.equal(cupInv.getCount('pearl'), INVENTORY_CONFIG.pearl.initial - 1);
assert.equal(cupInv.getCount('jelly'), INVENTORY_CONFIG.jelly.initial);

// Phần A: kiểm tra vệ sinh, công thức độ sạch (0..100), sự kiện, thùng rác đầy và max vết bẩn
assert.equal(calcCleanliness([]), 100);
assert.equal(calcCleanliness(Array.from({ length: 10 }, () => ({ kind: 'spill' as const }))), 0);
const gameBus = createEventBus<GameEvents>();
const cleanEvents: Array<{ value: number; delta: number }> = [];
gameBus.on('cleanlinessChanged', (payload) => cleanEvents.push(payload));
const cleanStore = createCleanlinessStore(gameBus, { rng: () => 0.1 });
cleanStore.update(STAIN_SPAWN_INTERVAL_SEC + 1, 'closed');
assert.equal(cleanStore.getStains().length, 0);
cleanStore.update(STAIN_SPAWN_INTERVAL_SEC + 1, 'open');
assert.equal(cleanStore.getStains().length, 1);
const firstStain = cleanStore.getStains()[0];
assert.equal(cleanStore.getCleanliness(), 100 - CLEANLINESS_PENALTIES[firstStain.kind]);
assert.equal(cleanEvents.length, 1);
assert.equal(cleanStore.cleanStain(firstStain.id), true);
assert.equal(cleanStore.getCleanliness(), 100);
for (let i = 0; i < CUSTOMERS_PER_DIRTY_TABLE; i++) cleanStore.recordCustomerServed(100);
assert.equal(cleanStore.getDirtyTableIndices().length, 1);
for (let i = 0; i < TRASH_FULL_CUPS; i++) cleanStore.recordTrashCup();
assert.equal(cleanStore.isTrashFull(), true);
assert.equal(cleanStore.emptyTrash(), true);
assert.equal(cleanStore.isTrashFull(), false);
const capStore = createCleanlinessStore(undefined, {
  floorSlots: Array.from({ length: MAX_STAINS + 3 }, (_, i) => ({ x: i, z: 0 })),
  rng: () => 0,
});
for (let i = 0; i < MAX_STAINS + 3; i++) capStore.spawnFloorStain('spill');
assert.equal(capStore.getStains().length, MAX_STAINS);
assert.equal(capStore.getCleanliness(), 0);

// Phần B: kiểm tra thuê/sa thải nhân viên, giới hạn 2, sự kiện, lỗi pha chế và trừ kho chung
const staffEvents: string[] = [];
gameBus.on('staffHired', ({ staff }) => staffEvents.push(`+${staff.id}`));
gameBus.on('staffFired', ({ staff }) => staffEvents.push(`-${staff.id}`));
const staffStore = createStaffStore(gameBus);
assert.equal(staffStore.hire('na', 'open').ok, false);
assert.equal(staffStore.hire('na', 'closed').ok, true);
assert.equal(staffStore.hire('minh', 'closed').ok, false); // tối đa 1 người mỗi vai trò
assert.equal(staffStore.hire('linh', 'closed').ok, true);
assert.equal(staffStore.hire('chau', 'closed').ok, false);
assert.equal(staffStore.getHired().length, 2);
assert.equal(staffStore.getTotalWage(), 140000);
assert.equal(staffStore.fire('na', 'open').ok, false);
assert.equal(staffStore.fire('na', 'closed').ok, true);
assert.deepEqual(staffEvents, ['+na', '+linh', '-na']);

const baristaOrder: DrinkOrder = { base: 'matcha', sugar: 50, ice: 100, topping: 'pearl' };
const cleanCup = buildBaristaCup(baristaOrder, 0, () => 0);
assert.equal(cleanCup.hadError, false);
assert.equal(scoreDrink(baristaOrder, cleanCup.cup, 10, 60).total, 100);
const errSeq = [0.1, 0.1, 0.9]; // rng() < 0.25 lỗi -> chọn sugar (0.1) -> chọn mức khác (0.9 => 100%)
let errIdx = 0;
const errCup = buildBaristaCup(baristaOrder, 0.25, () => errSeq[errIdx++] ?? 0);
assert.equal(errCup.hadError, true);
assert.equal(errCup.cup.base, 'matcha');
assert.ok(errCup.cup.sugar !== baristaOrder.sugar);
assert.equal(findMissingCupItem(cleanCup.cup, cupInv.getStock()), null);
assert.equal(consumeCupIngredients(cleanCup.cup, (it, q) => cupInv.consume(it, q)), true);
assert.equal(cupInv.getCount('matcha'), INVENTORY_CONFIG.matcha.initial - 1);

runPhase5aSelfCheck();
runPhase5bSelfCheck();
runSelfCheck6();
runSelfCheck7();
runSelfCheck7b();
console.log('Self-check OK: GameState, EventBus, AABB, Menu, Scoring, Inventory, Shift, Cleanliness, Staff, Phase 5a, Phase 5b, Phase 6, Phase 7');
