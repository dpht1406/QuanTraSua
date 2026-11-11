import assert from 'node:assert/strict';
import { createCleanlinessStore } from './cleanliness.ts';
import { MAX_STAINS, REPUTATION_MAX } from './constants.ts';
import { createEventBus } from './eventBus.ts';
import { createGameStore, DEFAULT_GAME_STATE, type GameEvents } from './gameState.ts';
import { createInitialStock, createInventoryStore, purchaseRestockCart } from './inventory.ts';
import {
  applyLoadedSave,
  bindAutoSave,
  clearSave,
  createSaveController,
  deserializeSave,
  loadSave,
  SAVE_KEY,
  SAVE_VERSION,
  serializeSave,
  type SaveData,
  type StorageLike,
} from './save.ts';
import { createEmptyShiftStats } from './shift.ts';
import { createStaffStore } from './staff.ts';
import { createTutorialController, TUTORIAL_STEPS } from './tutorial.ts';

function createFakeStorage(options: { throwOnGet?: boolean; throwOnSet?: boolean; throwOnRemove?: boolean } = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem(key) {
      if (options.throwOnGet) throw new Error('storage blocked');
      return map.get(key) ?? null;
    },
    setItem(key, value) {
      if (options.throwOnSet) throw new Error('quota exceeded');
      map.set(key, value);
    },
    removeItem(key) {
      if (options.throwOnRemove) throw new Error('remove failed');
      map.delete(key);
    },
  };
}

