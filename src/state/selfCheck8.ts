import assert from 'node:assert/strict';
import {
  CEILING_LAMP_INTENSITY,
  CEILING_LAMP_POSITIONS,
  DEFAULT_GRAPHICS_QUALITY,
  GRAPHICS_EXPOSURE,
  GRAPHICS_STORAGE_KEY,
  HEMI_INTENSITY_DIMMED,
  HEMI_INTENSITY_NORMAL,
  MAX_POINT_LIGHTS_HIGH,
  MAX_POINT_LIGHTS_LOW,
  OUTLINE_ENABLED,
  PIXEL_RATIO_LOW,
  PIXEL_RATIO_MAX_HIGH,
  SHADOW_MAP_SIZE_HIGH,
  SUN_INTENSITY_DIMMED,
  SUN_INTENSITY_NORMAL,
} from './constantsGraphics.ts';
import {
  loadGraphicsQuality,
  parseGraphicsQuality,
  saveGraphicsQuality,
} from './graphicsQuality.ts';
import {
  clearSave,
  SAVE_KEY,
  writeSave,
  createDefaultSaveData,
  type StorageLike,
} from './save.ts';
import { runSelfCheck8b } from './selfCheck8b.ts';
import { runSelfCheck8c } from './selfCheck8c.ts';
import { runSelfCheck8d } from './selfCheck8d.ts';

function createFakeStorage(): StorageLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

// Tự kiểm tra cấu hình và lưu trữ chất lượng đồ họa GĐ8a (thuần TS)
export function runSelfCheck8(): void {
  // 1. Hằng số đồ họa hợp lệ
  assert.equal(OUTLINE_ENABLED, false);
  assert.equal(GRAPHICS_STORAGE_KEY, 'quantrasua.graphics');
  assert.ok((GRAPHICS_STORAGE_KEY as string) !== SAVE_KEY);
  assert.equal(DEFAULT_GRAPHICS_QUALITY, 'high');
  assert.equal(SHADOW_MAP_SIZE_HIGH, 2048);
  assert.equal(PIXEL_RATIO_MAX_HIGH, 2);
  assert.equal(PIXEL_RATIO_LOW, 1);
  assert.ok(GRAPHICS_EXPOSURE > 0 && GRAPHICS_EXPOSURE <= 2);
  assert.ok(HEMI_INTENSITY_NORMAL > HEMI_INTENSITY_DIMMED && HEMI_INTENSITY_DIMMED >= 0);
  assert.ok(SUN_INTENSITY_NORMAL > SUN_INTENSITY_DIMMED && SUN_INTENSITY_DIMMED >= 0);
  assert.ok(CEILING_LAMP_INTENSITY > 0);
  assert.ok(CEILING_LAMP_POSITIONS.length >= 1 && CEILING_LAMP_POSITIONS.length <= 3);
  assert.ok(MAX_POINT_LIGHTS_LOW >= 1 && MAX_POINT_LIGHTS_LOW < MAX_POINT_LIGHTS_HIGH);

  // 2. parseGraphicsQuality: hợp lệ giữ nguyên, giá trị lạ trả 'high'
  assert.equal(parseGraphicsQuality('low'), 'low');
  assert.equal(parseGraphicsQuality('high'), 'high');
  for (const weird of [null, undefined, '', 'medium', 'ultra', 'LOW', 'High', 0, 1, {}, []]) {
    assert.equal(parseGraphicsQuality(weird), 'high');
  }

  // 3. save / load qua StorageLike giả (và xử lý storage null/lỗi)
  const storage = createFakeStorage();
  assert.equal(loadGraphicsQuality(storage), 'high');
  assert.equal(saveGraphicsQuality(storage, 'low'), true);
  assert.equal(storage.store.get(GRAPHICS_STORAGE_KEY), 'low');
  assert.equal(storage.store.has(SAVE_KEY), false);
  assert.equal(loadGraphicsQuality(storage), 'low');

  assert.equal(saveGraphicsQuality(storage, 'high'), true);
  assert.equal(loadGraphicsQuality(storage), 'high');

  storage.store.set(GRAPHICS_STORAGE_KEY, 'corrupted_value');
  assert.equal(loadGraphicsQuality(storage), 'high');

  assert.equal(loadGraphicsQuality(null), 'high');
  assert.equal(saveGraphicsQuality(null, 'low'), false);

  const throwingStorage: StorageLike = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('quota');
    },
    removeItem() {},
  };
  assert.equal(loadGraphicsQuality(throwingStorage), 'high');
  assert.equal(saveGraphicsQuality(throwingStorage, 'low'), false);

  // 4. Lưu/xóa save game không làm mất lựa chọn đồ họa qua F5
  const reloadStorage = createFakeStorage();
  assert.equal(saveGraphicsQuality(reloadStorage, 'low'), true);
  assert.equal(writeSave(reloadStorage, createDefaultSaveData(true)).ok, true);
  assert.equal(clearSave(reloadStorage), true);
  assert.equal(loadGraphicsQuality(reloadStorage), 'low');

  runSelfCheck8b();
  runSelfCheck8c();
  runSelfCheck8d();
}
