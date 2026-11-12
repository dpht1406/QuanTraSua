import type { AabbBox } from '../player/collision.ts';
import { SHOP_INTERIOR_BOUNDS, STREET_BOUNDS } from '../state/constantsStreet.ts';

export interface StreetPropPos {
  x: number;
  z: number;
}

export interface StreetLampSpec extends StreetPropPos {
  armDirZ: 1 | -1;
}

export interface StreetBenchSpec extends StreetPropPos {
  yaw: number;
}

export const TREE_SPOTS: readonly StreetPropPos[] = [
  { x: -8.4, z: 6.28 },
  { x: 8.4, z: 6.28 },
  { x: -7.2, z: 12.12 },
  { x: 0.0, z: 12.12 },
  { x: 7.2, z: 12.12 },
];

export const LAMP_SPOTS: readonly StreetLampSpec[] = [
  { x: -6.7, z: 6.32, armDirZ: 1 },
  { x: 6.7, z: 6.32, armDirZ: 1 },
  { x: -2.4, z: 12.08, armDirZ: -1 },
  { x: 2.4, z: 12.08, armDirZ: -1 },
];

export const BENCH_SPOTS: readonly StreetBenchSpec[] = [
  { x: -7.4, z: 4.5, yaw: 0 },
  { x: -2.1, z: 13.88, yaw: Math.PI },
  { x: 2.1, z: 13.88, yaw: Math.PI },
];

export const BIN_SPOTS: readonly StreetPropPos[] = [
  { x: 6.4, z: 4.48 },
  { x: -6.1, z: 13.9 },
  { x: 6.1, z: 13.9 },
];

// Danh sách AABB tĩnh gộp gọn cho toàn bộ khu phố: sàn, nhà bao quanh, hàng rào rìa, cây, cột đèn, ghế đá, thùng rác
export function getStreetColliders(): AabbBox[] {
  const { minX, maxX, minZ, maxZ } = STREET_BOUNDS;
  const shopMinX = SHOP_INTERIOR_BOUNDS.minX - 0.2;
  const shopMaxX = SHOP_INTERIOR_BOUNDS.maxX + 0.2;

  const boxes: AabbBox[] = [
    // Sàn đường + vỉa hè gộp 1 khối
    { minX: minX - 0.5, maxX: maxX + 0.5, minY: -0.25, maxY: 0, minZ, maxZ: maxZ + 0.5, tag: 'floor' },
    // Dãy nhà kề hai bên quán (chặn kín phía bắc ngoài quán)
    { minX: minX - 1.5, maxX: shopMinX, minY: 0, maxY: 7.2, minZ: SHOP_INTERIOR_BOUNDS.minZ - 0.2, maxZ: minZ, tag: 'wall' },
    { minX: shopMaxX, maxX: maxX + 1.5, minY: 0, maxY: 7.2, minZ: SHOP_INTERIOR_BOUNDS.minZ - 0.2, maxZ: minZ, tag: 'wall' },
    // Dãy nhà mặt tiền phía đối diện (gộp 1 khối dài dọc trục X)
    { minX: minX - 1.5, maxX: maxX + 1.5, minY: 0, maxY: 9.0, minZ: maxZ, maxZ: maxZ + 4.8, tag: 'wall' },
    // Hai hàng rào/tường chắn vô hình ở hai đầu đường (tới y=4.2 để vật bay cũng không lọt ra ngoài)
    { minX: minX - 0.5, maxX: minX, minY: 0, maxY: 4.2, minZ: minZ - 0.1, maxZ: maxZ + 0.1, tag: 'wall' },
    { minX: maxX, maxX: maxX + 0.5, minY: 0, maxY: 4.2, minZ: minZ - 0.1, maxZ: maxZ + 0.1, tag: 'wall' },
  ];

  for (const t of TREE_SPOTS) {
    boxes.push({ minX: t.x - 0.24, maxX: t.x + 0.24, minY: 0, maxY: 2.8, minZ: t.z - 0.24, maxZ: t.z + 0.24, tag: 'wall' });
  }
  for (const l of LAMP_SPOTS) {
    boxes.push({ minX: l.x - 0.14, maxX: l.x + 0.14, minY: 0, maxY: 3.6, minZ: l.z - 0.14, maxZ: l.z + 0.14, tag: 'wall' });
  }
  for (const b of BENCH_SPOTS) {
    boxes.push({ minX: b.x - 0.78, maxX: b.x + 0.78, minY: 0, maxY: 0.85, minZ: b.z - 0.28, maxZ: b.z + 0.28, tag: 'wall' });
  }
  for (const r of BIN_SPOTS) {
    boxes.push({ minX: r.x - 0.25, maxX: r.x + 0.25, minY: 0, maxY: 0.88, minZ: r.z - 0.25, maxZ: r.z + 0.25, tag: 'wall' });
  }

  return boxes;
}
