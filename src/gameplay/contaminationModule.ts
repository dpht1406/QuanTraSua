import { onPourBackKey } from '../core/handInput.ts';
import { INVENTORY_CONFIG } from '../state/constants.ts';
import {
  calcCupComplaintBonus,
  performPourBack,
  spoilContaminatedStock,
} from '../state/contamination.ts';
import { findCupHand, getHeld } from '../state/hands.ts';
import { clampReputation } from '../state/reputation.ts';
import { createContaminationHud } from '../ui/contaminationHud.ts';
import { setRestockContaminationProvider } from '../ui/restockPanel.ts';
import type { GameCtx, Phase6Module } from './gameCtx.ts';
import { getFocusedStation } from './stationLookup.ts';

// Khởi tạo module đổ ngược nguyên liệu, nhiễm chéo và cảnh báo HUD/nhập hàng
export function initContaminationModule(ctx: GameCtx): Phase6Module {
  const badge = createContaminationHud(ctx.app);
  const syncBadge = () => badge.sync(ctx.inventory.getContamination());

  setRestockContaminationProvider(() => ctx.inventory.getContamination());
  ctx.orderManager.setComplaintBonusProvider((cup) =>
    calcCupComplaintBonus(cup, ctx.inventory.getContamination()),
  );

  ctx.shiftManager.setBeforeShiftEnd(() => {
    const spoiled = spoilContaminatedStock(ctx.inventory, ctx.eventBus);
    if (spoiled.length === 0) return;
    const summary = spoiled.map((s) => `${INVENTORY_CONFIG[s.item].label} -${s.lost}`).join(', ');
    ctx.eventBus.emit('toast:show', { message: `Hỏng nguyên liệu cuối ca: ${summary}` });
  });

  onPourBackKey(() => {
    const state = ctx.gameStore.getState();
    const hands = state.hands;
    const cupHand = findCupHand(hands);
    const held = cupHand ? getHeld(hands, cupHand) : null;
    const cup = held?.kind === 'cup' ? held.cup : null;
    const focused = getFocusedStation();

    if (!cup) {
      if (focused || state.shiftState === 'open' || state.shiftState === 'closing') {
        ctx.hud.showHint('Bạn chưa cầm ly để đổ ngược!');
      }
      return;
    }
    if (!focused) {
      ctx.hud.showHint('Hãy nhìn vào trạm nguyên liệu tương ứng để đổ ngược!');
      return;
    }

    const hasCustomer = ctx.orderManager.hasCustomerAtCounter();
    const { pour, reputationDelta } = performPourBack(
      cup,
      focused.step,
      ctx.inventory,
      hasCustomer,
      ctx.eventBus,
    );
    if (!pour.ok) {
      const msg =
        pour.reason === 'sealed'
          ? 'Ly đã đậy nắp, không thể đổ ngược!'
          : pour.reason === 'empty_step'
            ? 'Bước này không dùng nguyên liệu để đổ ngược!'
            : 'Ly chưa có nguyên liệu của trạm này!';
      ctx.hud.showHint(msg);
      return;
    }

    ctx.drinkStations.closePicker();
    ctx.gameStore.updateState({ hands: { ...hands } });
    ctx.heldCupUi.render(cup);

    const label = INVENTORY_CONFIG[pour.item].label;
    const levelPct = Math.round(pour.level);
    if (hasCustomer) {
      const prevRep = ctx.gameStore.getState().reputation;
      const nextRep = clampReputation(prevRep + reputationDelta);
      const actualDelta = nextRep - prevRep;
      if (actualDelta !== 0) {
        ctx.gameStore.updateState({ reputation: nextRep });
        ctx.eventBus.emit('reputationChanged', {
          value: nextRep,
          delta: actualDelta,
          reason: 'do_nguyen_lieu',
        });
      }
      const repNote = actualDelta !== 0 ? `${actualDelta} uy tín` : 'uy tín đã chạm 0';
      ctx.hud.showHint(`Khách thấy bạn đổ ${label}! (${repNote}, nhiễm ${levelPct}%)`);
      return;
    }

    ctx.hud.showHint(`Đã đổ ngược ${label} (nhiễm ${levelPct}%)`);
  });

  ctx.eventBus.on('ingredientContaminated', syncBadge);
  ctx.eventBus.on('shiftOpened', syncBadge);
  ctx.eventBus.on('stockChanged', () => {
    const shift = ctx.gameStore.getState().shiftState;
    if (shift === 'open' || shift === 'closing') syncBadge();
  });

  return {
    update() {},
    reset() {
      badge.hide();
    },
  };
}
