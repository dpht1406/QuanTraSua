import assert from 'node:assert/strict';
import { discardCupInBin } from '../gameplay/cupDisposal.ts';
import { createCleanlinessStore } from './cleanliness.ts';
import {
  HAND_PRIORITY,
  KEY_POUR_BACK,
  KEY_THROW_LEFT,
  KEY_THROW_RIGHT,
  MAX_CUPS_IN_HANDS,
} from './constantsHands.ts';
import { createEventBus } from './eventBus.ts';
import { createGameStore, type GameEvents } from './gameState.ts';
import {
  clearHands,
  createHands,
  findCupHand,
  findHand,
  getHeld,
  isFull,
  pickUp,
  removeFrom,
} from './hands.ts';
import {
  createInitialStock,
  createInventoryStore,
  INVENTORY_ITEMS,
} from './inventory.ts';
import { createComplaintController } from './reputation.ts';
import {
  applyLoadedSave,
  buildSaveData,
  deserializeSave,
  resolveSaveContamination,
  SAVE_VERSION,
  serializeSave,
} from './save.ts';
import { createEmptyCup } from './scoring.ts';
import { createStaffStore } from './staff.ts';
import {
  createToolLocations,
  getLocation,
  resetAllToRack,
  setLocation,
} from './toolLocations.ts';

