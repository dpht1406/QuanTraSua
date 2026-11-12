import assert from 'node:assert/strict';
import { getShopBounds, getWorldBounds, isInsideShop } from '../core/worldBounds.ts';
import {
  CROSSWALK_XS,
  CUSTOMER_DOOR_OUTSIDE_POINT,
  CUSTOMER_EXIT_POINT,
  CUSTOMER_SHOP_ENTRY_POINTS,
  CUSTOMER_SPAWN_POINT,
  PEDESTRIAN_MAX_BY_QUALITY,
  SHOP_DOOR_WIDTH,
  SHOP_FRONT_WALL_Z,
  SHOP_INTERIOR_BOUNDS,
  SIDEWALK_LANE_OPP_Z,
  SIDEWALK_LANE_SHOP_Z,
  STREET_BOUNDS,
} from './constantsStreet.ts';
import {
  getCustomerEntryRoute,
  getCustomerExitRoute,
  getPedestrianRoutes,
  isInsideWorld,
  pickRoute,
  type StreetPoint,
} from './streetPlan.ts';

function assertRouteInsideWorld(route: readonly StreetPoint[], label: string): void {
  assert.ok(route.length >= 2, `${label} phải có ít nhất 2 điểm`);
  for (let i = 0; i < route.length; i++) {
    const p = route[i];
    assert.equal(isInsideWorld(p.x, p.z), true, `${label}[${i}] (${p.x}, ${p.z}) phải nằm trong isInsideWorld`);
    if (i > 0) {
      const prev = route[i - 1];
      const mx = (prev.x + p.x) * 0.5;
      const mz = (prev.z + p.z) * 0.5;
      assert.equal(isInsideWorld(mx, mz), true, `${label} trung điểm đoạn ${i - 1}->${i} (${mx}, ${mz}) phải hợp lệ`);
    }
  }
}

