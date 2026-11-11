import assert from 'node:assert/strict';
import { createEventBus } from './eventBus.ts';
import { createGameStore, DEFAULT_GAME_STATE } from './gameState.ts';
import {
  DRINK_BASE_LIST,
  generateOrder,
  getOrderPrice,
  LEVEL_PERCENT_LIST,
  TOPPING_LIST,
  type DrinkOrder,
} from './menu.ts';
import { createEmptyCup, scoreDrink } from './scoring.ts';
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

// Tự kiểm tra generateOrder trả về giá trị hợp lệ và tính giá món
for (let i = 0; i < 20; i++) {
  const order = generateOrder();
  assert.ok(DRINK_BASE_LIST.includes(order.base));
  assert.ok(LEVEL_PERCENT_LIST.includes(order.sugar));
  assert.ok(LEVEL_PERCENT_LIST.includes(order.ice));
  assert.ok(TOPPING_LIST.includes(order.topping));
}
assert.equal(getOrderPrice({ base: 'traditional', sugar: 50, ice: 50, topping: 'none' }), 30000);
assert.equal(getOrderPrice({ base: 'matcha', sugar: 100, ice: 50, topping: 'pearl' }), 45000);

// Tự kiểm tra scoreDrink với các trường hợp chấm điểm và làm tròn payout
const sampleOrder: DrinkOrder = { base: 'peach', sugar: 50, ice: 100, topping: 'pearl' }; // 40.000đ
const baseCup = { ...createEmptyCup(), base: 'peach' as const, sugar: 50 as const, ice: 100 as const, topping: 'pearl' as const, sealed: true };

// 1) Đúng hết trong <= 70% thời gian chờ
const perfect = scoreDrink(sampleOrder, baseCup, 30, 60);
assert.equal(perfect.accuracy, 100);
assert.equal(perfect.timeFactor, 1);
assert.equal(perfect.total, 100);
assert.equal(perfect.stars, 5);
assert.equal(perfect.payout, 40000);

// 2) Sai đường (-20đ), trong thời gian tốt -> 80đ, 4 sao, payout 32.000đ
const wrongSugar = scoreDrink(sampleOrder, { ...baseCup, sugar: 100 }, 20, 60);
assert.equal(wrongSugar.accuracy, 80);
assert.equal(wrongSugar.total, 80);
assert.equal(wrongSugar.stars, 4);
assert.equal(wrongSugar.payout, 32000);

// 3) Sai món -> payout = 0, 1 sao
const wrongBase = scoreDrink(sampleOrder, { ...baseCup, base: 'traditional' }, 10, 60);
assert.equal(wrongBase.payout, 0);
assert.equal(wrongBase.stars, 1);

// 4) Quá 70% thời gian chờ (51/60s = 85% -> đi nửa chặng trễ -> -10đ) + kiểm tra làm tròn 1.000đ
const order35k: DrinkOrder = { base: 'traditional', sugar: 50, ice: 50, topping: 'pearl' }; // 35.000đ
const lateCup = { base: 'traditional' as const, sugar: 50 as const, ice: 50 as const, topping: 'pearl' as const, sealed: true };
const late = scoreDrink(order35k, lateCup, 51, 60);
assert.equal(late.accuracy, 100);
assert.equal(late.total, 90);
assert.equal(late.payout, 32000); // 35.000 * 90 / 100 = 31.500 -> làm tròn 32.000đ

// 5) Hết giờ chờ (>= patienceSec) -> khách bỏ đi, payout = 0
const expired = scoreDrink(sampleOrder, baseCup, 60, 60);
assert.equal(expired.total, 0);
assert.equal(expired.payout, 0);
assert.equal(expired.stars, 1);

console.log('Self-check OK: GameState, EventBus, AABB, Menu, Scoring');
