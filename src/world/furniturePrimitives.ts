import * as THREE from 'three';
import {
  createMaterial,
  markShadow,
  type CreateMaterialOptions,
  type MaterialKind,
} from '../styles/materials.ts';
import { addOutline } from '../styles/outline.ts';

export interface PartOptions extends CreateMaterialOptions {
  outline?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

// Tạo khối hộp dùng MeshStandardMaterial theo loại vật liệu, cấu hình đổ bóng và viền (nếu bật)
export function makePartBox(
  w: number,
  h: number,
  d: number,
  kind: MaterialKind,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  opts: PartOptions = {},
): THREE.Mesh {
  const { outline = 0.014, castShadow = true, receiveShadow = true, ...matOpts } = opts;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    createMaterial(kind, color, matOpts),
  );
  mesh.position.set(x, y, z);
  markShadow(mesh, castShadow, receiveShadow);
  if (outline > 0) addOutline(mesh, outline);
  return mesh;
}

// Tạo khối trụ dùng MeshStandardMaterial theo loại vật liệu, cấu hình đổ bóng và viền (nếu bật)
export function makePartCylinder(
  rTop: number,
  rBottom: number,
  h: number,
  kind: MaterialKind,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  opts: PartOptions = {},
): THREE.Mesh {
  const { outline = 0.012, castShadow = true, receiveShadow = true, ...matOpts } = opts;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBottom, h, 16),
    createMaterial(kind, color, matOpts),
  );
  mesh.position.set(x, y, z);
  markShadow(mesh, castShadow, receiveShadow);
  if (outline > 0) addOutline(mesh, outline);
  return mesh;
}
