import './style.css';
import { startGameLoop } from './core/gameLoop.ts';
import { createInput } from './core/input.ts';
import { createSceneSetup } from './core/sceneSetup.ts';
import { createInteractionSystem } from './interaction/interactionSystem.ts';
import { createFirstPersonController } from './player/firstPersonController.ts';
import { gameStore } from './state/gameState.ts';
import { createHud } from './ui/hud.ts';
import { createMenuOverlay } from './ui/menuOverlay.ts';
import { createShopWorld } from './world/shopWorld.ts';

// Khởi tạo toàn bộ game Giai đoạn 1 và gắn kết các module
function bootstrap() {
  const app = document.getElementById('app');
  if (!app) throw new Error('Không tìm thấy phần tử #app');

  const { scene, camera, renderer } = createSceneSetup(app);
  const input = createInput();

  const world = createShopWorld((message) => {
    gameStore.bus.emit('toast:show', { message });
  });
  scene.add(world.root);

  const hud = createHud(app, gameStore.getState(), gameStore.bus);
  const interaction = createInteractionSystem(camera, world.interactables, (label) => {
    hud.setPrompt(label);
  });

  let menu: ReturnType<typeof createMenuOverlay>;
  const player = createFirstPersonController(
    camera,
    renderer.domElement,
    input,
    world.colliders,
    (locked) => {
      hud.setLocked(locked);
      menu.setLocked(locked);
    },
  );

  menu = createMenuOverlay(app, () => player.lock());

  input.onInteract(() => {
    if (player.isLocked()) {
      interaction.trigger();
    }
  });

  startGameLoop(scene, camera, renderer, (dt) => {
    player.update(dt);
    if (player.isLocked()) {
      interaction.update();
    }
  });
}

bootstrap();
