import {
  CROSSWALK_XS,
  CUSTOMER_DOOR_OUTSIDE_POINT,
  CUSTOMER_EXIT_POINT,
  CUSTOMER_SHOP_ENTRY_POINTS,
  CUSTOMER_SHOP_EXIT_POINTS,
  CUSTOMER_SPAWN_POINT,
  PEDESTRIAN_ROUTE_X_MAX,
  PEDESTRIAN_ROUTE_X_MIN,
  SHOP_DOOR_WIDTH,
  SHOP_INTERIOR_BOUNDS,
  SIDEWALK_LANE_OPP_Z,
  SIDEWALK_LANE_SHOP_Z,
  STREET_BOUNDS,
} from './constantsStreet.ts';

export type StreetPoint = { x: number; z: number };

function buildRoutes(): StreetPoint[][] {
  const xL = PEDESTRIAN_ROUTE_X_MIN;
  const xR = PEDESTRIAN_ROUTE_X_MAX;
  const zShop = SIDEWALK_LANE_SHOP_Z;
  const zOpp = SIDEWALK_LANE_OPP_Z;
  const cxL = CROSSWALK_XS[0];
  const cxR = CROSSWALK_XS[1];

  return [
    [{ x: xL, z: zShop }, { x: xR, z: zShop }],
    [{ x: xR, z: zShop }, { x: xL, z: zShop }],
    [{ x: xL, z: zOpp }, { x: xR, z: zOpp }],
    [{ x: xR, z: zOpp }, { x: xL, z: zOpp }],
    [{ x: xL, z: zShop }, { x: cxL, z: zShop }, { x: cxL, z: zOpp }, { x: xR, z: zOpp }],
    [{ x: xR, z: zOpp }, { x: cxR, z: zOpp }, { x: cxR, z: zShop }, { x: xL, z: zShop }],
    [{ x: xR, z: zShop }, { x: cxR, z: zShop }, { x: cxR, z: zOpp }, { x: xL, z: zOpp }],
    [{ x: xL, z: zOpp }, { x: cxL, z: zOpp }, { x: cxL, z: zShop }, { x: xR, z: zShop }],
  ];
}

const PEDESTRIAN_ROUTES = buildRoutes();

function cloneRoute(points: readonly StreetPoint[]): StreetPoint[] {
  return points.map((p) => ({ x: p.x, z: p.z }));
}

// Danh sách các tuyến đường thẳng có sẵn trên hai vỉa hè và băng qua đường tại vạch kẻ
export function getPedestrianRoutes(): StreetPoint[][] {
  return PEDESTRIAN_ROUTES.map(cloneRoute);
}

// Chọn một tuyến cố định và xác định theo (index, seed), rải đều các tuyến khác nhau cho pool
export function pickRoute(index: number, seed = 0): StreetPoint[] {
  const n = PEDESTRIAN_ROUTES.length;
  const safeIdx = Number.isFinite(index) ? Math.trunc(index) : 0;
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const hash = Math.imul((safeSeed ^ 0x9e3779b9) | 0, 2654435761) >>> 0;
  // Bước nhảy 3 nguyên tố cùng nhau với 8 để các chỉ số liên tiếp đi qua mọi tuyến trước khi lặp
  const slot = (((safeIdx * 3 + hash) % n) + n) % n;
  return cloneRoute(PEDESTRIAN_ROUTES[slot]);
}

// Tuyến khách thật đi từ đầu vỉa hè -> trước cửa -> vào quầy bên trong quán
export function getCustomerEntryRoute(): StreetPoint[] {
  return cloneRoute([
    CUSTOMER_SPAWN_POINT,
    CUSTOMER_DOOR_OUTSIDE_POINT,
    ...CUSTOMER_SHOP_ENTRY_POINTS,
  ]);
}

// Tuyến khách rời quầy -> ra cửa -> dọc vỉa hè ra khỏi khu phố
export function getCustomerExitRoute(): StreetPoint[] {
  return cloneRoute([
    ...CUSTOMER_SHOP_EXIT_POINTS,
    CUSTOMER_DOOR_OUTSIDE_POINT,
    CUSTOMER_EXIT_POINT,
  ]);
}

// Kiểm tra tọa độ (x, z) có nằm trong vùng đi lại hợp lệ (trong quán, khoảng cửa hoặc đường phố) không
export function isInsideWorld(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;

  const inShop =
    x >= SHOP_INTERIOR_BOUNDS.minX &&
    x <= SHOP_INTERIOR_BOUNDS.maxX &&
    z >= SHOP_INTERIOR_BOUNDS.minZ &&
    z <= SHOP_INTERIOR_BOUNDS.maxZ;
  if (inShop) return true;

  const halfDoor = SHOP_DOOR_WIDTH * 0.5;
  const inDoorway =
    x >= -halfDoor &&
    x <= halfDoor &&
    z >= SHOP_INTERIOR_BOUNDS.maxZ &&
    z <= STREET_BOUNDS.minZ;
  if (inDoorway) return true;

  return (
    x >= STREET_BOUNDS.minX &&
    x <= STREET_BOUNDS.maxX &&
    z >= STREET_BOUNDS.minZ &&
    z <= STREET_BOUNDS.maxZ
  );
}
