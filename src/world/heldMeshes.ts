import * as THREE from 'three';
import { PALETTE } from '../styles/palette.ts';
import { makeBox, makeCylinder } from './furniture.ts';

// Tạo mô hình tạm cho vật cầm trên tay/ném có viền đen đồng nhất
export function createHeldMesh(kind: 'cup' | 'broom' | 'mop'): THREE.Object3D {
  const group = new THREE.Group();
  if (kind === 'cup') {
    group.add(makeCylinder(0.055, 0.042, 0.14, PALETTE.creamWall, 0, 0, 0, 0.008));
    group.add(makeCylinder(0.058, 0.058, 0.02, PALETTE.pinkSoft, 0, 0.075, 0, 0.007));
    return group;
  }
  if (kind === 'broom') {
    group.add(makeCylinder(0.017, 0.017, 0.84, PALETTE.teaBrown, 0, 0.16, 0, 0.006));
    group.add(makeCylinder(0.021, 0.021, 0.11, PALETTE.pinkBlush, 0, 0.54, 0, 0.006));
    group.add(makeBox(0.24, 0.045, 0.055, PALETTE.teaDark, 0, -0.25, 0, 0.007));
    group.add(makeBox(0.26, 0.11, 0.048, PALETTE.creamTrim, 0, -0.325, 0, 0.007));
    group.add(makeBox(0.275, 0.036, 0.052, PALETTE.syrupPeach, 0, -0.365, 0, 0.006));
    return group;
  }
  group.add(makeCylinder(0.018, 0.018, 0.84, PALETTE.steelSoft, 0, 0.16, 0, 0.006));
  group.add(makeCylinder(0.022, 0.022, 0.11, PALETTE.matchaGreen, 0, 0.54, 0, 0.006));
  group.add(makeBox(0.24, 0.04, 0.09, PALETTE.matchaGreen, 0, -0.26, 0, 0.007));
  group.add(makeBox(0.29, 0.075, 0.13, PALETTE.matchaMint, 0, -0.315, 0, 0.008));
  group.add(makeBox(0.11, 0.04, 0.14, PALETTE.creamWall, -0.075, -0.35, 0, 0.006));
  group.add(makeBox(0.11, 0.04, 0.14, PALETTE.creamWall, 0.075, -0.35, 0, 0.006));
  return group;
}
