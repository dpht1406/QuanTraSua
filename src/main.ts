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
import { createStaffManager } from './gameplay/staffManager.ts';
import { createInteractionSystem } from './interaction/interactionSystem.ts';
import { createFirstPersonController } from './player/firstPersonController.ts';
import { createCleanlinessStore } from './state/cleanliness.ts';
import { gameStore } from './state/gameState.ts';
import {
  costOf,
  createInventoryStore,
  INVENTORY_ITEMS,
  type InventoryItem,
} from './state/inventory.ts';
import { createStaffStore } from './state/staff.ts';
import { createHeldCupView } from './ui/heldCup.ts';
import { createHud } from './ui/hud.ts';
import { createLevelPicker } from './ui/levelPicker.ts';
import { createMenuOverlay } from './ui/menuOverlay.ts';
import { createOrderTicket } from './ui/orderTicket.ts';
import { createRestockPanel } from './ui/restockPanel.ts';
import { createShiftSummaryView } from './ui/shiftSummary.ts';
import { createStaffPanel } from './ui/staffPanel.ts';
import { createCleanlinessView } from './world/cleanlinessView.ts';
import { createCustomerActor } from './world/customer.ts';
import { createShopWorld } from './world/shopWorld.ts';

// Khởi tạo toàn bộ game Giai đoạn 4 và kết nối vệ sinh, nhân viên, ca làm việc, kho, pha chế
function bootstrap() {
  const app = document.getElementById('app');
  if (!app) throw new Error('Không tìm thấy phần tử #app');

  const { scene, camera, renderer } = createSceneSetup(app);
  const input = createInput();

  const inventory = createInventoryStore(undefined, (stock, spentCost) => {
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
  const orderTicket = createOrderTicket(app);
  const levelPicker = createLevelPicker(app);
  const heldCupUi = createHeldCupView(app);

  let shiftManager: ReturnType<typeof createShiftManager>;
  const orderManager = createOrderManager(
    customer,
    gameStore.bus,
    () => shiftManager.getGameMinutes(),
    (view) => orderTicket.setOrder(view, gameStore.getState().shiftState),
    (text, positive) => orderTicket.showResult(text, positive),
  );

  gameStore.bus.on('orderServed', ({ score }) => {
    cleanliness.recordCustomerServed(score.total);
  });

  const drinkStations = createDrinkStations(
    world.stations,
    orderManager,
    inventory,
    cleanliness,
    () => cleanlinessView?.sync(),
    () => gameStore.getState().shiftState,
    gameStore.bus,
    heldCupUi,
    levelPicker,
  );

  const restockPanel = createRestockPanel(
    app,
    (cart) => {
      let total = 0;
      for (const item of INVENTORY_ITEMS) {
        const packs = cart[item] ?? 0;
        if (packs > 0) total += costOf(item, packs);
      }
      const prevMoney = gameStore.getState().money;
      if (total > prevMoney) {
        return { ok: false, message: 'Không đủ tiền để nhập đơn hàng này!' };
      }
      for (const item of INVENTORY_ITEMS) {
        const packs = cart[item as InventoryItem] ?? 0;
        if (packs > 0) inventory.restock(item, packs);
      }
      const updated = gameStore.updateState({ money: prevMoney - total });
      return {
        ok: true,
        message: 'Đã nhập hàng thành công!',
        stock: inventory.getStock(),
        money: updated.money,
      };
    },
    () => {
      hud.setRelockVisible(true);
    },
  );

  const staffPanel = createStaffPanel(
    app,
    staffStore,
    () => gameStore.getState().shiftState,
    () => {
      hud.setRelockVisible(true);
    },
  );

  const shiftSummary = createShiftSummaryView(app, () => {
    suppressPauseOverlay = false;
    shiftManager.nextDay();
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
  );

  const menu = createMenuOverlay(app, () => {
    suppressPauseOverlay = false;
    hud.setRelockVisible(false);
    player.lock();
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
    if (player.isLocked()) drinkStations.pickDigit(digit);
  });
  input.onKey('KeyY', () => {
    if (player.isLocked()) shiftManager.confirmEarlyClose(true);
  });
  input.onKey('KeyN', () => {
    if (player.isLocked()) shiftManager.confirmEarlyClose(false);
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
      staffManager.update(dt, shiftState);
    }
  });
}

bootstrap();
