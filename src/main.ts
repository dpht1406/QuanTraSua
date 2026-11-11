import './style.css';
import './ui/gameplayHud.css';
import { startGameLoop } from './core/gameLoop.ts';
import { createInput } from './core/input.ts';
import { createSceneSetup } from './core/sceneSetup.ts';
import { createDrinkStations } from './gameplay/drinkStations.ts';
import { createOrderManager } from './gameplay/orderManager.ts';
import { createInteractionSystem } from './interaction/interactionSystem.ts';
import { createFirstPersonController } from './player/firstPersonController.ts';
import { gameStore } from './state/gameState.ts';
import { createHeldCupView } from './ui/heldCup.ts';
import { createHud } from './ui/hud.ts';
import { createLevelPicker } from './ui/levelPicker.ts';
import { createMenuOverlay } from './ui/menuOverlay.ts';
import { createOrderTicket } from './ui/orderTicket.ts';
import { createCustomerActor } from './world/customer.ts';
import { createShopWorld } from './world/shopWorld.ts';

// Khởi tạo toàn bộ game Giai đoạn 2 và kết nối vòng lặp pha chế - phục vụ khách
function bootstrap() {
  const app = document.getElementById('app');
  if (!app) throw new Error('Không tìm thấy phần tử #app');

  const { scene, camera, renderer } = createSceneSetup(app);
  const input = createInput();

  const world = createShopWorld((message) => {
    gameStore.bus.emit('toast:show', { message });
  });
  scene.add(world.root);

  const customer = createCustomerActor();
  scene.add(customer.root);

  const hud = createHud(app, gameStore.getState(), gameStore.bus);
  const orderTicket = createOrderTicket(app);
  const levelPicker = createLevelPicker(app);
  const heldCupUi = createHeldCupView(app);

  const orderManager = createOrderManager(
    customer,
    gameStore.bus,
    (view) => orderTicket.setOrder(view),
    (text, positive) => orderTicket.showResult(text, positive),
  );

  const drinkStations = createDrinkStations(
    world.stations,
    orderManager,
    gameStore.bus,
    heldCupUi,
    levelPicker,
  );

  const interaction = createInteractionSystem(
    camera,
    [...drinkStations.interactables, ...world.interactables],
    (label) => hud.setPrompt(label),
  );

  let menu: ReturnType<typeof createMenuOverlay>;
  const player = createFirstPersonController(
    camera,
    renderer.domElement,
    input,
    world.colliders,
    (locked) => {
      hud.setLocked(locked);
      menu.setLocked(locked);
      if (!locked) drinkStations.closePicker();
    },
  );

  menu = createMenuOverlay(app, () => player.lock());

  input.onInteract(() => {
    if (player.isLocked()) interaction.trigger();
  });

  input.onDigit((digit) => {
    if (player.isLocked()) drinkStations.pickDigit(digit);
  });

  startGameLoop(scene, camera, renderer, (dt) => {
    player.update(dt);
    if (player.isLocked()) {
      interaction.update();
      drinkStations.syncTarget(interaction.getCurrentTarget()?.target ?? null);
      orderManager.update(dt);
    }
  });
}

bootstrap();
