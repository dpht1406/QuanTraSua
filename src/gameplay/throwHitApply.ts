import { isInsideShop } from '../core/worldBounds.ts';
import type { ProjectileSimEvent } from '../physics/projectileSim.ts';
import {
  DROP_POWER,
  MAX_CHARGE_SEC,
  MAX_THROW_POWER,
  MIN_THROW_POWER,
  TAP_SEC,
} from '../state/constantsThrow.ts';
import type { GameEventReason, ThrowObjectKind } from '../state/gameState.ts';
import { clampReputation } from '../state/reputation.ts';
import type { createStaffHitTracker } from '../state/staffStun.ts';
import { discardCupInBin } from './cupDisposal.ts';
import type { GameCtx } from './gameCtx.ts';

export function throwItemLabel(kind: ThrowObjectKind): string {
  return kind === 'cup' ? 'Nhặt ly' : kind === 'broom' ? 'Nhặt chổi' : 'Nhặt cây lau';
}

export function computeThrowPower(elapsed: number): { isTap: boolean; power: number } {
  if (elapsed < TAP_SEC) return { isTap: true, power: DROP_POWER };
  const ratio = Math.min(1, (elapsed - TAP_SEC) / Math.max(0.01, MAX_CHARGE_SEC - TAP_SEC));
  return { isTap: false, power: MIN_THROW_POWER + ratio * (MAX_THROW_POWER - MIN_THROW_POWER) };
}

// Áp dụng hậu quả gameplay khi vật ném va chạm khách, nhân viên, sàn hoặc thùng rác
export function applyThrowHitEvent(
  ctx: GameCtx,
  ev: Extract<ProjectileSimEvent, { type: 'hit' }>,
  hitTracker: ReturnType<typeof createStaffHitTracker>,
  removeVisual: (id: number, unregister?: boolean) => void,
): void {
  if (ev.target === 'customer' && ctx.customer.isLeaving) return;
  ctx.eventBus.emit('objectThrown', { kind: ev.item.kind, hit: ev.target });
  const res = ev.consequence;
  const hitVel = ev.hitVel ?? ev.item.vel;
  const hitDir = { x: hitVel.x, z: hitVel.z };
  if (res.customerLeaves) ctx.orderManager.forceCustomerLeave('bi_nem', hitDir);

  if (res.reputationDelta !== 0) {
    const reason: GameEventReason = ev.target === 'customer' ? 'bi_nem' : 'nhan_vien_choang';
    const prev = ctx.gameStore.getState().reputation;
    const next = clampReputation(prev + res.reputationDelta);
    ctx.gameStore.updateState({ reputation: next });
    if (next !== prev) ctx.eventBus.emit('reputationChanged', { value: next, delta: next - prev, reason });
  }

  const insideShop = isInsideShop(ev.item.pos);
  if (res.spawnSpill && insideShop) {
    ctx.cleanliness.spawnFloorStain('spill');
    ctx.cleanlinessView.sync();
  }
  if (res.binDiscard && ev.item.cup) discardCupInBin(ev.item.cup);

  const staffRole =
    ev.staffRole ??
    (ev.staffId ? ctx.staffManager.getActors().find((a) => a.member.id === ev.staffId)?.member.role : undefined);
  if (res.staffStunSec > 0 && staffRole && ev.staffId) {
    ctx.staffManager.stunStaff(staffRole, res.staffStunSec, hitDir);
    const out = hitTracker.recordHit(ev.staffId, ctx.staffStore, ctx.eventBus);
    ctx.hud.showHint(out.fired && out.staff ? `${out.staff.name} tự nghỉ vì bị ném quá nhiều lần!` : 'Nhân viên bị choáng!');
  }

  if (res.broken || res.binDiscard) removeVisual(ev.item.id);
  if (ev.target === 'customer') ctx.hud.showHint('Khách giận bỏ đi vì bị ném!');
  else if (res.broken && ev.item.kind === 'cup') {
    ctx.hud.showHint(insideShop ? 'Ly bị vỡ đổ ra sàn!' : 'Ly bị vỡ ngoài đường!');
  }
}
