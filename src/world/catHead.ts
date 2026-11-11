import * as THREE from 'three';
import type { CatAccessory, CatVariant } from '../state/catVariants.ts';
import {
  CAT_BASE_HEIGHT,
  CAT_CALICO_DARK_PATCH,
  CAT_EYE_SHINE_COLOR,
  CAT_GLASSES_COLOR,
  CAT_HAT_COLOR,
  CAT_HEAD_RADIUS,
  CAT_HEAD_SCALE,
  CAT_HEAD_Y,
  CAT_INNER_EAR_COLOR,
  CAT_MUZZLE_COLOR,
  CAT_NOSE_COLOR,
} from '../state/constantsCat.ts';
import { createMaterial, type CreateMaterialOptions, type MaterialKind } from '../styles/materials.ts';
import { addOutline } from '../styles/outline.ts';
import { PALETTE } from '../styles/palette.ts';

const EAR_TILT_Z = 0.4;
const EAR_TILT_X = 0.08;
const EAR_EMBED_RATIO = 0.28;
const EAR_RADIUS = 0.114;
const EAR_TIP_RADIUS = 0.026;

// Tạo mesh vật liệu PBR pastel kèm đổ bóng và viền (khi OUTLINE_ENABLED bật)
export function addCatPart(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  color: number,
  x: number,
  y: number,
  z: number,
  outline = 0.01,
  castShadow = true,
  kind: MaterialKind = 'fur',
  matOpts?: CreateMaterialOptions,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, createMaterial(kind, color, matOpts));
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = false;
  addOutline(mesh, outline);
  parent.add(mesh);
  return mesh;
}

function ellipsoidFrontZ(x: number, y: number, rx: number, ry: number, rz: number): number {
  const rem = Math.max(0, 1 - (x / rx) ** 2 - (y / ry) ** 2);
  return rz * Math.sqrt(rem);
}

function addHeadPatterns(
  variant: CatVariant,
  head: THREE.Group,
  rx: number,
  ry: number,
  rz: number,
  shadow: boolean,
): void {
  if (variant.id === 'tabby') {
    for (const sx of [-0.05, 0, 0.05]) {
      const sy = ry * 0.54;
      const sz = ellipsoidFrontZ(sx, sy, rx, ry, rz) + 0.002;
      const m = addCatPart(head, new THREE.BoxGeometry(0.022, 0.072, 0.022), variant.patchColor, sx, sy, sz, 0.004, shadow);
      m.rotation.x = -0.58;
    }
    for (const side of [-1, 1]) {
      for (const cy of [-0.01, -0.05]) {
        const cx = side * rx * 0.93;
        const c = addCatPart(head, new THREE.BoxGeometry(0.024, 0.018, 0.065), variant.patchColor, cx, cy, rz * 0.38, 0.004, shadow);
        c.rotation.y = side * 0.35;
      }
    }
    return;
  }

  if (variant.id === 'calico') {
    const spots: Array<[number, number, number, number, number, [number, number, number]]> = [
      [variant.patchColor, -rx * 0.48, ry * 0.42, rz * 0.46, 0.1, [0.95, 0.9, 0.75]],
      [CAT_CALICO_DARK_PATCH, rx * 0.52, ry * 0.28, -rz * 0.32, 0.1, [0.9, 0.95, 0.85]],
    ];
    for (const [col, x, y, z, r, sc] of spots) {
      const patch = addCatPart(head, new THREE.SphereGeometry(r, 12, 10), col, x, y, z, 0.005, shadow);
      patch.scale.set(sc[0], sc[1], sc[2]);
    }
  }
}

