import './style.css';
import './ui/gameplayHud.css';
import './ui/panels.css';
import './ui/staffPanel.css';
import { startGameLoop } from './core/gameLoop.ts';
import { createInput } from './core/input.ts';
import { createSceneSetup } from './core/sceneSetup.ts';
import { createDrinkStations } from './gameplay/drinkStations.ts';
import { createOrderManager } from './gameplay/orderManager.ts';
import { createShiftManager } from './gameplay/shiftManager.ts';
import { createShopEventsBridge } from './gameplay/shopEvents.ts';
import { createStaffManager } from './gameplay/staffManager.ts';
import { createInteractionSystem } from './interaction/interactionSystem.ts';
import { createFirstPersonController } from './player/firstPersonController.ts';
import { createCleanlinessStore } from './state/cleanliness.ts';
import { gameStore } from './state/gameState.ts';
import { createInventoryStore, purchaseRestockCart } from './state/inventory.ts';
import { applyLoadedSave, bindAutoSave, createSaveController, loadSave, type StorageLike } from './state/save.ts';
import { createStaffStore } from './state/staff.ts';
import { createTutorialController, TUTORIAL_SKIP_KEY } from './state/tutorial.ts';
import { createHeldCupView } from './ui/heldCup.ts';
import { createHud } from './ui/hud.ts';
import { createLevelPicker } from './ui/levelPicker.ts';
import { createMenuOverlay } from './ui/menuOverlay.ts';
import { createOrderTicket } from './ui/orderTicket.ts';
import { createRestockPanel } from './ui/restockPanel.ts';
import { createShiftSummaryView } from './ui/shiftSummary.ts';
import { createStaffPanel } from './ui/staffPanel.ts';
import { createTutorialBox } from './ui/tutorialBox.ts';
import { createCleanlinessView } from './world/cleanlinessView.ts';
import { createCustomerActor } from './world/customer.ts';
import { createShopWorld } from './world/shopWorld.ts';

function getSafeLocalStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Khởi tạo toàn bộ game và kết nối lưu/tải tiến trình, hướng dẫn, uy tín, sự kiện và pha chế
function bootstrap() {
  const app = document.getElementById('app');
  if (!app) throw new Error('Không tìm thấy phần tử #app');

  const storage = getSafeLocalStorage();
  const loadRes = loadSave(storage);
  const loaded = loadRes.data;

  const { scene, camera, renderer, setDimmed } = createSceneSetup(app);
  const input = createInput();

  const inventory = createInventoryStore(loaded?.inventory, (stock, spentCost) => {
    gameStore.bus.emit('stockChanged', { stock, spentCost });
  });

  let cleanlinessView: ReturnType<typeof createCleanlinessView> | null = null;
  const cleanliness = createCleanlinessStore(gameStore.bus, {
    onSync: (value) => {
      gameStore.updateState({ cleanliness: value });
      cleanlinessView?.sync();
    },
  });
  const staffStore = createStaffStore(gameStore.bus);
  if (loaded) applyLoadedSave(loaded, gameStore, cleanliness, staffStore);

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
      staff: staffStore.getHired(),
      stains: cleanliness.getStains(),
      tutorialDone: tutorial.isDone(),
    }),
    onStorageError: () => gameStore.bus.emit('toast:show', { message: 'Không lưu được tiến trình' }),
  });
  bindAutoSave(gameStore.bus, saveCtrl);
  tutorialBox.render(tutorial.getView());

  const world = createShopWorld((message) => {
    gameStore.bus.emit('toast:show', { message });
  });
  scene.add(world.root);

  const customer = createCustomerActor();
  scene.add(customer.root);

  let player: ReturnType<typeof createFirstPersonController>;
  let suppressPauseOverlay = false;

  const hud = createHud(app, gameStore.getState(), inventory.getStock(), gameStore.bus, () => {
    suppressPauseOverlay = false;
    hud.setRelockVisible(false);
    player.lock();
  });
  if (!storage || loadRes.storageError) saveCtrl.notifyUnavailable();
  const orderTicket = createOrderTicket(app);
  const levelPicker = createLevelPicker(app);
  const heldCupUi = createHeldCupView(app);

  let drinkStations: ReturnType<typeof createDrinkStations>;
  const shopEvents = createShopEventsBridge(
    app,
    hud,
    staffStore,
    setDimmed,
    () => drinkStations?.closePicker(),
  );

  let shiftManager: ReturnType<typeof createShiftManager>;
  const orderManager = createOrderManager(
    customer,
    gameStore.bus,
    () => shiftManager.getGameMinutes(),
    (view) => orderTicket.setOrder(view, gameStore.getState().shiftState),
    (text, positive) => orderTicket.showResult(text, positive),
    shopEvents.getOrderHooks(),
  );

  gameStore.bus.on('orderServed', ({ score }) => cleanliness.recordCustomerServed(score.total));

  drinkStations = createDrinkStations(
    world.stations,
    orderManager,
    inventory,
    cleanliness,
    () => cleanlinessView?.sync(),
    () => gameStore.getState().shiftState,
    gameStore.bus,
    heldCupUi,
    levelPicker,
    (isMaking) => shopEvents.getDrinkBlockReason(isMaking),
  );

  const restockPanel = createRestockPanel(
    app,
    (cart) => {
      const res = purchaseRestockCart(inventory, cart, gameStore.getState().money);
      if (res.ok && res.money !== undefined) {
        gameStore.updateState({ money: res.money });
        saveCtrl.saveIfAllowed();
      }
      return res;
    },
    () => hud.setRelockVisible(true),
  );

  const staffPanel = createStaffPanel(
    app,
    staffStore,
    () => gameStore.getState().shiftState,
    () => hud.setRelockVisible(true),
  );

  const shiftSummary = createShiftSummaryView(app, () => {
    suppressPauseOverlay = false;
    shiftManager.nextDay();
    saveCtrl.saveIfAllowed();
    orderTicket.setOrder(null, 'closed');
    player.lock();
  });

  shiftManager = createShiftManager(
    world.stations,
    orderManager,
    () => staffStore.getTotalWage(),
    (active) => hud.setConfirmClose(active),
    () => {
      suppressPauseOverlay = true;
      player.unlock();
      restockPanel.open(inventory.getStock(), gameStore.getState().money);
    },
    () => {
      suppressPauseOverlay = true;
      player.unlock();
      staffPanel.open();
    },
    (summary, day) => {
      suppressPauseOverlay = true;
      player.unlock();
      shiftSummary.show(summary, day);
    },
    () => drinkStations.clearHeldCup(),
    shopEvents.getShiftHooks(),
  );

  const interaction = createInteractionSystem(
    camera,
    [...shiftManager.interactables, ...drinkStations.interactables, ...world.interactables],
    (label, isHold) => hud.setPrompt(label, isHold),
    (progress) => hud.setHoldProgress(progress),
  );

  cleanlinessView = createCleanlinessView(world, cleanliness, interaction, (message) => {
    gameStore.bus.emit('toast:show', { message });
  });

  const staffManager = createStaffManager(
    world,
    staffStore,
    cleanliness,
    () => cleanlinessView?.sync(),
    orderManager,
    inventory,
    () => drinkStations.hasHeldCup(),
    gameStore.bus,
    () => shopEvents.isPowerOutage(),
  );

  const menu = createMenuOverlay(app, {
    saveSummary: loaded ? { day: loaded.day, money: loaded.money, reputation: loaded.reputation } : null,
    canRestart: () => gameStore.getState().shiftState === 'closed',
    onEnterGame: () => {
      suppressPauseOverlay = false;
      hud.setRelockVisible(false);
      player.lock();
    },
    onRestartGame: () => {
      // shortcut: xóa save rồi tải lại trang để khởi tạo sạch toàn bộ state và cảnh 3D; nâng cấp sau bằng reset in-memory nếu cần
      saveCtrl.clear();
      window.location.reload();
    },
  });

  player = createFirstPersonController(
    camera,
    renderer.domElement,
    input,
    world.colliders,
    (locked) => {
      hud.setLocked(locked);
      menu.setLocked(locked, suppressPauseOverlay);
      if (!locked) {
        drinkStations.closePicker();
        shiftManager.confirmEarlyClose(false);
        interaction.cancelHold();
        hud.setHoldProgress(null);
      }
    },
  );

  input.onInteract(() => {
    if (player.isLocked()) interaction.trigger();
  });
  input.onDigit((digit) => {
    if (!player.isLocked()) return;
    if (!shopEvents.handleDigit(digit)) drinkStations.pickDigit(digit);
  });
  input.onKey('KeyG', () => {
    if (player.isLocked()) orderManager.tryGreet();
  });
  input.onKey('KeyY', () => {
    if (player.isLocked()) shiftManager.confirmEarlyClose(true);
  });
  input.onKey('KeyN', () => {
    if (player.isLocked()) shiftManager.confirmEarlyClose(false);
  });
  input.onKey(TUTORIAL_SKIP_KEY, () => {
    if (tutorial.isActive() && !menu.isOpen()) tutorial.skip();
  });
  input.onKey('Escape', () => {
    if (restockPanel.isOpen()) restockPanel.close();
    if (staffPanel.isOpen()) staffPanel.close();
  });

  startGameLoop(scene, camera, renderer, (dt) => {
    player.update(dt);
    if (player.isLocked()) {
      interaction.update(dt, input.isDown('KeyE'));
      const target = interaction.getCurrentTarget()?.target ?? null;
      drinkStations.syncTarget(target);
      shiftManager.syncTarget(target);
      shiftManager.update(dt);
      orderManager.update(dt);
      const shiftState = gameStore.getState().shiftState;
      cleanliness.update(dt, shiftState);
      shopEvents.update(dt, shiftState, orderManager.getActiveOrder());
      staffManager.update(dt, shiftState);
    }
  });
}

bootstrap();
