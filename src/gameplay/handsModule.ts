import { emitHandThrowKey, emitHandUse, emitPourBackKey } from '../core/handInput.ts';
import {
  HAND_PRIORITY,
  KEY_POUR_BACK,
  KEY_THROW_LEFT,
  KEY_THROW_RIGHT,
} from '../state/constantsHands.ts';
import { clearHands, findCupHand, type HandId, type HandsState } from '../state/hands.ts';
import { createHandsHud } from '../ui/handsHud.ts';
import { initHandViewmodel, setHandSwing } from '../world/handViewmodel.ts';
import type { GameCtx, Phase6Module } from './gameCtx.ts';

function slotSignature(item: HandsState[HandId]): string {
  if (!item) return 'none';
  if (item.kind !== 'cup') return item.kind;
  const c = item.cup;
  return `cup:${c.base ?? ''}:${c.sugar ?? ''}:${c.ice ?? ''}:${c.topping ?? ''}:${c.sealed ? 1 : 0}`;
}

function handsSignature(hands: HandsState): string {
  return `${slotSignature(hands.right)}|${slotSignature(hands.left)}`;
}

// Khởi tạo module hai tay: đồng bộ HUD/viewmodel, bắt chuột/phím ném/đổ và hủy giữ khi mất khóa
export function initHandsModule(ctx: GameCtx): Phase6Module {
  const handsHud = createHandsHud(ctx.app);
  initHandViewmodel(ctx);

  const heldUse: Record<HandId, boolean> = { right: false, left: false };
  const heldThrow: Record<HandId, boolean> = { right: false, left: false };
  let lastSig = '';
  let hadCup = false;

  const isOverlayOpen = () =>
    ctx.app.querySelector(
      '.menu-overlay:not(.hidden), .panel-overlay:not(.hidden), .complaint-popup:not(.hidden), .level-picker:not(.hidden)',
    ) !== null;

  const isPointerLocked = () =>
    ctx.player.isLocked() && document.pointerLockElement === ctx.renderer.domElement;

  const isInputBlocked = () => !isPointerLocked() || isOverlayOpen();

  const releaseAllHeld = () => {
    for (const hand of HAND_PRIORITY) {
      if (heldUse[hand]) {
        heldUse[hand] = false;
        emitHandUse(hand, 'up');
      }
      if (heldThrow[hand]) {
        heldThrow[hand] = false;
        emitHandThrowKey(hand, 'up');
      }
    }
  };

  const syncHandsUi = (force = false) => {
    const hands = ctx.gameStore.getState().hands;
    const sig = handsSignature(hands);
    if (!force && sig === lastSig) return;
    lastSig = sig;
    const cupHand = findCupHand(hands);
    const cupItem = cupHand ? hands[cupHand] : null;
    const cup = cupItem?.kind === 'cup' ? cupItem.cup : null;
    if (hadCup && !cup) ctx.drinkStations.closePicker();
    hadCup = cup !== null;
    ctx.heldCupUi.render(cup);
    handsHud.render(hands);
  };

  const mouseHand = (button: number): HandId | null =>
    button === 0 ? 'right' : button === 2 ? 'left' : null;

  const onMouseDown = (event: MouseEvent) => {
    if (isInputBlocked()) return;
    const hand = mouseHand(event.button);
    if (!hand || heldUse[hand]) return;
    heldUse[hand] = true;
    emitHandUse(hand, 'down');
  };

  const onMouseUp = (event: MouseEvent) => {
    const hand = mouseHand(event.button);
    if (!hand || !heldUse[hand]) return;
    heldUse[hand] = false;
    emitHandUse(hand, 'up');
  };

  const onContextMenu = (event: MouseEvent) => {
    const menuOrPanelOpen =
      ctx.app.querySelector('.menu-overlay:not(.hidden), .panel-overlay:not(.hidden)') !== null;
    if (isPointerLocked() || (event.target === ctx.renderer.domElement && !menuOrPanelOpen)) {
      event.preventDefault();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || isInputBlocked()) return;
    if (event.code === KEY_THROW_RIGHT) {
      if (heldThrow.right) return;
      heldThrow.right = true;
      emitHandThrowKey('right', 'down');
    } else if (event.code === KEY_THROW_LEFT) {
      if (heldThrow.left) return;
      heldThrow.left = true;
      emitHandThrowKey('left', 'down');
    } else if (event.code === KEY_POUR_BACK) {
      emitPourBackKey();
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code === KEY_THROW_RIGHT && heldThrow.right) {
      heldThrow.right = false;
      emitHandThrowKey('right', 'up');
    } else if (event.code === KEY_THROW_LEFT && heldThrow.left) {
      heldThrow.left = false;
      emitHandThrowKey('left', 'up');
    }
  };

  const onPointerLockChange = () => {
    if (!isPointerLocked()) releaseAllHeld();
  };

  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAllHeld);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  ctx.eventBus.on('state:changed', () => syncHandsUi());

  syncHandsUi(true);

  return {
    update() {
      if (isInputBlocked()) releaseAllHeld();
      syncHandsUi();
    },

    reset() {
      releaseAllHeld();
      setHandSwing('right', false);
      setHandSwing('left', false);
      const hands = ctx.gameStore.getState().hands;
      clearHands(hands);
      ctx.gameStore.updateState({ hands });
      ctx.drinkStations.closePicker();
      syncHandsUi(true);
    },
  };
}
