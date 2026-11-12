import type * as THREE from 'three';
import type { InputState } from '../core/input.ts';
import type { LightingController } from '../core/lighting.ts';
import type { InteractionSystem } from '../interaction/interactionSystem.ts';
import type { ActorBodies } from '../physics/actorBodies.ts';
import type { FurnitureBodies } from '../physics/furnitureBodies.ts';
import type { PhysicsWorld } from '../physics/physicsTypes.ts';
import type { PlayerBody } from '../physics/playerBody.ts';
import type { AabbBox } from '../player/collision.ts';
import type { FirstPersonController } from '../player/firstPersonController.ts';
import type { CleanlinessStore } from '../state/cleanliness.ts';
import type { EventBus } from '../state/eventBus.ts';
import type { GameEvents, GameStore } from '../state/gameState.ts';
import type { InventoryStore } from '../state/inventory.ts';
import type { SaveController, SaveData, StorageLike } from '../state/save.ts';
import type { StaffStore } from '../state/staff.ts';
import type { HeldCupView } from '../ui/heldCup.ts';
import type { HudController } from '../ui/hud.ts';
import type { CleanlinessView } from '../world/cleanlinessView.ts';
import type { CustomerActor } from '../world/customer.ts';
import type { PedestriansController } from '../world/pedestrians.ts';
import type { ShopWorld } from '../world/shopWorld.ts';
import type { StreetWorld } from '../world/streetWorld.ts';
import type { DrinkStationController } from './drinkStations.ts';
import type { OrderManager } from './orderManager.ts';
import type { ShiftManager } from './shiftManager.ts';
import type { StaffManager } from './staffManager.ts';

export interface Phase6Module {
  update(dt: number): void;
  reset(): void;
}

export interface GameCtx {
  app: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  lighting: LightingController;
  player: FirstPersonController;
  input: InputState;
  interaction: InteractionSystem;
  colliders: AabbBox[];
  shopWorld: ShopWorld;
  street?: StreetWorld;
  pedestrians?: PedestriansController;
  customer: CustomerActor;
  physics: PhysicsWorld;
  playerBody: PlayerBody;
  actorBodies: ActorBodies;
  furnitureBodies: FurnitureBodies;
  eventBus: EventBus<GameEvents>;
  gameStore: GameStore;
  storage: StorageLike | null;
  loadedSave: SaveData | null;
  inventory: InventoryStore;
  cleanliness: CleanlinessStore;
  cleanlinessView: CleanlinessView;
  staffStore: StaffStore;
  staffManager: StaffManager;
  orderManager: OrderManager;
  shiftManager: ShiftManager;
  drinkStations: DrinkStationController;
  hud: HudController;
  heldCupUi: HeldCupView;
  saveCtrl: SaveController;
  registerTick(fn: (dt: number) => void): () => void;
  registerPostPhysicsTick?(fn: (dt: number) => void): () => void;
}
