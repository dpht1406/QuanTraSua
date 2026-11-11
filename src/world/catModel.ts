import * as THREE from 'three';
import { getCatVariant, type CatAccessory, type CatVariant, type CatVariantId } from '../state/catVariants.ts';
import {
  CAT_BASE_HEIGHT,
  CAT_BOW_COLOR,
  CAT_CALICO_DARK_PATCH,
  CAT_IDLE_FREQ,
  CAT_SCARF_COLOR,
  CAT_WALK_FREQ_MULT,
  CAT_WORK_FREQ_MULT,
} from '../state/constantsCat.ts';
import { markShadow } from '../styles/materials.ts';
import { PALETTE } from '../styles/palette.ts';
import { addCatPart, buildCatHead } from './catHead.ts';

export type CatMoveMode = 'idle' | 'walk' | 'work';

export interface CatModelOptions {
  scale?: number;
  outfitColor?: number;
  accessory?: CatAccessory;
  castShadow?: boolean;
}

export interface CatRig {
  root: THREE.Group;
  head: THREE.Group;
  body: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  tail: THREE.Group;
  handAnchorL: THREE.Group;
  handAnchorR: THREE.Group;
  height: number;
}

function addBodyPatterns(
  variant: CatVariant,
  body: THREE.Group,
  tail: THREE.Group,
  armL: THREE.Group,
  armR: THREE.Group,
  shadow: boolean,
): void {
  if (variant.id === 'tabby') {
    addCatPart(tail, new THREE.CylinderGeometry(0.04, 0.04, 0.045, 10), variant.patchColor, 0, 0.13, -0.12, 0.004, shadow).rotation.x = -0.25;
    addCatPart(tail, new THREE.CylinderGeometry(0.039, 0.039, 0.04, 10), variant.patchColor, 0, 0.24, -0.13, 0.004, shadow).rotation.x = 0.35;
    addCatPart(armL, new THREE.CylinderGeometry(0.055, 0.053, 0.035, 10), variant.patchColor, 0, -0.17, 0, 0.004, shadow);
    addCatPart(armR, new THREE.CylinderGeometry(0.055, 0.053, 0.035, 10), variant.patchColor, 0, -0.17, 0, 0.004, shadow);
    return;
  }
  if (variant.id === 'calico') {
    const p1 = addCatPart(body, new THREE.SphereGeometry(0.095, 12, 10), variant.patchColor, 0.1, 0.04, -0.11, 0.005, shadow);
    p1.scale.set(0.95, 1.0, 0.7);
    const p2 = addCatPart(body, new THREE.SphereGeometry(0.09, 12, 10), CAT_CALICO_DARK_PATCH, -0.1, -0.05, -0.12, 0.005, shadow);
    p2.scale.set(0.9, 0.9, 0.75);
    addCatPart(tail, new THREE.SphereGeometry(0.043, 10, 8), CAT_CALICO_DARK_PATCH, 0, 0.16, -0.125, 0.004, shadow);
  }
}

function addBodyAccessory(accessory: CatAccessory, body: THREE.Group, shadow: boolean): void {
  if (accessory === 'bow') {
    for (const side of [-1, 1]) {
      const wing = addCatPart(body, new THREE.BoxGeometry(0.07, 0.05, 0.03), CAT_BOW_COLOR, side * 0.045, 0.22, 0.172, 0.005, shadow, 'fabric');
      wing.rotation.z = side * 0.25;
    }
    addCatPart(body, new THREE.BoxGeometry(0.034, 0.036, 0.038), CAT_BOW_COLOR, 0, 0.22, 0.176, 0.005, shadow, 'fabric');
    return;
  }
  if (accessory === 'scarf') {
    addCatPart(body, new THREE.CylinderGeometry(0.182, 0.192, 0.075, 14), CAT_SCARF_COLOR, 0, 0.23, 0, 0.007, shadow, 'fabric');
    const tail = addCatPart(body, new THREE.BoxGeometry(0.08, 0.16, 0.032), CAT_SCARF_COLOR, 0.06, 0.125, 0.185, 0.006, shadow, 'fabric');
    tail.rotation.set(-0.14, 0, -0.15);
  }
}

