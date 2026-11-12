// Kích thước khu vực quán/đường phố (m), tọa độ cửa và thông số khách/người đi đường (GĐ9a)
export const SHOP_INTERIOR_BOUNDS = {
  minX: -5,
  maxX: 5,
  minY: 0,
  maxY: 3.4,
  minZ: -4,
  maxZ: 4,
} as const;

export const SHOP_FRONT_WALL_Z = 4.1;
export const SHOP_DOOR_POS = { x: 0, z: SHOP_FRONT_WALL_Z } as const;
export const SHOP_DOOR_WIDTH = 1.44;
export const SHOP_DOOR_HEIGHT = 2.38;

export const SHOP_WINDOW_XS = [-3.0, 3.0] as const;
export const SHOP_WINDOW_SIZE = { width: 2.0, height: 1.3, centerY: 1.55 } as const;

// Khu vực đi được ngoài đường: rộng 20m (x: -10..+10) x sâu 10m (z: 4.2..14.2)
export const STREET_BOUNDS = {
  minX: -10,
  maxX: 10,
  minZ: 4.2,
  maxZ: 14.2,
} as const;

export const STREET_SIDEWALK_SHOP_Z = { minZ: 4.2, maxZ: 6.7 } as const;
export const STREET_ROAD_Z = { minZ: 6.7, maxZ: 11.7 } as const;
export const STREET_SIDEWALK_OPP_Z = { minZ: 11.7, maxZ: 14.2 } as const;

export const SIDEWALK_LANE_SHOP_Z = 5.35;
export const SIDEWALK_LANE_OPP_Z = 12.95;
export const WORLD_MAX_Y = 9.2;

// Vị trí 2 vạch băng qua đường (dọc theo trục Z từ vỉa hè quán sang vỉa hè đối diện)
export const CROSSWALK_WIDTH = 2.0;
export const CROSSWALK_XS = [-4.5, 4.5] as const;

// Điểm xuất hiện/thoát của khách trên vỉa hè và lối vào/ra bên trong quán
export const CUSTOMER_SPAWN_POINT = { x: -9.2, z: SIDEWALK_LANE_SHOP_Z } as const;
export const CUSTOMER_DOOR_OUTSIDE_POINT = { x: 0, z: SIDEWALK_LANE_SHOP_Z } as const;
export const CUSTOMER_EXIT_POINT = { x: 9.2, z: SIDEWALK_LANE_SHOP_Z } as const;

export const CUSTOMER_SHOP_ENTRY_POINTS = [
  { x: 0, z: 3.65 },
  { x: -0.25, z: 1.6 },
  { x: -0.25, z: -0.45 },
] as const;

export const CUSTOMER_SHOP_EXIT_POINTS = [
  { x: -0.25, z: 1.6 },
  { x: 0, z: 3.65 },
] as const;

export const CUSTOMER_WALK_SPEED = 1.9;

// Giới hạn người đi đường theo chất lượng đồ họa và tốc độ đi bộ
export const PEDESTRIAN_MAX_BY_QUALITY = {
  high: 6,
  low: 3,
} as const;

export const PEDESTRIAN_WALK_SPEED = 1.55;
export const PEDESTRIAN_SPEED_RANGE = { min: 1.3, max: 1.85 } as const;
export const PEDESTRIAN_ROUTE_X_MIN = -9.4;
export const PEDESTRIAN_ROUTE_X_MAX = 9.4;
