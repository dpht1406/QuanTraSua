import { HAND_PRIORITY, MAX_CUPS_IN_HANDS } from './constantsHands.ts';
import type { Cup } from './scoring.ts';

export type HandId = 'right' | 'left';
export type HeldItem = { kind: 'cup'; cup: Cup } | { kind: 'broom' } | { kind: 'mop' };
export type HeldItemKind = HeldItem['kind'];
export type HandsState = Record<HandId, HeldItem | null>;
export type PickUpResult =
  | { ok: true; hand: HandId }
  | { ok: false; reason: 'full' | 'cup_limit' };

// Tạo trạng thái hai tay rỗng ban đầu
export function createHands(): HandsState {
  return { right: null, left: null };
}

// Nhặt vật vào tay trống (ưu tiên tay phải, tối đa 1 ly trong cả hai tay)
export function pickUp(hands: HandsState, item: HeldItem): PickUpResult {
  const freeHand = HAND_PRIORITY.find((h) => hands[h] === null) ?? null;
  if (!freeHand) return { ok: false, reason: 'full' };

  if (item.kind === 'cup') {
    const cupCount = HAND_PRIORITY.filter((h) => hands[h]?.kind === 'cup').length;
    if (cupCount >= MAX_CUPS_IN_HANDS) return { ok: false, reason: 'cup_limit' };
  }

  hands[freeHand] = item;
  return { ok: true, hand: freeHand };
}

export function getHeld(hands: HandsState, hand: HandId): HeldItem | null {
  return hands[hand];
}

export function findHand(hands: HandsState, kind: HeldItemKind): HandId | null {
  for (const hand of HAND_PRIORITY) {
    if (hands[hand]?.kind === kind) return hand;
  }
  return null;
}

export function findCupHand(hands: HandsState): HandId | null {
  return findHand(hands, 'cup');
}

export function removeFrom(hands: HandsState, hand: HandId): HeldItem | null {
  const item = hands[hand];
  hands[hand] = null;
  return item;
}

export function clearHands(hands: HandsState): void {
  hands.right = null;
  hands.left = null;
}

export function isFull(hands: HandsState): boolean {
  return hands.right !== null && hands.left !== null;
}