// Dựng nhân vật mèo chibi đứng 2 chân từ khối cơ bản, gốc root đặt tại chân y = 0, mặt hướng +Z
export function createCat(variantId: CatVariantId, opts: CatModelOptions = {}): CatRig {
  const variant = getCatVariant(variantId);
  const scale = opts.scale ?? 1;
  const outfitColor = opts.outfitColor ?? variant.outfitColor;
  const accessory = opts.accessory ?? variant.accessory;
  const shadow = opts.castShadow ?? true;

  const root = new THREE.Group();
  if (scale !== 1) root.scale.setScalar(scale);

  // Thân nhỏ mặc áo + cổ áo + túi trước
  const body = new THREE.Group();
  body.position.set(0, 0.64, 0);
  addCatPart(body, new THREE.CylinderGeometry(0.16, 0.21, 0.5, 14), outfitColor, 0, 0, 0, 0.011, shadow, 'fabric');
  addCatPart(body, new THREE.CylinderGeometry(0.168, 0.168, 0.055, 14), PALETTE.creamWall, 0, 0.23, 0, 0.007, shadow, 'fabric');
  addCatPart(body, new THREE.BoxGeometry(0.16, 0.13, 0.025), PALETTE.creamWall, 0, -0.04, 0.184, 0.005, shadow, 'fabric');
  root.add(body);

  // Hai chân (+X trái, -X phải theo hướng nhìn +Z); đáy bàn chân chạm đúng y = 0
  const makeLeg = (x: number): THREE.Group => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.39, 0);
    addCatPart(leg, new THREE.CylinderGeometry(0.068, 0.062, 0.33, 12), variant.furColor, 0, -0.165, 0, 0.009, shadow, 'fur');
    const paw = addCatPart(leg, new THREE.SphereGeometry(0.07, 12, 8), variant.furColor, 0, -0.35, 0.02, 0.008, shadow, 'fur');
    paw.scale.set(0.95, 0.5714, 1.2);
    return leg;
  };
  const legL = makeLeg(0.1);
  const legR = makeLeg(-0.1);
  root.add(legL, legR);

  // Hai tay có bàn tay tròn và Group rỗng handAnchor đặt ở lòng bàn tay
  const makeArm = (x: number, anchorName: string): { arm: THREE.Group; anchor: THREE.Group } => {
    const arm = new THREE.Group();
    arm.position.set(x, 0.82, 0);
    addCatPart(arm, new THREE.CylinderGeometry(0.062, 0.068, 0.1, 12), outfitColor, 0, -0.05, 0, 0.007, shadow, 'fabric');
    addCatPart(arm, new THREE.CylinderGeometry(0.052, 0.048, 0.2, 12), variant.furColor, 0, -0.17, 0, 0.008, shadow, 'fur');
    addCatPart(arm, new THREE.SphereGeometry(0.062, 12, 10), variant.furColor, 0, -0.29, 0.01, 0.007, shadow, 'fur');
    const anchor = new THREE.Group();
    anchor.name = anchorName;
    anchor.position.set(0, -0.29, 0.05);
    arm.add(anchor);
    return { arm, anchor };
  };
  const leftArm = makeArm(0.22, 'handAnchorL');
  const rightArm = makeArm(-0.22, 'handAnchorR');
  root.add(leftArm.arm, rightArm.arm);

  // Đuôi cong ở phía sau (-Z)
  const tail = new THREE.Group();
  tail.position.set(0, 0.46, -0.18);
  addCatPart(tail, new THREE.CylinderGeometry(0.036, 0.038, 0.14, 10), variant.furColor, 0, 0.04, -0.05, 0.007, shadow, 'fur').rotation.x = -0.85;
  addCatPart(tail, new THREE.CylinderGeometry(0.036, 0.036, 0.14, 10), variant.furColor, 0, 0.13, -0.12, 0.007, shadow, 'fur').rotation.x = -0.25;
  addCatPart(tail, new THREE.CylinderGeometry(0.034, 0.036, 0.13, 10), variant.furColor, 0, 0.24, -0.13, 0.007, shadow, 'fur').rotation.x = 0.35;
  const tailTipColor = variant.id === 'calico' ? variant.patchColor : variant.id === 'tabby' ? variant.furColor : variant.patchColor;
  addCatPart(tail, new THREE.SphereGeometry(0.042, 10, 8), tailTipColor, 0, 0.3, -0.1, 0.007, shadow, 'fur');
  root.add(tail);

  addBodyPatterns(variant, body, tail, leftArm.arm, rightArm.arm, shadow);
  addBodyAccessory(accessory, body, shadow);

  const head = buildCatHead(variant, accessory, shadow);
  root.add(head);

  // Mèo chỉ đổ bóng lên sàn/nội thất, không receiveShadow trên chính mình để tránh vệt tự bóng
  markShadow(root, shadow, false);
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && (obj.name === 'catEyeShine' || obj.name === 'catWhisker' || obj.name === 'catGlassLens')) {
      obj.castShadow = false;
    }
  });

  return {
    root,
    head,
    body,
    armL: leftArm.arm,
    armR: rightArm.arm,
    legL,
    legR,
    tail,
    handAnchorL: leftArm.anchor,
    handAnchorR: rightArm.anchor,
    height: CAT_BASE_HEIGHT * scale,
  };
}

