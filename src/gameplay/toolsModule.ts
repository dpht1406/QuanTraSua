import * as THREE from 'three';
import { onHandUse } from '../core/handInput.ts';
import type { StainKind } from '../state/cleanliness.ts';
import { CLEAN_HOLD_SEC } from '../state/constants.ts';
import { HAND_PRIORITY } from '../state/constantsHands.ts';
import {
  findHand,
  getHeld,
  pickUp,
  removeFrom,
  type HandId,
  type HandsState,
} from '../state/hands.ts';
import { getLocation, resetAllToRack, setLocation, type ToolKind } from '../state/toolLocations.ts';
import { checkToolUse, findAimedStain, isStainInAim } from '../state/toolUse.ts';
import { setHandSwing } from '../world/handViewmodel.ts';
import { createToolRack } from '../world/toolRack.ts';
import type { GameCtx, Phase6Module } from './gameCtx.ts';

interface CleaningSession {
  hand: HandId;
  toolKind: ToolKind;
  stainId: string;
  stainKind: StainKind;
  elapsed: number;
  duration: number;
}

const TOOL_NAMES: Record<ToolKind, string> = {
  broom: 'chổi',
  mop: 'cây lau nhà',
};

const CLEAN_DONE_MSG: Partial<Record<StainKind, string>> = {
  spill: 'Đã lau sạch vết đổ!',
  trash: 'Đã dọn rác trên sàn!',
  dirty_table: 'Đã lau sạch bàn!',
};

function findStoreTarget(
  hands: HandsState,
  preferred: ToolKind,
): { hand: HandId; kind: ToolKind } | null {
  const preferredHand = findHand(hands, preferred);
  if (preferredHand) return { hand: preferredHand, kind: preferred };
  for (const hand of HAND_PRIORITY) {
    const item = hands[hand];
    if (item && (item.kind === 'broom' || item.kind === 'mop')) {
      return { hand, kind: item.kind };
    }
  }
  return null;
}

// Khởi tạo giá treo dụng cụ, nhặt/cất qua E và quét/lau vết bẩn bằng giữ chuột đúng dụng cụ
export function initToolsModule(ctx: GameCtx): Phase6Module {
  let active: CleaningSession | null = null;
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  const cancelCleaning = () => {
    if (!active) return;
    setHandSwing(active.hand, false);
    active = null;
    ctx.hud.setHoldProgress(null);
  };

  const rack = createToolRack(ctx, {
    getSlotLabel(slotKind) {
      const state = ctx.gameStore.getState();
      if (getLocation(state.tools, slotKind) === 'rack') {
        return `Lấy ${TOOL_NAMES[slotKind]}`;
      }
      const toStore = findStoreTarget(state.hands, slotKind);
      return toStore ? `Cất ${TOOL_NAMES[toStore.kind]}` : `Giá treo ${TOOL_NAMES[slotKind]} (trống)`;
    },

    onSlotInteract(slotKind) {
      const state = ctx.gameStore.getState();
      if (getLocation(state.tools, slotKind) === 'rack') {
        const res = pickUp(state.hands, { kind: slotKind });
        if (!res.ok) {
          ctx.hud.showHint('Tay đầy');
          return;
        }
        setLocation(state.tools, slotKind, 'hand');
        ctx.gameStore.updateState({ hands: state.hands, tools: state.tools });
        rack.sync(state.tools);
        return;
      }

      const toStore = findStoreTarget(state.hands, slotKind);
      if (!toStore) {
        ctx.hud.showHint(`Không có ${TOOL_NAMES[slotKind]} trên giá`);
        return;
      }
      if (active && active.hand === toStore.hand) cancelCleaning();
      removeFrom(state.hands, toStore.hand);
      setLocation(state.tools, toStore.kind, 'rack');
      ctx.gameStore.updateState({ hands: state.hands, tools: state.tools });
      rack.sync(state.tools);
    },
  });

  rack.sync(ctx.gameStore.getState().tools);

  onHandUse((hand, phase) => {
    if (phase === 'up') {
      if (active && active.hand === hand) cancelCleaning();
      return;
    }
    if (!ctx.player.isLocked() || active) return;

    ctx.camera.getWorldPosition(camPos);
    ctx.camera.getWorldDirection(camDir);
    const stain = findAimedStain(camPos, camDir, ctx.cleanliness.getStains());
    if (!stain) return;

    const state = ctx.gameStore.getState();
    const held = getHeld(state.hands, hand);
    const check = checkToolUse(held?.kind ?? null, stain.kind);
    if (!check.ok) {
      ctx.hud.showHint(check.hint);
      return;
    }
    if (!held || (held.kind !== 'broom' && held.kind !== 'mop')) return;

    const duration = CLEAN_HOLD_SEC[stain.kind];
    if (duration <= 0) return;
    active = {
      hand,
      toolKind: held.kind,
      stainId: stain.id,
      stainKind: stain.kind,
      elapsed: 0,
      duration,
    };
    setHandSwing(hand, true);
    ctx.hud.setHoldProgress(0);
  });

  if (typeof document !== 'undefined') {
    document.addEventListener('pointerlockchange', () => {
      if (!ctx.player.isLocked()) cancelCleaning();
    });
  }

  return {
    update(dt) {
      const state = ctx.gameStore.getState();
      rack.sync(state.tools);
      if (!active) return;

      if (!ctx.player.isLocked()) {
        cancelCleaning();
        return;
      }
      const held = getHeld(state.hands, active.hand);
      if (held?.kind !== active.toolKind || getLocation(state.tools, active.toolKind) !== 'hand') {
        cancelCleaning();
        return;
      }
      const stain = ctx.cleanliness.getStains().find((s) => s.id === active?.stainId);
      if (!stain) {
        cancelCleaning();
        return;
      }

      ctx.camera.getWorldPosition(camPos);
      ctx.camera.getWorldDirection(camDir);
      if (!isStainInAim(camPos, camDir, stain).ok) {
        cancelCleaning();
        return;
      }

      active.elapsed += dt;
      if (active.elapsed >= active.duration) {
        const { hand, stainId, stainKind } = active;
        active = null;
        setHandSwing(hand, false);
        ctx.hud.setHoldProgress(null);
        if (ctx.cleanliness.cleanStain(stainId)) {
          ctx.cleanlinessView.sync();
          const msg = CLEAN_DONE_MSG[stainKind];
          if (msg) ctx.hud.showHint(msg);
        }
        return;
      }
      ctx.hud.setHoldProgress(active.elapsed / active.duration);
    },

    reset() {
      cancelCleaning();
      const state = ctx.gameStore.getState();
      resetAllToRack(state.tools);
      ctx.gameStore.updateState({ tools: state.tools });
      rack.sync(state.tools);
    },
  };
}
