import './style.css';
import './ui/gameplayHud.css';
import './ui/panels.css';
import './ui/staffPanel.css';
import {
  bindGameInput,
  createShopPanels,
  getSafeLocalStorage,
  initGraphicsUi,
  initPlayerAvatar,
  initStoresAndSave,
} from './core/bootstrap.ts';
import { startGameLoop } from './core/gameLoop.ts';
import { createInput } from './core/input.ts';
import { createSceneSetup } from './core/sceneSetup.ts';
import { createDrinkStations } from './gameplay/drinkStations.ts';
import type { GameCtx } from './gameplay/gameCtx.ts';
import { initPhase6Modules } from './gameplay/gameWiring.ts';
import { createOrderManager } from './gameplay/orderManager.ts';
import { createShiftManager } from './gameplay/shiftManager.ts';
import { createShopEventsBridge } from './gameplay/shopEvents.ts';
import { createStaffManager } from './gameplay/staffManager.ts';
import { initStationLookup } from './gameplay/stationLookup.ts';
import { createInteractionSystem } from './interaction/interactionSystem.ts';
import { createFirstPersonController } from './player/firstPersonController.ts';
import { gameStore } from './state/gameState.ts';
import { loadGraphicsQuality } from './state/graphicsQuality.ts';
import { createHeldCupView } from './ui/heldCup.ts';
import { createHud } from './ui/hud.ts';
import { createLevelPicker } from './ui/levelPicker.ts';
import { createOrderTicket } from './ui/orderTicket.ts';
import { createCleanlinessView } from './world/cleanlinessView.ts';
import { createCustomerActor } from './world/customer.ts';
import { createShopWorld } from './world/shopWorld.ts';

// Khởi tạo toàn bộ game và kết nối cảnh 3D, tương tác, nhân viên và vòng lặp chính
function bootstrap() {
  const app = document.getElementById('app');
  if (!app) throw new Error('Không tìm thấy phần tử #app');

  const initialQuality = loadGraphicsQuality(getSafeLocalStorage());
  const { scene, camera, renderer, lighting, setDimmed } = createSceneSetup(app, { initialQuality });
  const input = createInput();

  let cleanlinessView: ReturnType<typeof createCleanlinessView> | null = null;
  const { storage, loadRes, loaded, inventory, cleanliness, staffStore, tutorial, saveCtrl } =
    initStoresAndSave(app, () => cleanlinessView?.sync());

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

  const panels = createShopPanels(app, {
    inventory,
    staffStore,
    saveCtrl,
    loaded,
    setRelockVisible: (visible) => hud.setRelockVisible(visible),
    onNextDay: () => {
      suppressPauseOverlay = false;
      shiftManager.nextDay();
      saveCtrl.saveIfAllowed();
      orderTicket.setOrder(null, 'closed');
      player.lock();
    },
    onEnterGame: () => {
      suppressPauseOverlay = false;
      hud.setRelockVisible(false);
      player.lock();
    },
  });

  const { fpsMeter } = initGraphicsUi(app, panels.menu, {
    renderer,
    lighting,
    storage,
    initialQuality,
    onLowFpsHint: (message) => gameStore.bus.emit('toast:show', { message }),
  });

  shiftManager = createShiftManager(
    world.stations,
    orderManager,
    () => staffStore.getTotalWage(),
    (active) => hud.setConfirmClose(active),
    () => {
      suppressPauseOverlay = true;
      player.unlock();
      panels.restockPanel.open(inventory.getStock(), gameStore.getState().money);
    },
    () => {
      suppressPauseOverlay = true;
      player.unlock();
      panels.staffPanel.open();
    },
    (summary, day) => {
      suppressPauseOverlay = true;
      player.unlock();
      panels.shiftSummary.show(summary, day);
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
  initStationLookup(world.stations, () => interaction.getCurrentTarget()?.target ?? null);

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

  player = createFirstPersonController(
    camera,
    renderer.domElement,
    input,
    world.colliders,
    (locked) => {
      hud.setLocked(locked);
      panels.menu.setLocked(locked, suppressPauseOverlay);
      if (!locked) {
        drinkStations.closePicker();
        shiftManager.confirmEarlyClose(false);
        interaction.cancelHold();
        hud.setHoldProgress(null);
      }
    },
  );

  const playerAvatar = initPlayerAvatar(scene, camera);

  bindGameInput(input, {
    isLocked: () => player.isLocked(),
    triggerInteract: () => interaction.trigger(),
    shopEvents,
    drinkStations,
    orderManager,
    shiftManager,
    tutorial,
    isMenuOpen: () => panels.menu.isOpen(),
    onEscape: () => {
      if (panels.restockPanel.isOpen()) panels.restockPanel.close();
      if (panels.staffPanel.isOpen()) panels.staffPanel.close();
    },
    onToggleAvatar: () => {
      const visible = playerAvatar.toggleSelfView();
      hud.showHint(visible ? 'Hiện thân mèo (nhấn V để ẩn)' : 'Đã ẩn thân mèo');
    },
  });

  const loopTicks = new Set<(dt: number) => void>();
  const ctx: GameCtx = {
    app,
    scene,
    camera,
    renderer,
    lighting,
    player,
    input,
    interaction,
    colliders: world.colliders,
    shopWorld: world,
    customer,
    eventBus: gameStore.bus,
    gameStore,
    storage,
    loadedSave: loaded,
    inventory,
    cleanliness,
    cleanlinessView,
    staffStore,
    staffManager,
    orderManager,
    shiftManager,
    drinkStations,
    hud,
    heldCupUi,
    saveCtrl,
    registerTick(fn) {
      loopTicks.add(fn);
      return () => loopTicks.delete(fn);
    },
  };
  initPhase6Modules(ctx);

  startGameLoop(scene, camera, renderer, (dt) => {
    fpsMeter.update();
    lighting.update?.(dt);
    player.update(dt);
    playerAvatar.update(dt);
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
      for (const tick of loopTicks) tick(dt);
    }
  });
}

bootstrap();
