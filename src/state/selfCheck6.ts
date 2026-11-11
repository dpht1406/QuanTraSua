import assert from 'node:assert/strict';
import { createEventBus } from './eventBus.ts';
import type { GameEvents } from './gameState.ts';
import { createReputationStore } from './reputation.ts';
import { runSelfCheck6a } from './selfCheck6a.ts';
import { runSelfCheck6b } from './selfCheck6b.ts';
import { runSelfCheck6c } from './selfCheck6c.ts';
import { runSelfCheck6d } from './selfCheck6d.ts';
import { runSelfCheck6e } from './selfCheck6e.ts';
import { runSelfCheck6f } from './selfCheck6f.ts';

// Chạy toàn bộ các bài tự kiểm tra Giai đoạn 6 (6a..6f) và hợp đồng đồng bộ liên module
export function runSelfCheck6(): void {
  runSelfCheck6a();
  runSelfCheck6b();
  runSelfCheck6c();
  runSelfCheck6d();
  runSelfCheck6e();
  runSelfCheck6f();

  // Kiểm tra reputationStore tự đồng bộ khi nhận sự kiện reputationChanged từ module GĐ6
  const bus = createEventBus<GameEvents>();
  const rep = createReputationStore(bus, { initialValue: 50 });
  bus.emit('shiftOpened', { day: 1 });
  bus.emit('reputationChanged', { value: 38, delta: -12, reason: 'bi_nem' });
  assert.equal(rep.getValue(), 38);
  assert.equal(rep.getShiftDelta(), -12);
  assert.equal(rep.recordGreet(), 39);
}
