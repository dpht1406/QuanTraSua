import assert from 'node:assert/strict';
import { INVENTORY_CONFIG } from './constants.ts';
import {
  CONTAM_PER_POUR,
  CONTAM_THRESHOLD,
  MAX_COMPLAINT_BONUS,
  POUR_BACK_REFUND_RATIO,
  POUR_BACK_REP_PENALTY,
  SPOIL_RATIO,
  SPOIL_THRESHOLD,
} from './constantsContam.ts';
import {
  calcCupComplaintBonus,
  getContaminatedOverThreshold,
  performPourBack,
  pourBack,
  spoilContaminatedStock,
} from './contamination.ts';
import { createEventBus } from './eventBus.ts';
import type { GameEvents } from './gameState.ts';
import { createInventoryStore, purchaseRestockCart, type InventoryItem } from './inventory.ts';
import { createComplaintController } from './reputation.ts';
import { applyCupStep, createEmptyCup } from './scoring.ts';

// Tự kiểm tra GĐ6d: đổ ngược cách 2, hoàn một phần, nhiễm, phàn nàn, hỏng cuối ca và pha loãng nhập hàng
export function runSelfCheck6d(): void {
  const bus = createEventBus<GameEvents>();
  const contamEvents: Array<{ item: InventoryItem; level: number }> = [];
  const spoilEvents: Array<{ item: InventoryItem; lost: number }> = [];
  bus.on('ingredientContaminated', (p) => contamEvents.push(p));
  bus.on('ingredientSpoiled', (p) => spoilEvents.push(p));

  const inv = createInventoryStore();
  const cup = createEmptyCup();

  // 1. Pha trà đào + đường 50% rồi đổ ngược trà đào khi chưa có khách
  const startPeach = inv.getCount('peach');
  assert.equal(applyCupStep(cup, 'base', 'peach', (it) => inv.consume(it)).ok, true);
  assert.equal(applyCupStep(cup, 'sugar', 50, (it) => inv.consume(it)).ok, true);
  assert.equal(inv.getCount('peach'), startPeach - 1);

  const noCust = performPourBack(cup, 'tea', inv, false, bus);
  assert.equal(noCust.pour.ok, true);
  assert.equal(noCust.reputationDelta, 0);
  assert.equal(cup.base, null);
  assert.equal(cup.sugar, 50);
  assert.equal(cup.charged?.base, undefined);
  assert.equal(cup.charged?.sugar, true);
  assert.equal(inv.getCount('peach'), startPeach - 1 + POUR_BACK_REFUND_RATIO);
  assert.equal(inv.getContaminationOf('peach'), CONTAM_PER_POUR);
  assert.deepEqual(contamEvents[0], { item: 'peach', level: CONTAM_PER_POUR });

  // Làm lại bước trà nền sau khi đổ ngược phải trừ lại nguyên liệu trong kho
  const startTrad = inv.getCount('traditional');
  assert.equal(applyCupStep(cup, 'base', 'traditional', (it) => inv.consume(it)).ok, true);
  assert.equal(inv.getCount('traditional'), startTrad - 1);

  // 2. Có khách ở quầy -> trừ uy tín; ly chưa có bước / 0% / đã đậy nắp -> từ chối
  assert.equal(pourBack(cup, 'ice', inv, bus).ok, false);
  assert.equal(applyCupStep(cup, 'ice', 0, (it) => inv.consume(it)).ok, true);
  assert.equal(pourBack(cup, 'ice', inv, bus).ok, false);

  const withCust = performPourBack(cup, 'sugar', inv, true, bus);
  assert.equal(withCust.pour.ok, true);
  assert.equal(withCust.reputationDelta, -POUR_BACK_REP_PENALTY);
  assert.equal(inv.getContaminationOf('sugar'), CONTAM_PER_POUR);

  cup.sealed = true;
  assert.equal(pourBack(cup, 'tea', inv, bus).ok, false);

  // Độ nhiễm kẹp tối đa 100
  inv.setContamination('matcha', 90);
  const matchaCup = createEmptyCup();
  applyCupStep(matchaCup, 'base', 'matcha', (it) => inv.consume(it));
  const clampedPour = pourBack(matchaCup, 'tea', inv, bus);
  assert.equal(clampedPour.ok, true);
  assert.equal(inv.getContaminationOf('matcha'), 100);

  // 3. Bonus phàn nàn = 0 khi <= ngưỡng, tăng tuyến tính tới MAX_COMPLAINT_BONUS khi > ngưỡng
  const cleanCup = {
    ...createEmptyCup(),
    base: 'traditional' as const,
    sugar: 50 as const,
    ice: 50 as const,
    topping: 'none' as const,
    sealed: true,
  };
  inv.restoreContamination({ traditional: CONTAM_THRESHOLD, sugar: 10, ice: 0, peach: 100 });
  assert.equal(calcCupComplaintBonus(cleanCup, inv.getContamination()), 0);

  const midLevel = CONTAM_THRESHOLD + (100 - CONTAM_THRESHOLD) / 2;
  inv.setContamination('traditional', midLevel);
  const midBonus = calcCupComplaintBonus(cleanCup, inv.getContamination());
  assert.ok(Math.abs(midBonus - MAX_COMPLAINT_BONUS / 2) < 1e-6);

  inv.setContamination('traditional', 100);
  assert.equal(calcCupComplaintBonus(cleanCup, inv.getContamination()), MAX_COMPLAINT_BONUS);

  // Tích hợp với createComplaintController: điểm cao vẫn có thể phàn nàn nhờ bonus
  let rngVal = 0.4;
  const comp = createComplaintController(bus, {
    trySpendMoney: () => true,
    adjustReputation: () => {},
    rng: () => rngVal,
  });
  assert.equal(comp.maybeTrigger(95, 30000, 30000, MAX_COMPLAINT_BONUS), true);
  comp.clear();
  rngVal = 0.6;
  assert.equal(comp.maybeTrigger(95, 30000, 30000, MAX_COMPLAINT_BONUS), false);

  // 4. Hỏng cuối ca đúng tỉ lệ cho mặt hàng >= SPOIL_THRESHOLD, không đặt lại độ nhiễm về 0
  const spoilInv = createInventoryStore({
    ...inv.getStock(),
    traditional: 20,
    peach: 12,
    matcha: 0,
  });
  spoilInv.restoreContamination({
    traditional: SPOIL_THRESHOLD,
    peach: SPOIL_THRESHOLD - 1,
    matcha: 100,
  });
  spoilEvents.length = 0;
  const spoiled = spoilContaminatedStock(spoilInv, bus);
  const expectedLost = Math.round(20 * SPOIL_RATIO);
  assert.equal(spoiled.length, 1);
  assert.deepEqual(spoilEvents, [{ item: 'traditional', lost: expectedLost }]);
  assert.equal(spoilInv.getCount('traditional'), 20 - expectedLost);
  assert.equal(spoilInv.getCount('peach'), 12);
  assert.equal(spoilInv.getContaminationOf('traditional'), SPOIL_THRESHOLD);

  // 5. Pha loãng khi nhập hàng (tồn > 0 và tồn = 0)
  const restockInv = createInventoryStore({ ...inv.getStock(), peach: 10, matcha: 0, sugar: 10 });
  restockInv.restoreContamination({ peach: 60, matcha: 80, sugar: 45 });
  const peachAdded = INVENTORY_CONFIG.peach.packSize;
  const failBuy = purchaseRestockCart(restockInv, { peach: 1 }, 0);
  assert.equal(failBuy.ok, false);
  assert.equal(restockInv.getContaminationOf('peach'), 60);

  const okBuy = purchaseRestockCart(restockInv, { peach: 1, matcha: 1 }, 1_000_000);
  assert.equal(okBuy.ok, true);
  const expectedPeachContam = (60 * 10) / (10 + peachAdded);
  assert.ok(Math.abs(restockInv.getContaminationOf('peach') - expectedPeachContam) < 1e-6);
  assert.equal(restockInv.getContaminationOf('matcha'), 0);
  assert.equal(restockInv.getContaminationOf('sugar'), 45);
  assert.equal(getContaminatedOverThreshold(restockInv.getContamination()).length, 1);
}