// Hoạt ảnh khớp con cho mèo (không đụng rig.root để giữ nguyên fallAnimation/vị trí)
export function animateCat(rig: CatRig, mode: CatMoveMode, t: number, speed = 1): void {
  if (mode === 'idle') {
    const breath = Math.sin(t * CAT_IDLE_FREQ);
    rig.body.rotation.set(breath * 0.03, 0, 0);
    rig.head.rotation.set(Math.sin(t * CAT_IDLE_FREQ - 0.5) * 0.03, Math.sin(t * 1.1) * 0.05, 0);
    rig.armL.rotation.set(Math.sin(t * 2.0) * 0.04, 0, 0.1);
    rig.armR.rotation.set(-Math.sin(t * 2.0) * 0.04, 0, -0.1);
    rig.legL.rotation.set(0, 0, 0);
    rig.legR.rotation.set(0, 0, 0);
    rig.tail.rotation.set(Math.sin(t * 1.3) * 0.06, Math.sin(t * 2.6) * 0.28, 0);
    return;
  }

  if (mode === 'walk') {
    const w = t * Math.max(0.4, speed) * CAT_WALK_FREQ_MULT;
    const amp = speed <= 0 ? 0 : Math.min(0.7, 0.32 + speed * 0.16);
    const s = Math.sin(w) * amp;
    rig.legL.rotation.set(s, 0, 0);
    rig.legR.rotation.set(-s, 0, 0);
    rig.armL.rotation.set(-s * 0.85, 0, 0.12);
    rig.armR.rotation.set(s * 0.85, 0, -0.12);
    rig.body.rotation.set(0.06, 0, Math.sin(w) * 0.04);
    rig.head.rotation.set(-0.03, 0, -Math.sin(w) * 0.03);
    rig.tail.rotation.set(0.12, Math.sin(w * 0.8) * 0.36, 0);
    return;
  }

  // 'work': hai tay vung nhẹ về phía trước
  const w = t * Math.max(0.5, speed) * CAT_WORK_FREQ_MULT;
  const swing = Math.sin(w) * 0.38;
  rig.armL.rotation.set(-0.55 + swing, 0, 0.16);
  rig.armR.rotation.set(-0.55 - swing, 0, -0.16);
  rig.legL.rotation.set(0, 0, 0);
  rig.legR.rotation.set(0, 0, 0);
  rig.body.rotation.set(0.08, 0, Math.sin(w * 0.5) * 0.05);
  rig.head.rotation.set(0.08 + Math.sin(w) * 0.05, Math.sin(w * 0.5) * 0.06, 0);
  rig.tail.rotation.set(0.05, Math.sin(w * 0.7) * 0.32, 0);
}
