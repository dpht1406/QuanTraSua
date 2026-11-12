import './style.css';
import './ui/gameplayHud.css';
import './ui/panels.css';
import './ui/staffPanel.css';
import { getSafeLocalStorage, initStoresAndSave } from './core/bootstrap.ts';
import { setupShopSystems } from './core/bootstrapGame.ts';
import { startGameLoop } from './core/gameLoop.ts';
import { createInput } from './core/input.ts';
import { createSceneSetup } from './core/sceneSetup.ts';
import { getWorldBounds } from './core/worldBounds.ts';
import type { GameCtx } from './gameplay/gameCtx.ts';
import { initPhase6Modules } from './gameplay/gameWiring.ts';
import { createActorBodies } from './physics/actorBodies.ts';
import { buildStaticWorld } from './physics/buildStaticWorld.ts';
import { createFurnitureBodies } from './physics/furnitureBodies.ts';
import { createPhysicsDebug } from './physics/physicsDebug.ts';
import { updateBoundMeshes } from './physics/physicsSync.ts';
import { createPhysicsWorld } from './physics/physicsWorld.ts';
import { createPlayerBody } from './physics/playerBody.ts';
import { gameStore } from './state/gameState.ts';
import { loadGraphicsQuality } from './state/graphicsQuality.ts';
import { createCustomerActor } from './world/customer.ts';
import { createPedestrians } from './world/pedestrians.ts';
import { createShopWorld } from './world/shopWorld.ts';
import { createStreet } from './world/streetWorld.ts';

function showPhysicsLoading(app: HTMLElement): HTMLElement {
  const el = document.createElement('div');
  el.textContent = 'Đang tải vật lý...';
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    display: 'grid',
    placeItems: 'center',
    background: '#fff8f0',
    color: '#5c4033',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    zIndex: '9999',
  });
  app.appendChild(el);
  return el;
}

// Khởi tạo thế giới vật lý Rapier, cảnh 3D, tương tác, nhân viên và vòng lặp chính
async function bootstrap() {
  const app = document.getElementById('app');
  if (!app) throw new Error('Không tìm thấy phần tử #app');

  const loadingEl = showPhysicsLoading(app);
  const physics = await createPhysicsWorld().finally(() => loadingEl.remove());

  const initialQuality = loadGraphicsQuality(getSafeLocalStorage());
  const { scene, camera, renderer, lighting } = createSceneSetup(app, {
    initialQuality,
    shadowBounds: getWorldBounds(),
  });
  const input = createInput();

  const syncCleanRef: { current: (() => void) | null } = { current: null };
  const stores = initStoresAndSave(app, () => syncCleanRef.current?.());

  const world = createShopWorld((message) => {
    gameStore.bus.emit('toast:show', { message });
  });
  scene.add(world.root);

  const street = createStreet(scene, initialQuality);
  const pedestrians = createPedestrians(scene, initialQuality);

  const customer = createCustomerActor();
  scene.add(customer.root);

  const playerBody = createPlayerBody(physics, { x: 0, y: 0, z: 1.8 });
  const actorBodies = createActorBodies(physics);
  const furnitureBodies = createFurnitureBodies(physics, world);
  const physicsDebug = createPhysicsDebug(scene, physics);

  const sys = setupShopSystems({
    app,
    scene,
    camera,
    renderer,
    lighting,
    input,
    initialQuality,
    world,
    customer,
    stores,
    onCleanlinessSyncRef: syncCleanRef,
    playerBody,
    onQualityChange: (q) => {
      street.setQuality(q);
      pedestrians.setQuality(q);
    },
    onDimmedChange: (dimmed) => {
      street.setDimmed?.(dimmed);
    },
  });

  const loopTicks = new Set<(dt: number) => void>();
  const postPhysicsTicks = new Set<(dt: number) => void>();
  const ctx: GameCtx = {
    app,
    scene,
    camera,
    renderer,
    lighting,
    player: sys.player,
    input,
    interaction: sys.interaction,
    colliders: world.colliders,
    shopWorld: world,
    street,
    pedestrians,
    customer,
    physics,
    playerBody,
    actorBodies,
    furnitureBodies,
    eventBus: gameStore.bus,
    gameStore,
    storage: stores.storage,
    loadedSave: stores.loaded,
    inventory: stores.inventory,
    cleanliness: stores.cleanliness,
    cleanlinessView: sys.cleanlinessView,
    staffStore: stores.staffStore,
    staffManager: sys.staffManager,
    orderManager: sys.orderManager,
    shiftManager: sys.shiftManager,
    drinkStations: sys.drinkStations,
    hud: sys.hud,
    heldCupUi: sys.heldCupUi,
    saveCtrl: stores.saveCtrl,
    registerTick(fn) {
      loopTicks.add(fn);
      return () => loopTicks.delete(fn);
    },
    registerPostPhysicsTick(fn) {
      postPhysicsTicks.add(fn);
      return () => postPhysicsTicks.delete(fn);
    },
  };
  initPhase6Modules(ctx);
  const syncShopOpenSign = (open: boolean) => {
    world.setShopOpen?.(open);
    street.setShopOpen?.(open);
  };
  syncShopOpenSign(gameStore.getState().shiftState === 'open');
  gameStore.bus.on('shiftOpened', () => syncShopOpenSign(true));
  gameStore.bus.on('shiftClosed', () => syncShopOpenSign(false));

  buildStaticWorld(physics, world.colliders, { streetColliders: street.colliders });
  physics.world.propagateModifiedBodyPositionsToColliders();

  startGameLoop(scene, camera, renderer, (dt) => {
    sys.fpsMeter.update();
    lighting.update?.(dt);
    sys.player.update(dt);
    if (sys.player.isLocked()) {
      sys.interaction.update(dt, input.isDown('KeyE'));
      const target = sys.interaction.getCurrentTarget()?.target ?? null;
      sys.drinkStations.syncTarget(target);
      sys.shiftManager.syncTarget(target);
      sys.shiftManager.update(dt);
      sys.orderManager.update(dt);
      const shiftState = gameStore.getState().shiftState;
      stores.cleanliness.update(dt, shiftState);
      sys.shopEvents.update(dt, shiftState, sys.orderManager.getActiveOrder());
      sys.staffManager.update(dt, shiftState);
      street.update(dt);
      pedestrians.update(dt);
      for (const tick of loopTicks) tick(dt);
      actorBodies.sync(customer, sys.staffManager.getActors());
      physics.step(dt);
      for (const tick of postPhysicsTicks) tick(dt);
      furnitureBodies.update(dt);
    } else {
      actorBodies.sync(customer, sys.staffManager.getActors());
    }
    updateBoundMeshes(physics.alpha);
    sys.player.syncAfterPhysics?.(physics.alpha);
    sys.playerAvatar.update(dt);
    physicsDebug.update();
  });
}

void bootstrap().catch((err) => {
  console.error('Không thể khởi chạy game:', err);
});
