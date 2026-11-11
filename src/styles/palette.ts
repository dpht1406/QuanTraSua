import * as THREE from 'three';

export const PALETTE = {
  background: 0xfff5e9,
  creamWall: 0xfff0db,
  creamTrim: 0xffe2c2,
  floorLight: 0xf9e5cc,
  floorAccent: 0xf1d2b1,
  pinkBlush: 0xf6b0bc,
  pinkSoft: 0xfbd7de,
  teaBrown: 0xb9825c,
  teaDark: 0x7b4f34,
  matchaGreen: 0xa2c9a6,
  matchaMint: 0xcbe5ce,
  steelSoft: 0xd7dfe6,
  glassBlue: 0xcde8f4,
  syrupPeach: 0xf8b88b,
  bobaDark: 0x4b362b,
  outline: 0x1c1615,
  ambientLight: 0xfff7ee,
  sunLight: 0xfff2dc,
} as const;

let cachedGradientMap: THREE.DataTexture | null = null;
const toonCache = new Map<number, THREE.MeshToonMaterial>();

// Tạo texture gradient 3 mức sáng cho MeshToonMaterial
function getToonGradientMap(): THREE.DataTexture {
  if (cachedGradientMap) return cachedGradientMap;

  const data = new Uint8Array([
    115, 115, 115, 255,
    190, 190, 190, 255,
    255, 255, 255, 255,
  ]);
  const texture = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  cachedGradientMap = texture;
  return texture;
}

// Lấy hoặc tạo MeshToonMaterial dùng chung theo mã màu pastel
export function getToonMaterial(color: number): THREE.MeshToonMaterial {
  let mat = toonCache.get(color);
  if (!mat) {
    mat = new THREE.MeshToonMaterial({
      color,
      gradientMap: getToonGradientMap(),
    });
    toonCache.set(color, mat);
  }
  return mat;
}

// Tạo vật liệu kính mờ tông pastel cho cửa và tủ lạnh
export function createGlassMaterial(color = PALETTE.glassBlue, opacity = 0.45): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getToonGradientMap(),
    transparent: true,
    opacity,
  });
}
