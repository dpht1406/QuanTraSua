import * as THREE from 'three';

export type MaterialKind =
  | 'wood'
  | 'paint'
  | 'plastic'
  | 'metal'
  | 'fabric'
  | 'fur'
  | 'glass'
  | 'ceramic';

export interface CreateMaterialOptions {
  map?: THREE.Texture | null;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}

interface MaterialPreset {
  roughness: number;
  metalness: number;
  transparent?: boolean;
  opacity?: number;
}

const MATERIAL_PRESETS: Record<MaterialKind, MaterialPreset> = {
  wood: { roughness: 0.74, metalness: 0.02 },
  paint: { roughness: 0.86, metalness: 0.0 },
  plastic: { roughness: 0.42, metalness: 0.04 },
  metal: { roughness: 0.34, metalness: 0.48 },
  fabric: { roughness: 0.92, metalness: 0.0 },
  fur: { roughness: 0.88, metalness: 0.0 },
  glass: { roughness: 0.14, metalness: 0.05, transparent: true, opacity: 0.45 },
  ceramic: { roughness: 0.26, metalness: 0.04 },
};

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

// Tạo và cache MeshStandardMaterial theo loại bề mặt để giữ tông pastel mềm và giảm draw/shader overhead
export function createMaterial(
  kind: MaterialKind,
  color: number,
  opts: CreateMaterialOptions = {},
): THREE.MeshStandardMaterial {
  const preset = MATERIAL_PRESETS[kind];
  const roughness = opts.roughness ?? preset.roughness;
  const metalness = opts.metalness ?? preset.metalness;
  const transparent = opts.transparent ?? preset.transparent ?? false;
  const opacity = opts.opacity ?? preset.opacity ?? 1;
  const emissive = opts.emissive;
  const emissiveIntensity = emissive !== undefined ? (opts.emissiveIntensity ?? 1) : 0;
  const map = opts.map ?? null;

  const key = `${kind}|${color}|${roughness}|${metalness}|${emissive ?? ''}|${emissiveIntensity}|${transparent}|${opacity}|${map?.uuid ?? ''}`;
  let mat = materialCache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      transparent,
      opacity,
      depthWrite: !transparent,
      ...(map ? { map } : {}),
      ...(emissive !== undefined ? { emissive, emissiveIntensity } : {}),
    });
    materialCache.set(key, mat);
  }
  return mat;
}

// Gán castShadow/receiveShadow cho toàn cây con, luôn giữ viền __outline không đổ/nhận bóng
export function markShadow(obj: THREE.Object3D, cast: boolean, receive: boolean): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh && child.name !== '__outline') {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}

// Đánh dấu biên dịch lại shader vật liệu khi thay đổi bật/tắt shadowMap hoặc số đèn hoạt động
export function invalidateAllMaterials(): void {
  for (const mat of materialCache.values()) {
    mat.needsUpdate = true;
  }
}
