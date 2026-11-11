import assert from 'node:assert/strict';
import { CAT_VARIANTS, getCatVariant, pickVariant, type CatAccessory } from './catVariants.ts';
import {
  CAT_BASE_HEIGHT,
  CAT_BOW_COLOR,
  CAT_CALICO_DARK_PATCH,
  CAT_EYE_SHINE_COLOR,
  CAT_GLASSES_COLOR,
  CAT_HAT_COLOR,
  CAT_INNER_EAR_COLOR,
  CAT_MUZZLE_COLOR,
  CAT_NOSE_COLOR,
  CAT_SCARF_COLOR,
  PLAYER_CAT_VARIANT,
} from './constantsCat.ts';

const VALID_ACCESSORIES: readonly CatAccessory[] = ['none', 'bow', 'hat', 'glasses', 'scarf'];

function assertValidHexColor(color: number, label: string): void {
  assert.equal(Number.isInteger(color), true, `${label} phải là số nguyên`);
  assert.ok(color >= 0 && color <= 0xffffff, `${label} phải nằm trong 0x000000..0xffffff`);
}

// Tự kiểm tra dữ liệu biến thể mèo và hằng số GĐ7 (thuần TS, không Three.js)
export function runSelfCheck7(): void {
  assert.equal(CAT_VARIANTS.length, 6);
  const ids = new Set(CAT_VARIANTS.map((v) => v.id));
  assert.equal(ids.size, 6);

  for (const variant of CAT_VARIANTS) {
    assert.ok(variant.name.trim().length > 0);
    assert.ok(VALID_ACCESSORIES.includes(variant.accessory));
    assertValidHexColor(variant.furColor, `${variant.id}.furColor`);
    assertValidHexColor(variant.patchColor, `${variant.id}.patchColor`);
    assertValidHexColor(variant.outfitColor, `${variant.id}.outfitColor`);
    assert.equal(getCatVariant(variant.id).id, variant.id);
  }

  for (let i = 0; i < CAT_VARIANTS.length; i++) {
    const picked = pickVariant(i);
    assert.equal(picked.id, CAT_VARIANTS[i].id);
    assert.equal(pickVariant(i).id, picked.id);
    assert.equal(pickVariant(i + CAT_VARIANTS.length).id, picked.id);
    assert.equal(pickVariant(i + CAT_VARIANTS.length * 3).id, picked.id);
  }
  assert.equal(pickVariant(-1).id, CAT_VARIANTS[CAT_VARIANTS.length - 1].id);
  assert.equal(pickVariant(-6).id, CAT_VARIANTS[0].id);
  assert.equal(pickVariant(Number.NaN).id, CAT_VARIANTS[0].id);

  assert.equal(CAT_BASE_HEIGHT, 1.56);
  assert.equal(getCatVariant(PLAYER_CAT_VARIANT).id, PLAYER_CAT_VARIANT);
  for (const c of [
    CAT_INNER_EAR_COLOR,
    CAT_NOSE_COLOR,
    CAT_MUZZLE_COLOR,
    CAT_EYE_SHINE_COLOR,
    CAT_CALICO_DARK_PATCH,
    CAT_BOW_COLOR,
    CAT_SCARF_COLOR,
    CAT_GLASSES_COLOR,
    CAT_HAT_COLOR,
  ]) {
    assertValidHexColor(c, 'constantsCat');
  }
}
