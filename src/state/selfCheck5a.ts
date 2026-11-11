import assert from 'node:assert/strict';
import {
  COMPLAINT_REP_DELTA,
  COMPLAINT_TIMEOUT_SEC,
  EVENT_FIRST_DELAY_RANGE,
  EVENT_NEXT_DELAY_RANGE,
  MAX_EVENTS_PER_SHIFT,
  MAX_WAGE_DEBT,
  POWER_OUTAGE_DURATION_RANGE,
  REP_DIRTY_CHECK_SEC,
  REP_DIRTY_PENALTY,
  REP_GAP_MAX_MULTIPLIER,
  REP_GAP_MIN_MULTIPLIER,
  REP_GREET_BONUS,
  REP_ORDER_FAILED,
  REP_SERVE_GOOD,
  REP_SERVE_LATE,
  REP_SERVE_LOW_SCORE,
  RUSH_HOUR_DURATION_SEC,
} from './constants.ts';
import { createEventBus } from './eventBus.ts';
import { createRandomEventManager } from './events.ts';
import type { ComplaintChoice, GameEvents, RandomEventType } from './gameState.ts';
import {
  clampReputation,
  createComplaintController,
  createReputationStore,
} from './reputation.ts';
import { buildShiftSummary, calcShopRating, getCustomerGapMultiplier, settleWages } from './shift.ts';
import { createStaffStore } from './staff.ts';

