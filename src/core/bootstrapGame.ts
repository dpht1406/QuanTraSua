import type * as THREE from 'three';
import { createDrinkStations } from '../gameplay/drinkStations.ts';
import { createOrderManager } from '../gameplay/orderManager.ts';
import { createShiftManager } from '../gameplay/shiftManager.ts';
import { createShopEventsBridge } from '../gameplay/shopEvents.ts';
import { createStaffManager } from '../gameplay/staffManager.ts';
import { initStationLookup } from '../gameplay/stationLookup.ts';
import { createInteractionSystem } from '../interaction/interactionSystem.ts';
import type { PlayerBody } from '../physics/playerBody.ts';
import { createFirstPersonController } from '../player/firstPersonController.ts';
import { gameStore } from '../state/gameState.ts';
import type { GraphicsQuality } from '../state/graphicsQuality.ts';
import { createHeldCupView } from '../ui/heldCup.ts';
import { createHud } from '../ui/hud.ts';
import { createLevelPicker } from '../ui/levelPicker.ts';
import { createOrderTicket } from '../ui/orderTicket.ts';
import { createCleanlinessView } from '../world/cleanlinessView.ts';
import type { CustomerActor } from '../world/customer.ts';
import type { ShopWorld } from '../world/shopWorld.ts';
import { bindGameInput, createShopPanels, initGraphicsUi, initPlayerAvatar, initStoresAndSave } from './bootstrap.ts';
import type { InputState } from './input.ts';
import type { LightingController } from './lighting.ts';

export interface ShopRuntimeDeps {
  app: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  lighting: LightingController;
  input: InputState;
  initialQuality: GraphicsQuality;
  world: ShopWorld;
  customer: CustomerActor;
  stores: ReturnType<typeof initStoresAndSave>;
  onCleanlinessSyncRef: { current: (() => void) | null };
  playerBody: PlayerBody;
  onQualityChange?: (q: GraphicsQuality) => void;
  onDimmedChange?: (dimmed: boolean) => void;
}

// Dựng toàn bộ hệ thống gameplay, UI, nhân viên, tương tác và điều khiển người chơi
export function setupShopSystems(deps: ShopRuntimeDeps) {
  const { app, scene, camera, renderer, lighting, input, initialQuality, world, customer, stores } = deps;
  const { storage, loadRes, loaded, inventory, cleanliness, staffStore, tutorial, saveCtrl } = stores;

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
    (dimmed) => {
      lighting.setDimmed(dimmed);
      deps.onDimmedChange?.(dimmed);
    },
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
    () => deps.onCleanlinessSyncRef.current?.(),
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
    onQualityChange: deps.onQualityChange,
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

  const cleanlinessView = createCleanlinessView(world, cleanliness, interaction, (message) => {
    gameStore.bus.emit('toast:show', { message });
  });
  deps.onCleanlinessSyncRef.current = () => cleanlinessView.sync();

  const staffManager = createStaffManager(
    world,
    staffStore,
    cleanliness,
    () => cleanlinessView.sync(),
    orderManager,
    inventory,
    () => drinkStations.hasHeldCup(),
    gameStore.bus,
    () => shopEvents.isPowerOutage(),
  );

  player = createFirstPersonController(camera, renderer.domElement, input, deps.playerBody, (locked) => {
    hud.setLocked(locked);
    panels.menu.setLocked(locked, suppressPauseOverlay);
    if (!locked) {
      drinkStations.closePicker();
      shiftManager.confirmEarlyClose(false);
      interaction.cancelHold();
      hud.setHoldProgress(null);
    }
  });

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

  return {
    player,
    playerAvatar,
    fpsMeter,
    hud,
    heldCupUi,
    cleanlinessView,
    staffManager,
    orderManager,
    shiftManager,
    drinkStations,
    shopEvents,
    interaction,
  };
}
