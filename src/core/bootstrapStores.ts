import { createCleanlinessStore } from '../state/cleanliness.ts';
import { gameStore } from '../state/gameState.ts';
import { createInventoryStore, purchaseRestockCart } from '../state/inventory.ts';
import { applyLoadedSave, bindAutoSave, createSaveController, loadSave, type StorageLike } from '../state/save.ts';
import { createStaffStore } from '../state/staff.ts';
import { createTutorialController } from '../state/tutorial.ts';
import { createMenuOverlay } from '../ui/menuOverlay.ts';
import { createRestockPanel } from '../ui/restockPanel.ts';
import { createShiftSummaryView } from '../ui/shiftSummary.ts';
import { createStaffPanel } from '../ui/staffPanel.ts';
import { createTutorialBox } from '../ui/tutorialBox.ts';

export function getSafeLocalStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Khởi tạo lưu/tải tiến trình, các store trạng thái và hệ thống hướng dẫn ban đầu
export function initStoresAndSave(app: HTMLElement, onCleanlinessSync: () => void) {
  const storage = getSafeLocalStorage();
  const loadRes = loadSave(storage);
  const loaded = loadRes.data;

  const inventory = createInventoryStore(
    loaded?.inventory,
    (stock, spentCost) => {
      gameStore.bus.emit('stockChanged', { stock, spentCost });
    },
    loaded?.contamination,
  );
  const cleanliness = createCleanlinessStore(gameStore.bus, {
    onSync: (value) => {
      gameStore.updateState({ cleanliness: value });
      onCleanlinessSync();
    },
  });
  const staffStore = createStaffStore(gameStore.bus);
  if (loaded) applyLoadedSave(loaded, gameStore, cleanliness, staffStore, inventory);

  const tutorialBox = createTutorialBox(app, () => tutorial.skip());
  let saveCtrl: ReturnType<typeof createSaveController>;
  const tutorial = createTutorialController(gameStore.bus, {
    initialDone: loaded?.tutorialDone ?? false,
    onChange: (view) => tutorialBox.render(view),
    onDone: () => saveCtrl.saveTutorialDone(),
  });
  saveCtrl = createSaveController({
    storage,
    initialSave: loaded,
    getSnapshot: () => ({
      state: gameStore.getState(),
      inventory: inventory.getStock(),
      contamination: inventory.getContamination(),
      staff: staffStore.getHired(),
      stains: cleanliness.getStains(),
      tutorialDone: tutorial.isDone(),
    }),
    onStorageError: () => gameStore.bus.emit('toast:show', { message: 'Không lưu được tiến trình' }),
  });
  bindAutoSave(gameStore.bus, saveCtrl);
  tutorialBox.render(tutorial.getView());

  return { storage, loadRes, loaded, inventory, cleanliness, staffStore, tutorial, saveCtrl };
}

// Tạo các bảng nhập hàng, nhân viên, tổng kết ca và màn hình menu chính
export function createShopPanels(
  app: HTMLElement,
  deps: {
    inventory: ReturnType<typeof createInventoryStore>;
    staffStore: ReturnType<typeof createStaffStore>;
    saveCtrl: ReturnType<typeof createSaveController>;
    loaded: ReturnType<typeof loadSave>['data'];
    setRelockVisible: (visible: boolean) => void;
    onNextDay: () => void;
    onEnterGame: () => void;
  },
) {
  const restockPanel = createRestockPanel(
    app,
    (cart) => {
      const res = purchaseRestockCart(deps.inventory, cart, gameStore.getState().money);
      if (res.ok && res.money !== undefined) {
        gameStore.updateState({ money: res.money });
        deps.saveCtrl.saveIfAllowed();
      }
      return res;
    },
    () => deps.setRelockVisible(true),
  );

  const staffPanel = createStaffPanel(
    app,
    deps.staffStore,
    () => gameStore.getState().shiftState,
    () => deps.setRelockVisible(true),
  );

  const shiftSummary = createShiftSummaryView(app, deps.onNextDay);

  const menu = createMenuOverlay(app, {
    saveSummary: deps.loaded
      ? { day: deps.loaded.day, money: deps.loaded.money, reputation: deps.loaded.reputation }
      : null,
    canRestart: () => gameStore.getState().shiftState === 'closed',
    onEnterGame: deps.onEnterGame,
    onRestartGame: () => {
      // shortcut: xóa save rồi tải lại trang để khởi tạo sạch toàn bộ state và cảnh 3D; nâng cấp sau bằng reset in-memory nếu cần
      deps.saveCtrl.clear();
      window.location.reload();
    },
  });

  return { restockPanel, staffPanel, shiftSummary, menu };
}
