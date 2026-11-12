import {
  CUSTOMER_DOOR_OUTSIDE_POINT,
  CUSTOMER_EXIT_POINT,
  CUSTOMER_SHOP_ENTRY_POINTS,
  CUSTOMER_SHOP_EXIT_POINTS,
  PEDESTRIAN_SPEED_RANGE,
  SHOP_FRONT_WALL_Z,
} from './constantsStreet.ts';
import {
  getCustomerEntryRoute,
  getCustomerExitRoute,
  pickRoute,
  type StreetPoint,
} from './streetPlan.ts';

export interface PedestrianMotionState {
  readonly slot: number;
  route: StreetPoint[];
  targetIdx: number;
  round: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  speed: number;
  walkTime: number;
}

const POINT_EPS = 1e-4;

// Chọn tốc độ đi bộ khác nhau nhưng xác định theo slot và lượt đi trong dải cho phép
export function computePedestrianSpeed(slot: number, round = 0): number {
  const min = PEDESTRIAN_SPEED_RANGE.min;
  const max = PEDESTRIAN_SPEED_RANGE.max;
  const safeSlot = Number.isFinite(slot) ? Math.abs(Math.trunc(slot)) : 0;
  const safeRound = Number.isFinite(round) ? Math.abs(Math.trunc(round)) : 0;
  const step = ((safeSlot * 5 + safeRound * 3) % 7 + 0.5) / 7;
  return min + step * (max - min);
}

function syncDirection(state: PedestrianMotionState): void {
  const target = state.route[state.targetIdx] ?? state.route[state.route.length - 1];
  if (!target) {
    state.vx = 0;
    state.vz = 0;
    return;
  }
  const dx = target.x - state.x;
  const dz = target.z - state.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 1e-6) {
    const nx = dx / dist;
    const nz = dz / dist;
    state.vx = nx * state.speed;
    state.vz = nz * state.speed;
    state.yaw = Math.atan2(nx, nz);
  }
}

function startNextRoute(state: PedestrianMotionState, seed: number): void {
  state.round += 1;
  state.route = pickRoute(state.slot + state.round, seed);
  state.x = state.route[0].x;
  state.z = state.route[0].z;
  state.targetIdx = 1;
  state.speed = computePedestrianSpeed(state.slot, state.round);
}

// Khởi tạo trạng thái chuyển động cho một slot trong pool người đi đường
export function createPedestrianMotion(
  slot: number,
  seed = 1,
  initialOffsetSec = 0,
): PedestrianMotionState {
  const route = pickRoute(slot, seed);
  const state: PedestrianMotionState = {
    slot,
    route,
    targetIdx: 1,
    round: 0,
    x: route[0].x,
    z: route[0].z,
    vx: 0,
    vz: 0,
    yaw: 0,
    speed: computePedestrianSpeed(slot, 0),
    walkTime: 0,
  };
  syncDirection(state);
  if (initialOffsetSec > 0) {
    stepPedestrianMotion(state, initialOffsetSec, seed);
  }
  return state;
}

// Cập nhật vị trí đi thẳng theo waypoint và tự tái sử dụng pool sang tuyến mới khi hết tuyến
export function stepPedestrianMotion(
  state: PedestrianMotionState,
  dt: number,
  seed = 1,
): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const safeDt = Math.min(dt, 60);
  state.walkTime += safeDt;

  let remainingDist = state.speed * safeDt;
  let guard = 0;

  while (remainingDist > 1e-7 && guard++ < 64) {
    const target = state.route[state.targetIdx];
    if (!target) {
      startNextRoute(state, seed);
      continue;
    }
    const dx = target.x - state.x;
    const dz = target.z - state.z;
    const dist = Math.hypot(dx, dz);

    if (dist <= remainingDist + 1e-7) {
      state.x = target.x;
      state.z = target.z;
      remainingDist -= dist;
      state.targetIdx += 1;
      if (state.targetIdx >= state.route.length) {
        startNextRoute(state, seed);
      }
      continue;
    }

    const nx = dx / dist;
    const nz = dz / dist;
    state.x += nx * remainingDist;
    state.z += nz * remainingDist;
    state.vx = nx * state.speed;
    state.vz = nz * state.speed;
    state.yaw = Math.atan2(nx, nz);
    remainingDist = 0;
  }

  syncDirection(state);
}

function pointsClose(a: StreetPoint, b: StreetPoint): boolean {
  return Math.abs(a.x - b.x) <= POINT_EPS && Math.abs(a.z - b.z) <= POINT_EPS;
}

function matchesPoints(a: readonly StreetPoint[], b: readonly StreetPoint[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!pointsClose(a[i], b[i])) return false;
  }
  return true;
}

// shortcut: ánh xạ tuyến vào quán cố định của orderManager sang getCustomerEntryRoute để không sửa orderManager; nâng cấp khi orderManager truyền thẳng street route
export function resolveCustomerEntryWaypoints(waypoints: readonly StreetPoint[]): StreetPoint[] {
  if (matchesPoints(waypoints, CUSTOMER_SHOP_ENTRY_POINTS)) {
    return getCustomerEntryRoute();
  }
  return waypoints.map((p) => ({ x: p.x, z: p.z }));
}

// Mở rộng tuyến rời quán sang vỉa hè ngoài đường và xử lý khi khách bị ném lúc đang đi bộ vào từ ngoài phố
export function resolveCustomerExitWaypoints(
  waypoints: readonly StreetPoint[],
  pos: StreetPoint,
): StreetPoint[] {
  if (matchesPoints(waypoints, CUSTOMER_SHOP_EXIT_POINTS)) {
    return getCustomerExitRoute();
  }
  const insideDoor = CUSTOMER_SHOP_EXIT_POINTS[1];
  if (waypoints.length === 1 && pointsClose(waypoints[0], insideDoor)) {
    if (pos.z > SHOP_FRONT_WALL_Z) {
      return pos.x < CUSTOMER_DOOR_OUTSIDE_POINT.x
        ? [{ ...CUSTOMER_DOOR_OUTSIDE_POINT }, { ...CUSTOMER_EXIT_POINT }]
        : [{ ...CUSTOMER_EXIT_POINT }];
    }
    if (pos.z > insideDoor.z) {
      return [{ ...CUSTOMER_DOOR_OUTSIDE_POINT }, { ...CUSTOMER_EXIT_POINT }];
    }
    return [{ ...insideDoor }, { ...CUSTOMER_DOOR_OUTSIDE_POINT }, { ...CUSTOMER_EXIT_POINT }];
  }
  return waypoints.map((p) => ({ x: p.x, z: p.z }));
}