// Tự kiểm tra Giai đoạn 5a: uy tín, phàn nàn, hệ số khách, đánh giá sao, sự kiện ngẫu nhiên, nợ lương, giới hạn vai trò
export function runPhase5aSelfCheck() {
  // 1. Uy tín & kẹp biên 0..100
  assert.equal(clampReputation(-15), 0);
  assert.equal(clampReputation(150), 100);

  const bus = createEventBus<GameEvents>();
  const repEvents: Array<{ value: number; delta: number }> = [];
  bus.on('reputationChanged', ({ value, delta }) => repEvents.push({ value, delta }));
  const rep = createReputationStore(bus, { initialValue: 50 });

  bus.emit('shiftOpened', { day: 1 });
  bus.emit('orderServed', {
    score: { accuracy: 100, timeFactor: 1, total: 100, stars: 5, payout: 40000 },
    elapsed: 15,
    payout: 40000,
  });
  assert.equal(rep.getValue(), 50 + REP_SERVE_GOOD);

  bus.emit('orderServed', {
    score: { accuracy: 40, timeFactor: 0.5, total: 30, stars: 1, payout: 0 },
    elapsed: 50,
    payout: 0,
  });
  assert.equal(rep.getValue(), 50 + REP_SERVE_GOOD - REP_SERVE_LOW_SCORE - REP_SERVE_LATE);

  bus.emit('orderFailed', { reason: 'Hết giờ' });
  assert.equal(
    rep.getValue(),
    50 + REP_SERVE_GOOD - REP_SERVE_LOW_SCORE - REP_SERVE_LATE - REP_ORDER_FAILED,
  );

  const beforeDirty = rep.getValue();
  bus.emit('cleanlinessChanged', { value: 40, delta: -60 });
  assert.equal(rep.getValue(), beforeDirty); // Không trừ ngay khi sự kiện bắn
  rep.update(REP_DIRTY_CHECK_SEC + 0.1, 'open');
  assert.equal(rep.getValue(), beforeDirty - REP_DIRTY_PENALTY);
  bus.emit('cleanlinessChanged', { value: 85, delta: 45 });
  rep.update(REP_DIRTY_CHECK_SEC * 2, 'open');
  assert.equal(rep.getValue(), beforeDirty - REP_DIRTY_PENALTY);

  rep.recordGreet();
  assert.equal(rep.getValue(), beforeDirty - REP_DIRTY_PENALTY + REP_GREET_BONUS);
  assert.equal(rep.adjust(500, 'test max'), 100);
  assert.equal(rep.adjust(-500, 'test min'), 0);
  assert.ok(repEvents.length > 0);

  // 2. Hệ số tần suất khách & đánh giá sao cuối ca
  assert.equal(getCustomerGapMultiplier(0), REP_GAP_MAX_MULTIPLIER);
  assert.equal(getCustomerGapMultiplier(-20), REP_GAP_MAX_MULTIPLIER);
  assert.equal(getCustomerGapMultiplier(50), 1);
  assert.equal(getCustomerGapMultiplier(100), REP_GAP_MIN_MULTIPLIER);
  assert.equal(getCustomerGapMultiplier(150), REP_GAP_MIN_MULTIPLIER);

  assert.equal(calcShopRating(95, 95), 5);
  assert.equal(calcShopRating(50, 100), 4);
  assert.equal(calcShopRating(50, 50), 3);
  assert.equal(calcShopRating(35, 30), 2);
  assert.equal(calcShopRating(10, 10), 1);
  const s5a = buildShiftSummary(
    { revenue: 100000, servedCount: 3, failedCount: 0, totalStars: 14, ingredientCost: 20000, staffWages: 60000 },
    { reputationEnd: 90, cleanlinessEnd: 90, reputationDelta: 8, prevDebtPaid: 10000, wageDebt: 0 },
  );
  assert.equal(s5a.shopRating, 5);
  assert.equal(s5a.reputationDelta, 8);
  assert.equal(s5a.prevDebtPaid, 10000);

  // 3. Logic phàn nàn: 3 lựa chọn + hết giờ = Bỏ qua
  let money = 50000;
  let compRep = 50;
  const choices: ComplaintChoice[] = [];
  bus.on('customerComplained', ({ choice }) => choices.push(choice));
  const comp = createComplaintController(bus, {
    trySpendMoney: (amount) => {
      if (money < amount) return false;
      money -= amount;
      return true;
    },
    adjustReputation: (d) => {
      compRep = clampReputation(compRep + d);
    },
    rng: () => 0.1,
  });
  assert.equal(comp.maybeTrigger(85, 35000, 35000), false);
  assert.equal(comp.maybeTrigger(40, 15000, 30000), true);
  assert.equal(comp.pickDigit(1).ok, true);
  assert.equal(compRep, 50 + COMPLAINT_REP_DELTA.apologize);

  assert.equal(comp.maybeTrigger(40, 20000, 30000), true);
  assert.equal(comp.pickDigit(2).ok, true);
  assert.equal(money, 30000);
  assert.equal(compRep, 50 + COMPLAINT_REP_DELTA.refund);

  money = 5000;
  assert.equal(comp.maybeTrigger(40, 20000, 30000), true);
  assert.equal(comp.pickDigit(2).ok, false); // Không đủ tiền -> giữ popup chờ 1 hoặc 3
  assert.equal(comp.isOpen(), true);
  comp.update(COMPLAINT_TIMEOUT_SEC + 0.1); // Hết giờ = Bỏ qua
  assert.equal(comp.isOpen(), false);
  assert.equal(compRep, 50 + COMPLAINT_REP_DELTA.refund + COMPLAINT_REP_DELTA.ignore);
  assert.deepEqual(choices, ['apologize', 'refund', 'ignore']);

  // 4. Sự kiện ngẫu nhiên: RNG truyền vào, tối đa 2/ca, không chồng nhau, kết thúc đúng lúc
  const started: RandomEventType[] = [];
  const ended: RandomEventType[] = [];
  bus.on('randomEventStarted', ({ type }) => started.push(type));
  bus.on('randomEventEnded', ({ type }) => ended.push(type));

  // rng=0.4 chọn power_outage (index 1 trong 3 loại) trước, sau đó chọn picky hoặc rush
  const evSeq = [0, 0.4, 0.5, 0, 0.99];
  let evIdx = 0;
  const events = createRandomEventManager(bus, () => evSeq[evIdx++] ?? 0.99);
  events.update(EVENT_FIRST_DELAY_RANGE.maxSec + 10, 'closed');
  assert.equal(events.getEventsUsedCount(), 0);

  events.update(EVENT_FIRST_DELAY_RANGE.minSec + 1, 'open');
  assert.equal(events.isPowerOutage(), true);
  assert.equal(events.getEventsUsedCount(), 1);
  events.update(10, 'open'); // Đang có sự kiện -> không chồng thêm sự kiện thứ 2
  assert.equal(events.getEventsUsedCount(), 1);
  const outageDur =
    POWER_OUTAGE_DURATION_RANGE.minSec +
    0.5 * (POWER_OUTAGE_DURATION_RANGE.maxSec - POWER_OUTAGE_DURATION_RANGE.minSec);
  events.update(outageDur, 'open');
  assert.equal(events.isPowerOutage(), false);

  events.update(EVENT_NEXT_DELAY_RANGE.minSec + 1, 'open'); // Sự kiện 2: rush_hour (pool còn picky, rush; rng=0.99 -> rush)
  assert.equal(events.isRushHour(), true);
  assert.equal(events.getCustomerCooldownSpeed(), 2);
  assert.equal(events.getEventsUsedCount(), 2);
  events.update(RUSH_HOUR_DURATION_SEC + 0.1, 'open');
  assert.equal(events.isRushHour(), false);

  events.update(500, 'open'); // Không vượt quá tối đa 2 sự kiện/ca
  assert.equal(events.getEventsUsedCount(), MAX_EVENTS_PER_SHIFT);
  assert.deepEqual(started, ['power_outage', 'rush_hour']);
  assert.deepEqual(ended, ['power_outage', 'rush_hour']);

  // Kiểm tra sự kiện khách khó tính
  const pickyEvents = createRandomEventManager(bus, () => 0);
  pickyEvents.update(EVENT_FIRST_DELAY_RANGE.minSec + 1, 'open');
  assert.equal(pickyEvents.consumePickyForNextCustomer(), true);
  assert.equal(pickyEvents.isPickyOrderActive(), true);
  pickyEvents.finishPickyCustomer();
  assert.equal(pickyEvents.isPickyOrderActive(), false);

  // 5. Nợ lương, trả nợ ca sau, nhân viên nghỉ khi nợ vượt ngưỡng & giới hạn 1 người/vai trò
  const s1 = settleWages(40000, 80000, 0);
  assert.deepEqual(s1, { money: 0, debt: 40000, prevDebtPaid: 0 });
  const s2 = settleWages(100000, 80000, s1.debt);
  assert.deepEqual(s2, { money: 0, debt: 20000, prevDebtPaid: 40000 });
  const s3 = settleWages(150000, 80000, s2.debt);
  assert.deepEqual(s3, { money: 50000, debt: 0, prevDebtPaid: 20000 });

  const debtStaff = createStaffStore(bus);
  assert.equal(debtStaff.hire('na', 'closed').ok, true); // 60k
  assert.equal(debtStaff.hire('minh', 'closed').ok, false); // Trùng vai trò cleaner
  assert.equal(debtStaff.hire('chau', 'closed').ok, true); // 120k
  const firedLogs: Array<{ id: string; reason?: string }> = [];
  bus.on('staffFired', ({ staff, reason }) => firedLogs.push({ id: staff.id, reason }));
  const overDebt = settleWages(0, debtStaff.getTotalWage(), 0);
  assert.ok(overDebt.debt > MAX_WAGE_DEBT);
  const quit = debtStaff.quitHighestPaid('Nợ lương vượt ngưỡng');
  assert.equal(quit?.id, 'chau');
  assert.equal(debtStaff.getHired().length, 1);
  assert.deepEqual(firedLogs, [{ id: 'chau', reason: 'Nợ lương vượt ngưỡng' }]);
}
