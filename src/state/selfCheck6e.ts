import assert from 'node:assert/strict';
import {
  emitHandThrowKey,
  emitHandUse,
  emitPourBackKey,
  onHandThrowKey,
  onHandUse,
  onPourBackKey,
} from '../core/handInput.ts';
import {
  clearHands,
  createHands,
  findCupHand,
  getHeld,
  isFull,
  pickUp,
  removeFrom,
  type HandId,
} from './hands.ts';
import { createEmptyCup } from './scoring.ts';

// Tự kiểm tra GĐ6e (Tab 2): thao tác hai tay, ly ở tay trái/phải và luồng sự kiện input chuột/phím
export function runSelfCheck6e(): void {
  // 1. Ly có thể nằm ở tay phải hoặc tay trái và findCupHand tìm đúng tay đang cầm
  const hands = createHands();
  assert.deepEqual(pickUp(hands, { kind: 'broom' }), { ok: true, hand: 'right' });
  const cup = createEmptyCup();
  cup.base = 'peach';
  assert.deepEqual(pickUp(hands, { kind: 'cup', cup }), { ok: true, hand: 'left' });
  assert.equal(findCupHand(hands), 'left');
  assert.equal(getHeld(hands, 'left')?.kind, 'cup');

  // Đã cầm 1 ly nhưng tay phải trống -> cup_limit; hai tay đầy -> full
  assert.equal(removeFrom(hands, 'right')?.kind, 'broom');
  assert.deepEqual(pickUp(hands, { kind: 'cup', cup: createEmptyCup() }), {
    ok: false,
    reason: 'cup_limit',
  });
  assert.deepEqual(pickUp(hands, { kind: 'mop' }), { ok: true, hand: 'right' });
  assert.equal(isFull(hands), true);
  assert.deepEqual(pickUp(hands, { kind: 'cup', cup: createEmptyCup() }), {
    ok: false,
    reason: 'full',
  });

  // Giao/bỏ ly ở tay trái chỉ làm trống tay trái, giữ nguyên dụng cụ ở tay phải
  assert.equal(removeFrom(hands, 'left')?.kind, 'cup');
  assert.equal(findCupHand(hands), null);
  assert.equal(getHeld(hands, 'right')?.kind, 'mop');

  // Reset hai tay khi kết ca / tải save
  clearHands(hands);
  assert.equal(getHeld(hands, 'right'), null);
  assert.equal(getHeld(hands, 'left'), null);

  // 2. Bus input tay phải/trái (chuột dùng, F/Q ném, R đổ ngược)
  const useLog: Array<[HandId, 'down' | 'up']> = [];
  const throwLog: Array<[HandId, 'down' | 'up']> = [];
  let pourCount = 0;

  const offUse = onHandUse((hand, phase) => useLog.push([hand, phase]));
  const offThrow = onHandThrowKey((hand, phase) => throwLog.push([hand, phase]));
  const offPour = onPourBackKey(() => {
    pourCount += 1;
  });

  emitHandUse('right', 'down');
  emitHandUse('right', 'up');
  emitHandUse('left', 'down');
  emitHandThrowKey('right', 'down');
  emitHandThrowKey('left', 'up');
  emitPourBackKey();

  assert.deepEqual(useLog, [
    ['right', 'down'],
    ['right', 'up'],
    ['left', 'down'],
  ]);
  assert.deepEqual(throwLog, [
    ['right', 'down'],
    ['left', 'up'],
  ]);
  assert.equal(pourCount, 1);

  offUse();
  offThrow();
  offPour();

  emitHandUse('right', 'down');
  emitHandThrowKey('right', 'down');
  emitPourBackKey();
  assert.equal(useLog.length, 3);
  assert.equal(throwLog.length, 2);
  assert.equal(pourCount, 1);
}