function addHeadAccessory(
  accessory: CatAccessory,
  head: THREE.Group,
  rx: number,
  ry: number,
  eyeX: number,
  eyeY: number,
  eyeSurfaceZ: number,
  shadow: boolean,
): void {
  if (accessory === 'hat') {
    addCatPart(head, new THREE.CylinderGeometry(0.135, 0.148, 0.065, 14), CAT_HAT_COLOR, 0, ry - 0.005, 0.02, 0.007, shadow, 'fabric');
    addCatPart(head, new THREE.BoxGeometry(0.18, 0.02, 0.1), CAT_HAT_COLOR, 0, ry - 0.032, 0.12, 0.006, shadow, 'fabric').rotation.x = 0.12;
    return;
  }
  if (accessory === 'glasses') {
    const gz = eyeSurfaceZ + 0.026;
    const frameOpts = { roughness: 0.34 };
    const lensOpts = { opacity: 0.3 };
    for (const side of [-1, 1]) {
      const ex = side * eyeX;
      addCatPart(head, new THREE.BoxGeometry(0.088, 0.012, 0.014), CAT_GLASSES_COLOR, ex, eyeY + 0.04, gz, 0.003, shadow, 'plastic', frameOpts);
      addCatPart(head, new THREE.BoxGeometry(0.088, 0.012, 0.014), CAT_GLASSES_COLOR, ex, eyeY - 0.04, gz, 0.003, shadow, 'plastic', frameOpts);
      addCatPart(head, new THREE.BoxGeometry(0.012, 0.088, 0.014), CAT_GLASSES_COLOR, ex - 0.04, eyeY, gz, 0.003, shadow, 'plastic', frameOpts);
      addCatPart(head, new THREE.BoxGeometry(0.012, 0.088, 0.014), CAT_GLASSES_COLOR, ex + 0.04, eyeY, gz, 0.003, shadow, 'plastic', frameOpts);
      const lens = addCatPart(head, new THREE.BoxGeometry(0.068, 0.068, 0.004), PALETTE.glassBlue, ex, eyeY, gz, 0, false, 'glass', lensOpts);
      lens.name = 'catGlassLens';
      const temple = addCatPart(head, new THREE.BoxGeometry(0.01, 0.012, 0.12), CAT_GLASSES_COLOR, side * (rx * 0.72), eyeY + 0.01, gz - 0.062, 0.003, shadow, 'plastic', frameOpts);
      temple.rotation.y = side * -0.42;
    }
    addCatPart(head, new THREE.BoxGeometry(0.036, 0.012, 0.014), CAT_GLASSES_COLOR, 0, eyeY + 0.013, gz + 0.002, 0.003, shadow, 'plastic', frameOpts);
  }
}

