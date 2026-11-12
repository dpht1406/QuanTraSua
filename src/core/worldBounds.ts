import {
  SHOP_FRONT_WALL_Z,
  SHOP_INTERIOR_BOUNDS,
  STREET_BOUNDS,
  WORLD_MAX_Y,
} from '../state/constantsStreet.ts';

export interface Bounds3D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

// Ranh giới chỉ bên trong quán (dùng cho vết bẩn trong quán và phần shop cũ)
export function getShopBounds(): Bounds3D {
  return { ...SHOP_INTERIOR_BOUNDS };
}

// Kiểm tra tọa độ 3D có nằm trong phạm vi bên trong quán không (tách với mặt ngoài tường & đường phố)
export function isInsideShop(pos: { x: number; y: number; z: number }): boolean {
  return (
    pos.x >= SHOP_INTERIOR_BOUNDS.minX - 0.05 &&
    pos.x <= SHOP_INTERIOR_BOUNDS.maxX + 0.05 &&
    pos.y >= SHOP_INTERIOR_BOUNDS.minY - 0.15 &&
    pos.y <= SHOP_INTERIOR_BOUNDS.maxY + 0.1 &&
    pos.z >= SHOP_INTERIOR_BOUNDS.minZ - 0.05 &&
    pos.z <= SHOP_FRONT_WALL_Z
  );
}

// Ranh giới toàn thế giới (gồm cả quán + khu đường phố phía trước)
export function getWorldBounds(): Bounds3D {
  return {
    minX: Math.min(SHOP_INTERIOR_BOUNDS.minX, STREET_BOUNDS.minX),
    maxX: Math.max(SHOP_INTERIOR_BOUNDS.maxX, STREET_BOUNDS.maxX),
    minY: 0,
    maxY: WORLD_MAX_Y,
    minZ: Math.min(SHOP_INTERIOR_BOUNDS.minZ, STREET_BOUNDS.minZ),
    maxZ: Math.max(SHOP_INTERIOR_BOUNDS.maxZ, STREET_BOUNDS.maxZ),
  };
}
