import assert from 'node:assert/strict';
import { createCleanlinessStore, type StainItem } from './cleanliness.ts';
import { TOOL_RANGE } from './constantsTools.ts';
import { createEventBus } from './eventBus.ts';
import type { GameEvents } from './gameState.ts';
import type { HeldItemKind } from './hands.ts';
import { checkToolUse, findAimedStain, requiredTool } from './toolUse.ts';
import { createTutorialController } from './tutorial.ts';

// Tự kiểm tra GĐ6b: ánh xạ dụng cụ theo vết bẩn, tay rỗng/sai dụng cụ, tầm/nón ngắm & tiến độ tutorial bước 3
export function runSelfCheck6b(): void {
  // 1. Dụng cụ bắt buộc cho từng loại vết bẩn
  assert.equal(requiredTool('trash'), 'broom');
  assert.equal(requiredTool('spill'), 'mop');
  assert.equal(requiredTool('dirty_table'), 'mop');
  assert.equal(requiredTool('full_trash'), null);

  // 2. Dùng đúng, sai dụng cụ, cầm ly và tay rỗng cho cả 4 loại vết
  const cases: Array<{
    stain: StainItem['kind'];
    okTool: HeldItemKind | null;
    expectedHint?: 'Cần chổi' | 'Cần cây lau nhà';
  }> = [
    { stain: 'trash', okTool: 'broom', expectedHint: 'Cần chổi' },
    { stain: 'spill', okTool: 'mop', expectedHint: 'Cần cây lau nhà' },
    { stain: 'dirty_table', okTool: 'mop', expectedHint: 'Cần cây lau nhà' },
  ];

  const heldVariants: Array<HeldItemKind | null> = ['broom', 'mop', 'cup', null];
  for (const c of cases) {
    for (const held of heldVariants) {
      const res = checkToolUse(held, c.stain);
      if (held === c.okTool) {
        assert.deepEqual(res, { ok: true });
      } else {
        assert.deepEqual(res, { ok: false, hint: c.expectedHint });
      }
    }
  }

  for (const held of heldVariants) {
    assert.deepEqual(checkToolUse(held, 'full_trash'), { ok: true });
  }

  // 3. Kiểm tra ngắm trong tầm TOOL_RANGE, trong nón nhìn và bỏ qua full_trash
  const origin = { x: 0, y: 1.65, z: 0 };
  const stains: StainItem[] = [
    { id: 's_full', kind: 'full_trash', x: 0, z: -1.0, standX: 0, standZ: -1.0 },
    { id: 's_trash', kind: 'trash', x: 0, z: -1.2, standX: 0, standZ: -1.2 },
    { id: 's_far', kind: 'spill', x: 0, z: -(TOOL_RANGE + 1.0), standX: 0, standZ: 0 },
  ];
  // Nhìn chéo xuống vết rác ở (0, 0.05, -1.2): nằm trong tầm và nón nhìn, bỏ qua full_trash gần hơn
  const aimDown = { x: 0, y: -1.6, z: -1.2 };
  assert.equal(findAimedStain(origin, aimDown, stains)?.id, 's_trash');
  // Nhìn vào bàn bẩn ở độ cao mặt bàn (y = 0.8)
  const tableStain: StainItem = { id: 's_table', kind: 'dirty_table', x: 1.5, z: 0, standX: 0, standZ: 0, tableIndex: 0 };
  assert.equal(findAimedStain(origin, { x: 1.5, y: -0.85, z: 0 }, [tableStain])?.id, 's_table');
  // Nhìn ngược hướng (+Z) -> không trúng vết nào
  assert.equal(findAimedStain(origin, { x: 0, y: 0, z: 1 }, stains), null);
  // Vết bẩn vượt quá TOOL_RANGE -> không trúng
  assert.equal(findAimedStain(origin, { x: 0, y: -1.6, z: -(TOOL_RANGE + 1.0) }, [stains[2]]), null);

  // 4. Dọn vết bẩn qua CleanlinessStore vẫn phát cleanlinessChanged để hoàn thành tutorial bước 3
  const bus = createEventBus<GameEvents>();
  const tut = createTutorialController(bus);
  bus.emit('shiftOpened', { day: 1 });
  bus.emit('orderServed', {
    score: { accuracy: 100, timeFactor: 1, total: 100, stars: 5, payout: 30000 },
    elapsed: 10,
    payout: 30000,
  });
  assert.equal(tut.getCurrentStep()?.id, 'clean_stain');

  const clean = createCleanlinessStore(bus, { floorSlots: [{ x: 0, z: -1.2 }], rng: () => 0 });
  const spawned = clean.spawnFloorStain('trash');
  assert.ok(spawned !== null);
  assert.equal(clean.cleanStain(spawned.id), true);
  assert.equal(tut.getCurrentStep()?.id, 'close_shift');
}
