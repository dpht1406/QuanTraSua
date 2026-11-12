import type { GameEventReason } from '../state/gameState.ts';
import type { DrinkOrder } from '../state/menu.ts';
import type { Cup, ScoreResult } from '../state/scoring.ts';
import { getCustomerGapMultiplier, getCustomerGapRange } from '../state/shift.ts';
import type { FallDir } from '../world/fallPose.ts';

export interface ActiveOrderView {
  order: DrinkOrder;
  remainingSec: number;
  ratio: number;
  lockedByStaff?: string;
  isPicky?: boolean;
}

export interface OrderManagerHooks {
  getCooldownSpeed?: () => number;
  consumePicky?: () => boolean;
  onPickyFinished?: () => void;
  onGreetWindow?: (remainingSec: number | null) => void;
  onGreetSuccess?: () => void;
  onOrderDelivered?: (
    order: DrinkOrder,
    score: ScoreResult,
    payout: number,
    complaintBonus?: number,
  ) => void;
}

export interface OrderManager {
  update(dt: number): void;
  deliverCup(cup: Cup): boolean;
  deliverStaffCup(cup: Cup): boolean;
  getActiveOrder(): { order: DrinkOrder; elapsedSec: number; remainingSec: number; isPicky: boolean } | null;
  isOrderLocked(): boolean;
  lockOrder(staffName: string): boolean;
  unlockOrder(): boolean;
  tryGreet(): boolean;
  setSpawning(enabled: boolean): void;
  resetForShift(): void;
  hasActiveCustomer(): boolean;
  hasCustomerAtCounter(): boolean;
  forceCustomerLeave(reason: GameEventReason, hitDir?: FallDir): boolean;
  setComplaintBonusProvider(fn: ((cup: Cup) => number) | null): void;
}

export type CustomerPhase = 'cooldown' | 'walking_in' | 'waiting' | 'walking_out';

export function formatOrderResult(score: ScoreResult): { text: string; positive: boolean } {
  if (score.payout <= 0) {
    return { text: 'Sai món! +0đ · 1 sao', positive: false };
  }
  const formatted = new Intl.NumberFormat('vi-VN').format(score.payout);
  return { text: `+${formatted}đ · ${score.stars} sao`, positive: true };
}

export function computeCustomerCooldownSec(gameMinutes: number, reputation: number): number {
  const gap = getCustomerGapRange(gameMinutes);
  const repMult = getCustomerGapMultiplier(reputation);
  return (gap.minSec + Math.random() * (gap.maxSec - gap.minSec)) * repMult;
}
