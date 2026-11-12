import * as THREE from 'three';
import { createMaterial, markShadow } from '../styles/materials.ts';
import { PALETTE } from '../styles/palette.ts';
import { makePartBox, makePartCylinder } from './furniturePrimitives.ts';
import { BENCH_SPOTS, BIN_SPOTS, LAMP_SPOTS, TREE_SPOTS } from './streetColliders.ts';

function buildStreetTree(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'streetTree';
  g.position.set(x, 0, z);

  // Bồn cây thấp ngang mặt vỉa hè
  g.add(makePartBox(0.68, 0.04, 0.68, 'paint', 0xa89d91, 0, 0.02, 0, { outline: 0, castShadow: false }));
  g.add(makePartCylinder(0.11, 0.15, 1.55, 'wood', PALETTE.teaDark, 0, 0.78, 0, { outline: 0 }));

  const leafMatA = createMaterial('paint', PALETTE.matchaGreen, { roughness: 0.85 });
  const leafMatB = createMaterial('paint', PALETTE.matchaMint, { roughness: 0.85 });
  const crownGeoA = new THREE.IcosahedronGeometry(0.68, 1);
  const crownGeoB = new THREE.IcosahedronGeometry(0.5, 1);

  const mainCrown = new THREE.Mesh(crownGeoA, leafMatA);
  mainCrown.position.set(0, 2.02, 0);
  markShadow(mainCrown, true, true);
  g.add(mainCrown);

  const sideCrown = new THREE.Mesh(crownGeoB, leafMatB);
  sideCrown.position.set(0.28, 2.34, 0.14);
  markShadow(sideCrown, true, true);
  g.add(sideCrown);

  const topCrown = new THREE.Mesh(crownGeoB, leafMatA);
  topCrown.position.set(-0.22, 2.28, -0.14);
  markShadow(topCrown, true, true);
  g.add(topCrown);

  return g;
}

function buildStreetLamp(x: number, z: number, armDirZ: 1 | -1): THREE.Group {
  const g = new THREE.Group();
  g.name = 'streetLamp';
  g.position.set(x, 0, z);

  g.add(makePartCylinder(0.12, 0.15, 0.24, 'metal', 0x484d57, 0, 0.12, 0, { outline: 0 }));
  g.add(makePartCylinder(0.055, 0.08, 3.25, 'metal', 0x484d57, 0, 1.72, 0, { outline: 0 }));
  g.add(makePartBox(0.08, 0.07, 0.58, 'metal', 0x484d57, 0, 3.32, armDirZ * 0.26, { outline: 0 }));
  g.add(makePartBox(0.24, 0.06, 0.24, 'metal', 0x3b4049, 0, 3.26, armDirZ * 0.5, { outline: 0 }));

  const bulb = makePartBox(0.2, 0.1, 0.2, 'ceramic', 0xfff3d4, 0, 3.19, armDirZ * 0.5, {
    emissive: 0xffe4a8,
    emissiveIntensity: 0.7,
    outline: 0,
    castShadow: false,
    receiveShadow: false,
  });
  bulb.name = 'streetLampBulb';
  g.add(bulb);
  return g;
}

function buildStreetBench(x: number, z: number, yaw: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'streetBench';
  g.position.set(x, 0, z);
  g.rotation.y = yaw;

  g.add(makePartBox(0.12, 0.42, 0.48, 'paint', 0xb8b2aa, -0.58, 0.21, 0, { outline: 0 }));
  g.add(makePartBox(0.12, 0.42, 0.48, 'paint', 0xb8b2aa, 0.58, 0.21, 0, { outline: 0 }));
  g.add(makePartBox(1.48, 0.07, 0.5, 'wood', PALETTE.teaBrown, 0, 0.44, 0.02, { outline: 0 }));
  g.add(makePartBox(1.48, 0.34, 0.07, 'wood', PALETTE.teaDark, 0, 0.67, -0.2, { outline: 0 }));
  return g;
}

function buildStreetTrashBin(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'streetTrashBin';
  g.position.set(x, 0, z);

  g.add(makePartCylinder(0.22, 0.2, 0.68, 'metal', 0x6f8b7d, 0, 0.34, 0, { outline: 0 }));
  g.add(makePartCylinder(0.24, 0.24, 0.08, 'metal', 0x45534d, 0, 0.72, 0, { outline: 0 }));
  g.add(makePartCylinder(0.19, 0.22, 0.14, 'plastic', PALETTE.creamTrim, 0, 0.81, 0, { outline: 0 }));
  return g;
}

// Dựng cây xanh, cột đèn, ghế đá và thùng rác ngoài đường khớp tọa độ collider tĩnh
export function buildStreetProps(): { group: THREE.Group; shadowCasters: THREE.Object3D[] } {
  const group = new THREE.Group();
  group.name = 'streetProps';
  const shadowCasters: THREE.Object3D[] = [];

  for (const t of TREE_SPOTS) {
    const tree = buildStreetTree(t.x, t.z);
    group.add(tree);
    shadowCasters.push(tree);
  }
  for (const l of LAMP_SPOTS) {
    const lamp = buildStreetLamp(l.x, l.z, l.armDirZ);
    group.add(lamp);
    shadowCasters.push(lamp);
  }
  for (const b of BENCH_SPOTS) {
    const bench = buildStreetBench(b.x, b.z, b.yaw);
    group.add(bench);
    shadowCasters.push(bench);
  }
  for (const r of BIN_SPOTS) {
    const bin = buildStreetTrashBin(r.x, r.z);
    group.add(bin);
    shadowCasters.push(bin);
  }

  // Thêm vài cây cảnh nền phía ngoài hàng rào hai đầu phố cho tầm nhìn tự nhiên hơn
  for (const [bx, bz] of [[-13.5, 6.28], [13.5, 6.28], [-14.2, 12.12], [14.2, 12.12]]) {
    const bgTree = buildStreetTree(bx, bz);
    group.add(bgTree);
    shadowCasters.push(bgTree);
  }

  return { group, shadowCasters };
}
