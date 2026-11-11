import type { CatVariantId } from './catVariants.ts';

// Hằng số kích thước, màu chi tiết và hoạt ảnh cho nhân vật mèo chibi (GĐ7)
// Khớp HITBOX_HEIGHT = 1.56 trong world/customer.ts để không lệch hitbox và fallPose
export const CAT_BASE_HEIGHT = 1.56;
export const CAT_HEAD_Y = 1.17;
export const CAT_HEAD_RADIUS = 0.28;
export const CAT_HEAD_SCALE = { x: 0.98, y: 1.04, z: 0.96 } as const;
export const PLAYER_CAT_VARIANT: CatVariantId = 'gray';

export const CAT_INNER_EAR_COLOR = 0xf4a9b8;
export const CAT_NOSE_COLOR = 0xf08ca2;
export const CAT_MUZZLE_COLOR = 0xfff0db;
export const CAT_EYE_SHINE_COLOR = 0xffffff;
export const CAT_CALICO_DARK_PATCH = 0x3b2d26;
export const CAT_BOW_COLOR = 0xf0718b;
export const CAT_SCARF_COLOR = 0xe87b70;
export const CAT_GLASSES_COLOR = 0x2d2422;
export const CAT_HAT_COLOR = 0xb9825c;

export const CAT_IDLE_FREQ = 2.4;
export const CAT_WALK_FREQ_MULT = 4.8;
export const CAT_WORK_FREQ_MULT = 6.5;
