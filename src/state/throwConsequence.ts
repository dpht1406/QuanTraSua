import {
  CUP_BREAK_POWER,
  REP_THROW_CUSTOMER,
  REP_THROW_STAFF_AT_COUNTER,
  STUN_SEC,
} from './constantsThrow.ts';
import type { ThrowHitTarget, ThrowObjectKind } from './gameState.ts';

export type ThrowTarget = ThrowHitTarget | 'counter';

export interface ResolveThrowInput {
  kind: ThrowObjectKind;
  target: ThrowTarget;
  power: number;
  customerAtCounter: boolean;
}

export interface ThrowConsequence {
  broken: boolean;
  spawnSpill: boolean;
  reputationDelta: number;
  customerLeaves: boolean;
  binDiscard: boolean;
  staffStunSec: number;
  restOnSurface: boolean;
}

// Tính hậu quả thuần khi vật ném/thả chạm mục tiêu
export function resolveThrow({
  kind,
  target,
  power,
  customerAtCounter,
}: ResolveThrowInput): ThrowConsequence {
  const isCup = kind === 'cup';
  const tooHard = power > CUP_BREAK_POWER;

  if (target === 'customer') {
    return {
      broken: isCup,
      spawnSpill: isCup,
      reputationDelta: -REP_THROW_CUSTOMER,
      customerLeaves: true,
      binDiscard: false,
      staffStunSec: 0,
      restOnSurface: false,
    };
  }

  if (target === 'staff') {
    const cupBroken = isCup && tooHard;
    return {
      broken: cupBroken,
      spawnSpill: cupBroken,
      reputationDelta: customerAtCounter ? -REP_THROW_STAFF_AT_COUNTER : 0,
      customerLeaves: false,
      binDiscard: false,
      staffStunSec: STUN_SEC,
      restOnSurface: false,
    };
  }

  if (target === 'bin') {
    if (!isCup) {
      return {
        broken: false,
        spawnSpill: false,
        reputationDelta: 0,
        customerLeaves: false,
        binDiscard: false,
        staffStunSec: 0,
        restOnSurface: false,
      };
    }
    return {
      broken: tooHard,
      spawnSpill: tooHard,
      reputationDelta: 0,
      customerLeaves: false,
      binDiscard: !tooHard,
      staffStunSec: 0,
      restOnSurface: false,
    };
  }

  if (target === 'floor') {
    return {
      broken: isCup,
      spawnSpill: isCup,
      reputationDelta: 0,
      customerLeaves: false,
      binDiscard: false,
      staffStunSec: 0,
      restOnSurface: !isCup,
    };
  }

  if (target === 'wall') {
    return {
      broken: isCup,
      spawnSpill: isCup,
      reputationDelta: 0,
      customerLeaves: false,
      binDiscard: false,
      staffStunSec: 0,
      restOnSurface: false,
    };
  }

  // Bàn hoặc quầy
  if (isCup) {
    return {
      broken: tooHard,
      spawnSpill: tooHard,
      reputationDelta: 0,
      customerLeaves: false,
      binDiscard: false,
      staffStunSec: 0,
      restOnSurface: !tooHard,
    };
  }

  return {
    broken: false,
    spawnSpill: false,
    reputationDelta: 0,
    customerLeaves: false,
    binDiscard: false,
    staffStunSec: 0,
    restOnSurface: false,
  };
}
