import assert from 'node:assert/strict';
import { createEventBus } from './eventBus.ts';
import { createGameStore, DEFAULT_GAME_STATE } from './gameState.ts';
import { resolveAabbMove, type AabbBox } from '../player/collision.ts';

// Tự kiểm tra GameState: giá trị mặc định và cập nhật
const store = createGameStore();
assert.deepEqual(store.getState(), DEFAULT_GAME_STATE);

const updated = store.updateState({ money: 650000, day: 2, cleanliness: 92 });
assert.equal(updated.money, 650000);
assert.equal(updated.day, 2);
assert.equal(updated.cleanliness, 92);
assert.equal(updated.time, '08:00');
assert.equal(updated.reputation, 50);

// Tự kiểm tra EventBus: on, emit và off
const bus = createEventBus<{ ping: number }>();
let received = 0;
const onPing = (value: number) => {
  received += value;
};
bus.on('ping', onPing);
bus.emit('ping', 5);
assert.equal(received, 5);
bus.off('ping', onPing);
bus.emit('ping', 10);
assert.equal(received, 5);

// Tự kiểm tra AABB: đi tự do, đâm tường, và trượt dọc tường
const wall: AabbBox = { minX: 2, maxX: 3, minZ: -2, maxZ: 2 };
const radius = 0.3;

const free = resolveAabbMove(0, 0, 1, 0.5, radius, [wall]);
assert.deepEqual(free, { x: 1, z: 0.5 });

const blocked = resolveAabbMove(1.5, 0, 2.2, 0, radius, [wall]);
assert.ok(blocked.x <= wall.minX - radius);
assert.equal(blocked.z, 0);

const slide = resolveAabbMove(1.5, 0, 2.2, 0.8, radius, [wall]);
assert.ok(slide.x <= wall.minX - radius);
assert.equal(slide.z, 0.8);

console.log('Self-check OK: GameState, EventBus, AABB');
