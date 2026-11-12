import * as THREE from 'three';
import { CAT_HEAD_RADIUS, CAT_HEAD_SCALE } from '../state/constantsCat.ts';
import type { StaffMember } from '../state/staff.ts';
import { createMaterial, markShadow, type MaterialKind } from '../styles/materials.ts';
import { addOutline } from '../styles/outline.ts';
import { PALETTE } from '../styles/palette.ts';
import type { CatRig } from './catModel.ts';
import { createHeldMesh } from './heldMeshes.ts';

function addUniformPart(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  kind: MaterialKind,
  color: number,
  x: number,
  y: number,
  z: number,
  outline: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, createMaterial(kind, color));
  mesh.position.set(x, y, z);
  addOutline(mesh, outline);
  parent.add(mesh);
  return mesh;
}

// Gắn tạp dề, mũ đồng phục theo vai trò và dụng cụ/ly trên tay mèo
export function attachStaffUniform(rig: CatRig, role: StaffMember['role']): void {
  const isCleaner = role === 'cleaner';
  const accentColor = isCleaner ? PALETTE.matchaGreen : PALETTE.pinkBlush;
  const capColor = isCleaner ? PALETTE.matchaMint : PALETTE.teaBrown;
  const apronColor = isCleaner ? PALETTE.creamWall : PALETTE.pinkSoft;

  const apron = addUniformPart(rig.body, new THREE.BoxGeometry(0.32, 0.2, 0.03), 'fabric', apronColor, 0, -0.105, 0.208, 0.007);
  apron.rotation.x = -0.09;
  const pocket = addUniformPart(rig.body, new THREE.BoxGeometry(0.15, 0.085, 0.018), 'fabric', accentColor, 0, -0.115, 0.226, 0.005);
  pocket.rotation.x = -0.09;
  addUniformPart(rig.body, new THREE.CylinderGeometry(0.202, 0.214, 0.04, 14), 'fabric', accentColor, 0, -0.005, 0, 0.006);
  markShadow(rig.body, true, false);

  const headTopY = CAT_HEAD_RADIUS * CAT_HEAD_SCALE.y;
  const capCrown = addUniformPart(rig.head, new THREE.CylinderGeometry(0.135, 0.148, 0.07, 14), 'fabric', capColor, 0, headTopY - 0.005, 0.02, 0.007);
  const capBrim = addUniformPart(rig.head, new THREE.BoxGeometry(0.18, 0.02, 0.1), 'fabric', capColor, 0, headTopY - 0.032, 0.12, 0.006);
  capBrim.rotation.x = 0.12;
  const capBadge = addUniformPart(rig.head, new THREE.BoxGeometry(0.065, 0.032, 0.02), 'plastic', accentColor, 0, headTopY - 0.002, 0.155, 0.004);
  for (const m of [capCrown, capBrim, capBadge]) markShadow(m, true, false);

  if (isCleaner) {
    const tool = new THREE.Group();
    tool.rotation.x = 0.2;
    addUniformPart(tool, new THREE.BoxGeometry(0.04, 0.72, 0.04), 'wood', PALETTE.teaBrown, 0, -0.02, 0, 0.006);
    addUniformPart(tool, new THREE.BoxGeometry(0.18, 0.06, 0.1), 'fabric', PALETTE.creamTrim, 0, -0.36, 0, 0.007);
    markShadow(tool, true, false);
    rig.handAnchorL.add(tool);
  } else {
    const cup = createHeldMesh('cup', { castShadow: true, receiveShadow: false });
    cup.position.set(0, 0.03, 0.02);
    rig.handAnchorL.add(cup);
  }
}
