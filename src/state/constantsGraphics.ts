// Hằng số cấu hình đồ họa bán thực tế, ánh sáng ấm và chất lượng hiển thị (GĐ8a)
export const OUTLINE_ENABLED = false;

export const GRAPHICS_STORAGE_KEY = 'quantrasua.graphics';
export const DEFAULT_GRAPHICS_QUALITY = 'high' as const;

export const SHADOW_MAP_SIZE_HIGH = 2048;
export const PIXEL_RATIO_MAX_HIGH = 2;
export const PIXEL_RATIO_LOW = 1;

export const GRAPHICS_EXPOSURE = 0.95;

export const HEMI_SKY_COLOR = 0xfff6eb;
export const HEMI_GROUND_COLOR = 0xe5c4a3;
export const HEMI_INTENSITY_NORMAL = 0.85;
export const HEMI_INTENSITY_DIMMED = 0.16;

export const SUN_COLOR = 0xfff0d6;
export const SUN_INTENSITY_NORMAL = 1.25;
export const SUN_INTENSITY_DIMMED = 0.18;
export const SUN_POSITION = { x: 3.5, y: 6.5, z: 4.0 } as const;
export const SUN_SHADOW_BIAS = -0.0005;
export const SUN_SHADOW_NORMAL_BIAS = 0.02;
export const SUN_SHADOW_RADIUS = 2.5;

export const CEILING_LAMP_COLOR = 0xffe0b5;
export const CEILING_LAMP_INTENSITY = 2.6;
export const CEILING_LAMP_DISTANCE = 7.5;
export const CEILING_LAMP_DECAY = 2;
export const MAX_POINT_LIGHTS_HIGH = 3;
export const MAX_POINT_LIGHTS_LOW = 1;

export const CEILING_LAMP_POSITIONS: ReadonlyArray<readonly [number, number, number]> = [
  [-1.8, 2.52, -1.5],
  [2.8, 2.52, -0.5],
  [2.8, 2.52, 2.0],
];

export const DEFAULT_LIGHTING_BOUNDS = {
  minX: -5,
  maxX: 5,
  minY: 0,
  maxY: 3.4,
  minZ: -4,
  maxZ: 4,
} as const;

// Hằng số bầu trời, sương mù, vùng bóng ngoài đường, ánh sáng cửa sổ và mất điện nội thất (GĐ9a)
export const SKY_BACKGROUND_COLOR = 0xbfe3f7;
export const SKY_TOP_COLOR = '#89c7f0';
export const SKY_MID_COLOR = '#cbe7fa';
export const SKY_HORIZON_COLOR = '#e8f1f8';
export const SKY_FOG_COLOR = 0xe8f1f8;
export const STREET_FOG_NEAR = 20;
export const STREET_FOG_FAR = 52;

export const STREET_SHADOW_PADDING = 1.6;
export const STREET_SHADOW_MIN_MAX_Y = 9.2;
export const STREET_SUN_DISTANCE_SCALE = 3.0;

export const WINDOW_FILL_COLOR = 0xfff8ed;
export const WINDOW_FILL_INTENSITY = 1.65;
export const WINDOW_FILL_DISTANCE = 7.2;
export const WINDOW_FILL_DECAY = 2;
export const WINDOW_FILL_OFFSET = { x: 0, y: 2.15, z: 2.5 } as const;

export const SHOP_OUTAGE_DIM_FACTOR = 0.8;
export const SHOP_WALL_DIM_INSET = 0.08;
export const SHOP_DOOR_DAYLIGHT_FEATHER = 0.65;