// Tự kiểm tra phần thuần TypeScript cho hợp đồng đường phố GĐ9a
export function runSelfCheckStreet(): void {
  // 1. Hằng số kích thước đường phố (~10x20m), cửa >= 1.2m và giới hạn chất lượng
  assert.equal(STREET_BOUNDS.maxX - STREET_BOUNDS.minX, 20);
  assert.equal(STREET_BOUNDS.maxZ - STREET_BOUNDS.minZ, 10);
  assert.ok(STREET_BOUNDS.minZ >= SHOP_FRONT_WALL_Z);
  assert.ok(SHOP_DOOR_WIDTH >= 1.2, 'Cửa phải rộng tối thiểu 1.2m cho capsule người chơi và ghế');
  assert.equal(PEDESTRIAN_MAX_BY_QUALITY.high, 6);
  assert.equal(PEDESTRIAN_MAX_BY_QUALITY.low, 3);
  assert.equal(CROSSWALK_XS.length, 2);

  // 2. getWorldBounds bao trọn cả getShopBounds và STREET_BOUNDS
  const shop = getShopBounds();
  const world = getWorldBounds();
  assert.deepEqual(shop, SHOP_INTERIOR_BOUNDS);
  assert.ok(world.minX <= shop.minX && world.minX <= STREET_BOUNDS.minX);
  assert.ok(world.maxX >= shop.maxX && world.maxX >= STREET_BOUNDS.maxX);
  assert.ok(world.minZ <= shop.minZ && world.minZ <= STREET_BOUNDS.minZ);
  assert.ok(world.maxZ >= shop.maxZ && world.maxZ >= STREET_BOUNDS.maxZ);
  assert.ok(world.maxY > shop.maxY);

  // 3. Tuyến người đi đường nằm trọn trong world và có cả 2 vỉa hè + băng qua đường
  const routes = getPedestrianRoutes();
  assert.ok(routes.length >= 6);
  const coveredOppSidewalk = routes.some((r) => r.some((p) => Math.abs(p.z - SIDEWALK_LANE_OPP_Z) < 1e-6));
  const coveredShopSidewalk = routes.some((r) => r.some((p) => Math.abs(p.z - SIDEWALK_LANE_SHOP_Z) < 1e-6));
  assert.ok(coveredShopSidewalk && coveredOppSidewalk, 'Phải có tuyến qua cả 2 bên vỉa hè');
  routes.forEach((route, i) => assertRouteInsideWorld(route, `pedRoute#${i}`));

  // 4. pickRoute xác định theo (index, seed), rải đều và phòng vệ mutation / giá trị lạ
  const rA = pickRoute(2, 42);
  const rB = pickRoute(2, 42);
  assert.deepEqual(rA, rB, 'pickRoute phải xác định theo cùng (index, seed)');
  rA[0].x = 9999;
  assert.ok(pickRoute(2, 42)[0].x !== 9999, 'pickRoute phải trả về bản sao');

  const uniqueKeys = new Set(
    Array.from({ length: routes.length }, (_, i) => JSON.stringify(pickRoute(i, 7))),
  );
  assert.equal(uniqueKeys.size, routes.length, 'pickRoute liên tiếp phải rải đều hết mọi tuyến');
  assert.ok(pickRoute(-3, 5).length >= 2);
  assert.ok(pickRoute(Number.NaN, Number.POSITIVE_INFINITY).length >= 2);

  // 5. Tuyến vào / ra của khách bắt đầu & kết thúc đúng chỗ trên vỉa hè và tại quầy
  const entryRoute = getCustomerEntryRoute();
  assertRouteInsideWorld(entryRoute, 'customerEntry');
  assert.deepEqual(entryRoute[0], CUSTOMER_SPAWN_POINT);
  assert.ok(entryRoute[0].z > SHOP_FRONT_WALL_Z && entryRoute[0].x < shop.minX, 'Khách phải xuất hiện ngoài đầu vỉa hè');
  assert.ok(
    entryRoute.some((p) => p.x === CUSTOMER_DOOR_OUTSIDE_POINT.x && p.z === CUSTOMER_DOOR_OUTSIDE_POINT.z),
    'Tuyến vào phải đi qua điểm trước cửa',
  );
  const counterTarget = CUSTOMER_SHOP_ENTRY_POINTS[CUSTOMER_SHOP_ENTRY_POINTS.length - 1];
  assert.deepEqual(entryRoute[entryRoute.length - 1], counterTarget);

  const exitRoute = getCustomerExitRoute();
  assertRouteInsideWorld(exitRoute, 'customerExit');
  assert.ok(exitRoute[0].z < shop.maxZ, 'Tuyến ra phải bắt đầu từ bên trong quán');
  assert.ok(
    exitRoute.some((p) => p.x === CUSTOMER_DOOR_OUTSIDE_POINT.x && p.z === CUSTOMER_DOOR_OUTSIDE_POINT.z),
    'Tuyến ra phải đi qua điểm ngoài cửa',
  );
  assert.deepEqual(exitRoute[exitRoute.length - 1], CUSTOMER_EXIT_POINT);
  assert.ok(
    exitRoute[exitRoute.length - 1].z > SHOP_FRONT_WALL_Z && exitRoute[exitRoute.length - 1].x > shop.maxX,
    'Khách phải đi ra hết vỉa hè rồi mới biến mất',
  );

  // 6. Kiểm tra ranh giới isInsideWorld: trong quán, ô cửa, ngoài đường, tường chắn và ngoài biên
  assert.equal(isInsideWorld(0, 0), true);
  assert.equal(isInsideWorld(0, SHOP_FRONT_WALL_Z), true);
  assert.equal(isInsideWorld(3.5, SHOP_FRONT_WALL_Z), false);
  assert.equal(isInsideWorld(-4.5, 9.2), true);
  assert.equal(isInsideWorld(-6.0, 0), false);
  assert.equal(isInsideWorld(6.0, 0), false);
  assert.equal(isInsideWorld(-10.5, 8.0), false);
  assert.equal(isInsideWorld(10.5, 8.0), false);
  assert.equal(isInsideWorld(0, 14.5), false);
  assert.equal(isInsideWorld(Number.NaN, 0), false);

  // 7. Phân biệt tọa độ bên trong quán với đường phố, mặt ngoài tường và mái quán (không đổ vết bẩn ngoài đường)
  assert.equal(isInsideShop({ x: 0, y: 0.2, z: 2.0 }), true);
  assert.equal(isInsideShop({ x: -3.0, y: 1.5, z: 3.95 }), true);
  assert.equal(isInsideShop({ x: -3.0, y: 1.5, z: 4.25 }), false);
  assert.equal(isInsideShop({ x: 0, y: 0.1, z: SIDEWALK_LANE_SHOP_Z }), false);
  assert.equal(isInsideShop({ x: 2.0, y: 0.1, z: 9.2 }), false);
  assert.equal(isInsideShop({ x: 5.3, y: 1.0, z: 0 }), false);
  assert.equal(isInsideShop({ x: 0, y: 3.65, z: 0 }), false);
  assert.ok(world.maxY >= 9.0, 'Trần WORLD_MAX_Y phải đủ cao cho cú ném góc dốc ngoài trời');
}