// Dựng cụm đầu mèo chibi cân đối, hai tai cắm sâu nhẹ vào bề mặt đầu thật và mũi hồng nổi trên mõm
export function buildCatHead(
  variant: CatVariant,
  accessory: CatAccessory,
  shadow: boolean,
): THREE.Group {
  const rx = CAT_HEAD_RADIUS * CAT_HEAD_SCALE.x;
  const ry = CAT_HEAD_RADIUS * CAT_HEAD_SCALE.y;
  const rz = CAT_HEAD_RADIUS * CAT_HEAD_SCALE.z;

  const head = new THREE.Group();
  head.position.set(0, CAT_HEAD_Y, 0);
  const skull = addCatPart(head, new THREE.SphereGeometry(CAT_HEAD_RADIUS, 18, 14), variant.furColor, 0, 0, 0, 0.011, shadow);
  skull.name = 'catSkull';
  skull.scale.set(CAT_HEAD_SCALE.x, CAT_HEAD_SCALE.y, CAT_HEAD_SCALE.z);

  // Tính vị trí và chiều cao tai từ bán kính thật của đầu để tai ngắn gọn, gốc rộng và mép ngoài vẫn chìm vào đầu
  const earOffsetX = rx * 0.5;
  const earZ = -rz * 0.06;
  const skullSurfaceY = ry * Math.sqrt(Math.max(0, 1 - (earOffsetX / rx) ** 2 - (earZ / rz) ** 2));
  const outerX = earOffsetX + EAR_RADIUS * Math.cos(EAR_TILT_Z);
  const skullSurfaceOuterY = ry * Math.sqrt(Math.max(0, 1 - (outerX / rx) ** 2 - (earZ / rz) ** 2));
  const earTipY = CAT_BASE_HEIGHT - CAT_HEAD_Y;
  const projFactor = Math.cos(EAR_TILT_X) * Math.cos(EAR_TILT_Z);
  const rimExtraY = EAR_TIP_RADIUS * Math.hypot(Math.cos(EAR_TILT_X) * Math.sin(EAR_TILT_Z), Math.sin(EAR_TILT_X));
  const earTopCenterY = earTipY - rimExtraY;
  const minEmbedBaseY = skullSurfaceY - (earTopCenterY - skullSurfaceY) * (EAR_EMBED_RATIO / (1 - EAR_EMBED_RATIO));
  const outerBaseMaxY = skullSurfaceOuterY + EAR_RADIUS * Math.sin(EAR_TILT_Z) - 0.015;
  const baseCenterY = Math.min(minEmbedBaseY, outerBaseMaxY);
  const earProjHeight = earTopCenterY - baseCenterY;
  const earHeight = earProjHeight / projFactor;
  const earCenterY = earTopCenterY - earProjHeight * 0.5;

  const eyeX = rx * 0.37;
  const eyeY = ry * 0.08;
  const eyeSurfaceZ = ellipsoidFrontZ(eyeX, eyeY, rx, ry, rz);

  for (const side of [-1, 1]) {
    const earColor =
      variant.id === 'calico'
        ? side === 1
          ? variant.patchColor
          : CAT_CALICO_DARK_PATCH
        : variant.furColor;
    const ear = addCatPart(head, new THREE.CylinderGeometry(EAR_TIP_RADIUS, EAR_RADIUS, earHeight, 10), earColor, side * earOffsetX, earCenterY, earZ, 0.008, shadow);
    ear.name = side < 0 ? 'catEarR' : 'catEarL';
    ear.rotation.set(EAR_TILT_X, 0, -side * EAR_TILT_Z);

    const inner = addCatPart(ear, new THREE.CylinderGeometry(EAR_TIP_RADIUS * 0.45, EAR_RADIUS * 0.56, earHeight * 0.58, 8), CAT_INNER_EAR_COLOR, 0, -earHeight * 0.06, EAR_RADIUS * 0.38, 0.004, shadow);
    inner.name = side < 0 ? 'catInnerEarR' : 'catInnerEarL';

    const eye = addCatPart(head, new THREE.BoxGeometry(0.046, 0.062, 0.028), PALETTE.outline, side * eyeX, eyeY, eyeSurfaceZ + 0.004, 0.003, shadow, 'ceramic', { roughness: 0.12, metalness: 0.08 });
    eye.name = 'catEye';
    const shine = addCatPart(head, new THREE.BoxGeometry(0.014, 0.016, 0.01), CAT_EYE_SHINE_COLOR, side * eyeX + 0.008, eyeY + 0.014, eyeSurfaceZ + 0.018, 0.002, false, 'ceramic', {
      roughness: 0.08,
      emissive: CAT_EYE_SHINE_COLOR,
      emissiveIntensity: 0.25,
    });
    shine.name = 'catEyeShine';

    for (const [wy, rzTilt] of [[-ry * 0.14, 0.1], [-ry * 0.24, -0.1]] as const) {
      const wx = side * rx * 0.72;
      const wz = ellipsoidFrontZ(wx, wy, rx, ry, rz) + 0.014;
      const whisker = addCatPart(head, new THREE.BoxGeometry(0.085, 0.009, 0.009), PALETTE.outline, wx, wy, wz, 0.002, false, 'plastic', { roughness: 0.55 });
      whisker.name = 'catWhisker';
      whisker.rotation.set(0, -side * 0.25, side * rzTilt);
    }
  }

  const muzzleY = -ry * 0.2;
  const muzzleZ = ellipsoidFrontZ(0, muzzleY, rx, ry, rz) - 0.018;
  const muzzle = addCatPart(head, new THREE.SphereGeometry(0.066, 12, 8), CAT_MUZZLE_COLOR, 0, muzzleY, muzzleZ, 0.005, shadow, 'fur');
  muzzle.name = 'catMuzzle';
  muzzle.scale.set(1.28, 0.8, 0.58);

  const nose = addCatPart(head, new THREE.BoxGeometry(0.034, 0.024, 0.022), CAT_NOSE_COLOR, 0, muzzleY + 0.024, muzzleZ + 0.036, 0.003, shadow, 'plastic', { roughness: 0.32 });
  nose.name = 'catNose';

  addHeadPatterns(variant, head, rx, ry, rz, shadow);
  addHeadAccessory(accessory, head, rx, ry, eyeX, eyeY, eyeSurfaceZ, shadow);
  return head;
}
