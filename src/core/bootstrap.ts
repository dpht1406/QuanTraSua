import type * as THREE from 'three';
import type { InputState } from './input.ts';
import type { LightingController } from './lighting.ts';
import type { DrinkStationController } from '../gameplay/drinkStations.ts';
import type { OrderManager } from '../gameplay/orderManager.ts';
import type { ShiftManager } from '../gameplay/shiftManager.ts';
import type { GraphicsQuality } from '../state/graphicsQuality.ts';
import type { StorageLike } from '../state/save.ts';
import { TUTORIAL_SKIP_KEY } from '../state/tutorial.ts';
import { createFpsMeter } from '../ui/fpsMeter.ts';
import { createGraphicsSettingsControl } from '../ui/graphicsSettings.ts';
import type { MenuOverlay } from '../ui/menuOverlay.ts';
import { createPlayerAvatar, type PlayerAvatar } from '../world/playerAvatar.ts';

export { createShopPanels, getSafeLocalStorage, initStoresAndSave } from './bootstrapStores.ts';

export interface PlayerAvatarController extends PlayerAvatar {
  toggleSelfView(): boolean;
  isSelfVisible(): boolean;
}

// Khởi tạo avatar mèo cho người chơi (mặc định ẩn với chính mình, nhấn V để bật/tắt kiểm tra)
export function initPlayerAvatar(
  scene: THREE.Scene,
  camera: THREE.Camera,
): PlayerAvatarController {
  const avatar = createPlayerAvatar(scene, camera);
  let selfVisible = false;
  avatar.setVisibleToSelf(selfVisible);

  return {
    update: (dt) => avatar.update(dt),
    setVisibleToSelf: (visible) => {
      selfVisible = visible;
      avatar.setVisibleToSelf(visible);
    },
    toggleSelfView: () => {
      selfVisible = !selfVisible;
      avatar.setVisibleToSelf(selfVisible);
      return selfVisible;
    },
    isSelfVisible: () => selfVisible,
    dispose: () => avatar.dispose(),
  };
}

// Gắn các phím tắt điều khiển tương tác, chọn số, chào khách, đóng ca và thoát bảng
export function bindGameInput(
  input: InputState,
  deps: {
    isLocked: () => boolean;
    triggerInteract: () => void;
    shopEvents: { handleDigit(digit: 1 | 2 | 3): boolean };
    drinkStations: Pick<DrinkStationController, 'pickDigit'>;
    orderManager: Pick<OrderManager, 'tryGreet'>;
    shiftManager: Pick<ShiftManager, 'confirmEarlyClose'>;
    tutorial: { isActive(): boolean; skip(): void };
    isMenuOpen: () => boolean;
    onEscape: () => void;
    onToggleAvatar?: () => void;
  },
) {
  input.onInteract(() => {
    if (deps.isLocked()) deps.triggerInteract();
  });
  input.onDigit((digit) => {
    if (!deps.isLocked()) return;
    if (!deps.shopEvents.handleDigit(digit)) deps.drinkStations.pickDigit(digit);
  });
  input.onKey('KeyG', () => {
    if (deps.isLocked()) deps.orderManager.tryGreet();
  });
  input.onKey('KeyY', () => {
    if (deps.isLocked()) deps.shiftManager.confirmEarlyClose(true);
  });
  input.onKey('KeyN', () => {
    if (deps.isLocked()) deps.shiftManager.confirmEarlyClose(false);
  });
  input.onKey('KeyV', () => {
    if (deps.isLocked()) deps.onToggleAvatar?.();
  });
  input.onKey(TUTORIAL_SKIP_KEY, () => {
    if (deps.tutorial.isActive() && !deps.isMenuOpen()) deps.tutorial.skip();
  });
  input.onKey('Escape', deps.onEscape);
}

// Khởi tạo nút chọn chất lượng đồ họa trong menu và công cụ đo FPS (F3)
export function initGraphicsUi(
  app: HTMLElement,
  menu: MenuOverlay,
  deps: {
    renderer: THREE.WebGLRenderer;
    lighting: Pick<LightingController, 'setQuality'>;
    storage: StorageLike | null | undefined;
    initialQuality: GraphicsQuality;
    onLowFpsHint: (message: string) => void;
    onQualityChange?: (quality: GraphicsQuality) => void;
  },
) {
  const fpsMeter = createFpsMeter(app, {
    initialQuality: deps.initialQuality,
    onLowFpsHint: deps.onLowFpsHint,
  });

  const graphicsSettings = createGraphicsSettingsControl(menu.getActionsContainer(), {
    renderer: deps.renderer,
    lighting: deps.lighting,
    storage: deps.storage,
    initialQuality: deps.initialQuality,
    onQualityChange: (q) => {
      fpsMeter.setQuality(q);
      deps.onQualityChange?.(q);
    },
  });

  return { fpsMeter, graphicsSettings };
}