// Tự kiểm tra Giai đoạn 5b: lưu/tải localStorage giả, kiểm tra dữ liệu hỏng/ngoài biên, thời điểm lưu và tutorial
export function runPhase5bSelfCheck() {
  // 1. Roundtrip lưu -> tải bằng fake storage
  const storage = createFakeStorage();
  const sampleSave: SaveData = {
    version: SAVE_VERSION,
    money: 640000,
    day: 3,
    reputation: 72,
    wageDebt: 15000,
    inventory: { ...createInitialStock(), cup: 18, matcha: 6 },
    staffIds: ['na', 'linh'],
    stains: [
      { id: 'stain_4', kind: 'spill', x: 1.3, z: -0.5, standX: 1.3, standZ: -0.5 },
      { id: 'stain_7', kind: 'dirty_table', x: 3.1, z: -1.7, standX: 1.82, standZ: -1.7, tableIndex: 0 },
    ],
    tutorialDone: true,
  };
  storage.setItem(SAVE_KEY, serializeSave(sampleSave));
  const loaded = loadSave(storage);
  assert.equal(loaded.storageError, false);
  assert.equal(loaded.invalidData, false);
  assert.deepEqual(loaded.data, sampleSave);

  // 2. Version không khớp, JSON hỏng, thiếu trường -> trả về null và không crash
  assert.equal(deserializeSave('{"version":999}'), null);
  assert.equal(deserializeSave('{broken json'), null);
  assert.equal(deserializeSave('null'), null);
  assert.equal(deserializeSave('[]'), null);

  const missingMoney = { ...sampleSave } as Record<string, unknown>;
  delete missingMoney.money;
  assert.equal(deserializeSave(JSON.stringify(missingMoney)), null);

  const missingInvItem = { ...sampleSave, inventory: { ...sampleSave.inventory } as Record<string, unknown> };
  delete missingInvItem.inventory.matcha;
  assert.equal(deserializeSave(JSON.stringify(missingInvItem)), null);

  // 3. Giá trị ngoài biên -> sửa về biên hợp lệ
  const clamped = deserializeSave(
    JSON.stringify({
      ...sampleSave,
      money: -5000,
      wageDebt: -200,
      day: 0,
      reputation: 500,
      inventory: { ...sampleSave.inventory, cup: -10, ice: 12.9 },
      staffIds: ['na', 'minh', 'unknown', 'na', 'chau'], // trùng vai trò cleaner -> giữ 'na', 'chau'
      stains: [
        ...Array.from({ length: MAX_STAINS + 4 }, (_, i) => ({
          id: `s_${i}`,
          kind: 'spill',
          x: i,
          z: 0,
          standX: i,
          standZ: 0,
        })),
        { id: 'bad_table', kind: 'dirty_table', x: 0, z: 0, standX: 0, standZ: 0, tableIndex: 99 },
      ],
    }),
  );
  assert.ok(clamped !== null);
  assert.equal(clamped.money, 0);
  assert.equal(clamped.wageDebt, 0);
  assert.equal(clamped.day, 1);
  assert.equal(clamped.reputation, REPUTATION_MAX);
  assert.equal(clamped.inventory.cup, 0);
  assert.equal(clamped.inventory.ice, 12);
  assert.deepEqual(clamped.staffIds, ['na', 'chau']);
  assert.equal(clamped.stains.length, MAX_STAINS);

  // 4. Khôi phục vào stores & tránh trùng id vết bẩn mới
  const store = createGameStore();
  const clean = createCleanlinessStore(store.bus);
  const staff = createStaffStore(store.bus);
  applyLoadedSave(sampleSave, store, clean, staff);
  assert.equal(store.getState().money, 640000);
  assert.equal(store.getState().day, 3);
  assert.equal(store.getState().reputation, 72);
  assert.equal(store.getState().wageDebt, 15000);
  assert.equal(store.getState().shiftState, 'closed');
  assert.deepEqual(staff.getHired().map((s) => s.id), ['na', 'linh']);
  assert.equal(clean.getStains().length, 2);
  const extraStain = clean.spawnFloorStain('trash');
  assert.ok(extraStain && extraStain.id !== 'stain_4' && extraStain.id !== 'stain_7');

  // 5. Không lưu khi open/closing; lưu đúng khi closed/summary; xóa save khi Chơi mới
  const timingStorage = createFakeStorage();
  const gs = createGameStore();
  const inv = createInventoryStore();
  const cl = createCleanlinessStore(gs.bus);
  const st = createStaffStore(gs.bus);
  let tutDone = false;
  const saveCtrl = createSaveController({
    storage: timingStorage,
    getSnapshot: () => ({
      state: gs.getState(),
      inventory: inv.getStock(),
      staff: st.getHired(),
      stains: cl.getStains(),
      tutorialDone: tutDone,
    }),
  });
  bindAutoSave(gs.bus, saveCtrl);

  gs.updateState({ shiftState: 'open', money: 777000 });
  assert.equal(saveCtrl.saveIfAllowed(), false);
  assert.equal(timingStorage.getItem(SAVE_KEY), null);

  gs.updateState({ shiftState: 'closing', money: 888000 });
  assert.equal(saveCtrl.saveIfAllowed(), false);
  assert.equal(timingStorage.getItem(SAVE_KEY), null);

  gs.updateState({ shiftState: 'summary', day: 2, money: 910000, wageDebt: 5000 });
  gs.bus.emit('shiftClosed', {
    summary: {
      revenue: 200000, servedCount: 5, failedCount: 0, avgStars: 4.5, ingredientCost: 40000,
      staffWages: 0, profit: 160000, shopRating: 4, reputationEnd: 55, reputationDelta: 5,
      prevDebtPaid: 0, wageDebt: 5000,
    },
  });
  const afterSummary = loadSave(timingStorage).data;
  assert.ok(afterSummary !== null);
  assert.equal(afterSummary.day, 3); // Ca ngày 2 đã xong -> lưu sang ngày 3
  assert.equal(afterSummary.money, 910000);

  gs.updateState({ shiftState: 'closed', day: 3, shiftStats: createEmptyShiftStats() });
  const buy = purchaseRestockCart(inv, { cup: 1 }, gs.getState().money);
  assert.equal(buy.ok, true);
  gs.updateState({ money: buy.money! });
  assert.equal(saveCtrl.saveIfAllowed(), true);
  assert.equal(loadSave(timingStorage).data?.inventory.cup, inv.getCount('cup'));

  assert.equal(st.hire('na', 'closed').ok, true);
  assert.deepEqual(loadSave(timingStorage).data?.staffIds, ['na']);

  // Xóa save khi "Chơi mới"
  assert.equal(saveCtrl.clear(), true);
  assert.equal(clearSave(timingStorage), true);
  assert.equal(loadSave(timingStorage).data, null);

  // 6. Storage lỗi -> không crash và chỉ cảnh báo 1 lần
  let errorAlerts = 0;
  const brokenStorage = createFakeStorage({ throwOnSet: true, throwOnGet: true });
  assert.equal(loadSave(brokenStorage).storageError, true);
  const brokenCtrl = createSaveController({
    storage: brokenStorage,
    getSnapshot: () => ({
      state: DEFAULT_GAME_STATE,
      inventory: createInitialStock(),
      staff: [],
      stains: [],
      tutorialDone: false,
    }),
    onStorageError: () => {
      errorAlerts += 1;
    },
  });
  assert.equal(brokenCtrl.saveIfAllowed(), false);
  assert.equal(brokenCtrl.saveIfAllowed(), false);
  assert.equal(errorAlerts, 1);

  // 7. Tutorial: đúng thứ tự sự kiện, bước tùy chọn, bỏ qua & lưu tutorialDone không bật lại
  const tBus = createEventBus<GameEvents>();
  const tStorage = createFakeStorage();
  const tGs = createGameStore();
  let tSavedCount = 0;
  const tSaveCtrl = createSaveController({
    storage: tStorage,
    getSnapshot: () => ({
      state: tGs.getState(),
      inventory: createInitialStock(),
      staff: [],
      stains: [],
      tutorialDone: tut.isDone(),
    }),
  });
  const tut = createTutorialController(tBus, {
    onDone: () => {
      tSavedCount += 1;
      tSaveCtrl.saveTutorialDone();
    },
  });

  assert.equal(TUTORIAL_STEPS.length, 5);
  assert.equal(tut.getCurrentStep()?.id, 'open_shift');
  // Sự kiện sai thứ tự bị bỏ qua
  tBus.emit('orderServed', { score: { accuracy: 100, timeFactor: 1, total: 100, stars: 5, payout: 30000 }, elapsed: 10, payout: 30000 });
  assert.equal(tut.getCurrentStep()?.id, 'open_shift');

  tBus.emit('shiftOpened', { day: 1 });
  assert.equal(tut.getCurrentStep()?.id, 'serve_order');
  tBus.emit('cleanlinessChanged', { value: 90, delta: -10 });
  assert.equal(tut.getCurrentStep()?.id, 'serve_order');

  tBus.emit('orderServed', { score: { accuracy: 100, timeFactor: 1, total: 100, stars: 5, payout: 30000 }, elapsed: 10, payout: 30000 });
  assert.equal(tut.getCurrentStep()?.id, 'clean_stain');
  tBus.emit('cleanlinessChanged', { value: 80, delta: -10 }); // Giảm độ sạch không qua bước
  assert.equal(tut.getCurrentStep()?.id, 'clean_stain');
  tBus.emit('cleanlinessChanged', { value: 95, delta: 15 }); // Tăng độ sạch -> qua bước
  assert.equal(tut.getCurrentStep()?.id, 'close_shift');

  tBus.emit('shiftClosed', {
    summary: {
      revenue: 30000, servedCount: 1, failedCount: 0, avgStars: 5, ingredientCost: 0,
      staffWages: 0, profit: 30000, shopRating: 5, reputationEnd: 52, reputationDelta: 2,
      prevDebtPaid: 0, wageDebt: 0,
    },
  });
  const step5 = tut.getCurrentStep();
  assert.equal(step5?.id, 'hire_staff');
  assert.equal(step5?.optional, true);

  tBus.emit('staffHired', { staff: { id: 'na', name: 'Bé Na', role: 'cleaner', wage: 60000, speed: 1.5, errorRate: 0 } });
  assert.equal(tut.isDone(), true);
  assert.equal(tSavedCount, 1);
  assert.equal(loadSave(tStorage).data?.tutorialDone, true);

  // Kiểm tra bỏ qua giữa ca không làm rò rỉ tiền giữa ca vào save
  const skipStorage = createFakeStorage();
  const skipGs = createGameStore();
  skipGs.updateState({ shiftState: 'open', money: 999999 });
  const skipCtrl = createSaveController({
    storage: skipStorage,
    getSnapshot: () => ({
      state: skipGs.getState(),
      inventory: createInitialStock(),
      staff: [],
      stains: [],
      tutorialDone: skipTut.isDone(),
    }),
  });
  const skipTut = createTutorialController(skipGs.bus, {
    onDone: () => skipCtrl.saveTutorialDone(),
  });
  skipTut.skip();
  assert.equal(skipTut.isDone(), true);
  const skipLoaded = loadSave(skipStorage).data;
  assert.equal(skipLoaded?.tutorialDone, true);
  assert.equal(skipLoaded?.money, DEFAULT_GAME_STATE.money);

  // Đã tutorialDone = true thì không bật lại
  const noTut = createTutorialController(tBus, { initialDone: skipLoaded?.tutorialDone });
  assert.equal(noTut.isDone(), true);
  assert.equal(noTut.getView(), null);
  tBus.emit('shiftOpened', { day: 2 });
  assert.equal(noTut.isDone(), true);
}