// Tự kiểm tra GĐ6a (nền tảng hợp đồng): hai tay, vị trí dụng cụ, lưu/tải độ nhiễm, bỏ ly & phàn nàn bonus
export function runSelfCheck6a(): void {
  assert.deepEqual([...HAND_PRIORITY], ['right', 'left']);
  assert.equal(MAX_CUPS_IN_HANDS, 1);
  assert.equal(KEY_THROW_RIGHT, 'KeyF');
  assert.equal(KEY_THROW_LEFT, 'KeyQ');
  assert.equal(KEY_POUR_BACK, 'KeyR');

  // 1. Nhặt vào tay trống ưu tiên tay phải, ly thứ hai bị từ chối (cup_limit), cả hai tay đầy (full)
  const hands = createHands();
  assert.equal(isFull(hands), false);
  assert.equal(findCupHand(hands), null);

  const cup1 = createEmptyCup();
  assert.deepEqual(pickUp(hands, { kind: 'cup', cup: cup1 }), { ok: true, hand: 'right' });
  assert.equal(findCupHand(hands), 'right');
  assert.equal(getHeld(hands, 'right')?.kind, 'cup');

  const cup2 = createEmptyCup();
  assert.deepEqual(pickUp(hands, { kind: 'cup', cup: cup2 }), { ok: false, reason: 'cup_limit' });
  assert.equal(isFull(hands), false);

  assert.deepEqual(pickUp(hands, { kind: 'broom' }), { ok: true, hand: 'left' });
  assert.equal(findHand(hands, 'broom'), 'left');
  assert.equal(isFull(hands), true);
  assert.deepEqual(pickUp(hands, { kind: 'mop' }), { ok: false, reason: 'full' });

  // 2. Cất dụng cụ về giá (removeFrom + toolLocations về 'rack')
  const tools = createToolLocations();
  assert.equal(getLocation(tools, 'broom'), 'rack');
  assert.equal(getLocation(tools, 'mop'), 'rack');
  setLocation(tools, 'broom', 'hand');
  assert.equal(getLocation(tools, 'broom'), 'hand');

  const putBack = removeFrom(hands, 'left');
  assert.deepEqual(putBack, { kind: 'broom' });
  assert.equal(getHeld(hands, 'left'), null);
  setLocation(tools, 'broom', 'rack');
  assert.equal(getLocation(tools, 'broom'), 'rack');

  // 3. Kết ca / tải save: clearHands và resetAllToRack đặt tay rỗng, dụng cụ về giá
  setLocation(tools, 'broom', 'flying');
  setLocation(tools, 'mop', 'floor');
  clearHands(hands);
  resetAllToRack(tools);
  assert.equal(getHeld(hands, 'right'), null);
  assert.equal(getHeld(hands, 'left'), null);
  assert.equal(getLocation(tools, 'broom'), 'rack');
  assert.equal(getLocation(tools, 'mop'), 'rack');

  // 4. Save cũ không có contamination vẫn tải được (mặc định 0); giá trị ngoài 0..100 bị kẹp
  const legacyJson = JSON.stringify({
    version: SAVE_VERSION,
    money: 550000,
    day: 2,
    reputation: 60,
    wageDebt: 0,
    inventory: createInitialStock(),
    staffIds: [],
    stains: [],
    tutorialDone: true,
  });
  const legacyLoaded = deserializeSave(legacyJson);
  assert.ok(legacyLoaded !== null);
  const resolvedLegacy = resolveSaveContamination(legacyLoaded);
  for (const item of INVENTORY_ITEMS) {
    assert.equal(resolvedLegacy[item], 0);
  }
  const legacyInv = createInventoryStore(legacyLoaded.inventory, undefined, legacyLoaded.contamination);
  for (const item of INVENTORY_ITEMS) {
    assert.equal(legacyInv.getContaminationOf(item), 0);
  }

  const outOfRangeJson = JSON.stringify({
    version: SAVE_VERSION,
    money: 550000,
    day: 2,
    reputation: 60,
    wageDebt: 0,
    inventory: createInitialStock(),
    contamination: { cup: -15, matcha: 150, peach: 37.5 },
    staffIds: [],
    stains: [],
    tutorialDone: false,
  });
  const clampedLoaded = deserializeSave(outOfRangeJson);
  assert.ok(clampedLoaded !== null);
  assert.equal(clampedLoaded.contamination?.cup, 0);
  assert.equal(clampedLoaded.contamination?.matcha, 100);
  assert.equal(clampedLoaded.contamination?.peach, 37.5);
  assert.equal(clampedLoaded.contamination?.pearl, 0);

  // Kiểm tra applyLoadedSave khôi phục contamination và reset tay/dụng cụ trên GameState
  const store = createGameStore();
  pickUp(store.getState().hands, { kind: 'mop' });
  setLocation(store.getState().tools, 'mop', 'floor');
  const busClean = createCleanlinessStore(store.bus);
  const staff = createStaffStore(store.bus);
  const inv = createInventoryStore();
  inv.setContamination('matcha', 45);
  const built = buildSaveData({
    state: store.getState(),
    inventory: inv.getStock(),
    contamination: inv.getContamination(),
    staff: [],
    stains: [],
    tutorialDone: true,
  });
  const roundtrip = deserializeSave(serializeSave(built));
  assert.ok(roundtrip !== null);
  const restoredInv = createInventoryStore(roundtrip.inventory);
  applyLoadedSave(roundtrip, store, busClean, staff, restoredInv);
  assert.equal(getHeld(store.getState().hands, 'right'), null);
  assert.equal(getLocation(store.getState().tools, 'mop'), 'rack');
  assert.equal(restoredInv.getContaminationOf('matcha'), 45);

  // 5. Kiểm tra discardCupInBin và công thức xác suất phàn nàn có bonus kẹp ≤ 95%
  const notices: string[] = [];
  let trashSynced = 0;
  const binRes = discardCupInBin(createEmptyCup(), {
    cleanliness: busClean,
    onTrashChanged: () => {
      trashSynced += 1;
    },
    notify: (msg) => notices.push(msg),
  });
  assert.equal(binRes.ok, true);
  assert.equal(trashSynced, 1);
  assert.equal(notices.length, 1);

  const bus = createEventBus<GameEvents>();
  let rngVal = 0.96;
  const comp = createComplaintController(bus, {
    trySpendMoney: () => true,
    adjustReputation: () => {},
    rng: () => rngVal,
  });
  assert.equal(comp.maybeTrigger(85, 30000, 30000, 0), false);
  rngVal = 0.4;
  assert.equal(comp.maybeTrigger(85, 30000, 30000, 0.5), true);
  comp.clear();
  rngVal = 0.96;
  assert.equal(comp.maybeTrigger(40, 30000, 30000, 0.8), false); // 0.6 + 0.8 kẹp tối đa 0.95
  rngVal = 0.94;
  assert.equal(comp.maybeTrigger(40, 30000, 30000, 0.8), true);
}
