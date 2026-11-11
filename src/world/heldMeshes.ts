import * as THREE from 'three';
import { createMaterial, markShadow, type MaterialKind } from '../styles/materials.ts';
import { addOutline } from '../styles/outline.ts';
import { PALETTE } from '../styles/palette.ts';

export interface HeldMeshOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
  viewmodel?: boolean;
}

function addHeldPart(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  kind: MaterialKind,
  color: number,
  x: number,
  y: number,
  z: number,
  outline: number,
  viewmodel: boolean,
  roughness?: number,
): THREE.Mesh {
  const emissiveOpts = viewmodel
    ? { emissive: color, emissiveIntensity: kind === 'glass' ? 0.08 : 0.16 }
    : {};
  const mat = createMaterial(kind, color, {
    ...(roughness !== undefined ? { roughness } : {}),
    ...emissiveOpts,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (outline > 0) addOutline(mesh, outline);
  parent.add(mesh);
  return mesh;
}

// Tạo mô hình vật cầm/ném bán thực tế (ly nhựa trong + nắp + ống hút, chổi gỗ + sợi, cây lau gỗ + vải)
export function createHeldMesh(
  kind: 'cup' | 'broom' | 'mop',
  opts: HeldMeshOptions = {},
): THREE.Object3D {
  const viewmodel = opts.viewmodel ?? false;
  const group = new THREE.Group();

  if (kind === 'cup') {
    const topping = addHeldPart(group, new THREE.CylinderGeometry(0.039, 0.036, 0.022, 14), 'plastic', PALETTE.bobaDark, 0, -0.052, 0, 0, viewmodel, 0.25);
    topping.name = 'cupTopping';
    const liquid = addHeldPart(group, new THREE.CylinderGeometry(0.05, 0.039, 0.092, 16), 'plastic', PALETTE.teaBrown, 0, 0.002, 0, 0, viewmodel, 0.3);
    liquid.name = 'cupLiquid';
    const outer = addHeldPart(group, new THREE.CylinderGeometry(0.055, 0.042, 0.14, 16), 'glass', PALETTE.glassBlue, 0, 0, 0, 0.008, viewmodel, 0.16);
    outer.name = 'cupShell';

    const lidGroup = new THREE.Group();
    lidGroup.name = 'cupLid';
    addHeldPart(lidGroup, new THREE.CylinderGeometry(0.058, 0.058, 0.018, 16), 'plastic', PALETTE.pinkSoft, 0, 0.074, 0, 0.007, viewmodel, 0.36);
    addHeldPart(lidGroup, new THREE.CylinderGeometry(0.051, 0.056, 0.012, 16), 'plastic', PALETTE.creamWall, 0, 0.088, 0, 0.006, viewmodel, 0.38);
    const straw = addHeldPart(lidGroup, new THREE.CylinderGeometry(0.006, 0.006, 0.095, 10), 'plastic', PALETTE.pinkBlush, 0.016, 0.112, 0, 0.003, viewmodel, 0.35);
    straw.rotation.z = -0.18;
    group.add(lidGroup);
  } else if (kind === 'broom') {
    addHeldPart(group, new THREE.CylinderGeometry(0.017, 0.017, 0.84, 12), 'wood', PALETTE.teaBrown, 0, 0.16, 0, 0.006, viewmodel);
    addHeldPart(group, new THREE.CylinderGeometry(0.021, 0.021, 0.11, 12), 'plastic', PALETTE.pinkBlush, 0, 0.54, 0, 0.006, viewmodel);
    addHeldPart(group, new THREE.BoxGeometry(0.24, 0.045, 0.055), 'wood', PALETTE.teaDark, 0, -0.25, 0, 0.007, viewmodel);
    addHeldPart(group, new THREE.BoxGeometry(0.255, 0.045, 0.048), 'fabric', PALETTE.creamTrim, 0, -0.292, 0, 0.007, viewmodel, 0.94);
    for (let i = 0; i < 5; i++) {
      const bx = (i - 2) * 0.054;
      const col = i % 2 === 0 ? PALETTE.creamTrim : PALETTE.syrupPeach;
      addHeldPart(group, new THREE.BoxGeometry(0.046, 0.082, 0.048), 'fabric', col, bx, -0.348, 0, 0.005, viewmodel, 0.95);
    }
  } else {
    addHeldPart(group, new THREE.CylinderGeometry(0.018, 0.018, 0.84, 12), 'wood', PALETTE.floorAccent, 0, 0.16, 0, 0.006, viewmodel);
    addHeldPart(group, new THREE.CylinderGeometry(0.022, 0.022, 0.11, 12), 'plastic', PALETTE.matchaGreen, 0, 0.54, 0, 0.006, viewmodel);
    addHeldPart(group, new THREE.BoxGeometry(0.24, 0.04, 0.09), 'plastic', PALETTE.matchaGreen, 0, -0.26, 0, 0.007, viewmodel);
    addHeldPart(group, new THREE.BoxGeometry(0.29, 0.075, 0.13), 'fabric', PALETTE.matchaMint, 0, -0.315, 0, 0.008, viewmodel, 0.94);
    addHeldPart(group, new THREE.BoxGeometry(0.11, 0.04, 0.14), 'fabric', PALETTE.creamWall, -0.075, -0.35, 0, 0.006, viewmodel, 0.94);
    addHeldPart(group, new THREE.BoxGeometry(0.11, 0.04, 0.14), 'fabric', PALETTE.creamWall, 0.075, -0.35, 0, 0.006, viewmodel, 0.94);
  }

  markShadow(group, viewmodel ? false : (opts.castShadow ?? true), viewmodel ? false : (opts.receiveShadow ?? false));
  return group;
}
