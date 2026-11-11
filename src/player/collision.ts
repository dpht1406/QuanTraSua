export interface AabbBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Point2D {
  x: number;
  z: number;
}

const EPS = 1e-4;

// Kiểm tra hộp người chơi có giao với một hộp AABB trên mặt phẳng XZ không
export function overlapsAabb(x: number, z: number, radius: number, box: AabbBox): boolean {
  return (
    x + radius > box.minX &&
    x - radius < box.maxX &&
    z + radius > box.minZ &&
    z - radius < box.maxZ
  );
}

// Giải quyết va chạm AABB tách trục X/Z để người chơi dừng sát vật cản và trượt dọc tường
export function resolveAabbMove(
  x: number,
  z: number,
  targetX: number,
  targetZ: number,
  radius: number,
  colliders: readonly AabbBox[],
): Point2D {
  // shortcut: chỉ xét va chạm 2D trên mặt sàn (XZ), nâng cấp lên 3D khi có nhảy hoặc bậc thang
  let nextX = targetX;
  const dx = targetX - x;

  for (const box of colliders) {
    if (!overlapsAabb(nextX, z, radius, box)) continue;
    if (dx > 0) {
      nextX = box.minX - radius - EPS;
    } else if (dx < 0) {
      nextX = box.maxX + radius + EPS;
    } else {
      const pushLeft = box.minX - radius - EPS;
      const pushRight = box.maxX + radius + EPS;
      nextX = Math.abs(nextX - pushLeft) < Math.abs(pushRight - nextX) ? pushLeft : pushRight;
    }
  }

  let nextZ = targetZ;
  const dz = targetZ - z;

  for (const box of colliders) {
    if (!overlapsAabb(nextX, nextZ, radius, box)) continue;
    if (dz > 0) {
      nextZ = box.minZ - radius - EPS;
    } else if (dz < 0) {
      nextZ = box.maxZ + radius + EPS;
    } else {
      const pushBack = box.minZ - radius - EPS;
      const pushFront = box.maxZ + radius + EPS;
      nextZ = Math.abs(nextZ - pushBack) < Math.abs(pushFront - nextZ) ? pushBack : pushFront;
    }
  }

  return { x: nextX, z: nextZ };
}
