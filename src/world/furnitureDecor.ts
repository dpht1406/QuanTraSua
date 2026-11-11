import * as THREE from 'three';
import { createMaterial, markShadow } from '../styles/materials.ts';
import { addOutline } from '../styles/outline.ts';
import { PALETTE } from '../styles/palette.ts';
import { makePartBox, makePartCylinder } from './furniturePrimitives.ts';
import { getWoodTableTexture } from './textures.ts';

// Dựng 1 bộ bàn và 2 ghế gỗ tông nâu trà - hồng pastel
export function buildTableSet(): THREE.Group {
  const group = new THREE.Group();
  group.add(makePartBox(0.9, 0.06, 0.78, 'wood', PALETTE.teaBrown, 0, 0.74, 0, {
    map: getWoodTableTexture(),
    roughness: 0.64,
  }));
  const legOffsets = [
    [-0.36, -0.3],
    [0.36, -0.3],
    [-0.36, 0.3],
    [0.36, 0.3],
  ];
  for (const [lx, lz] of legOffsets) {
    group.add(makePartBox(0.06, 0.72, 0.06, 'wood', PALETTE.teaDark, lx, 0.36, lz));
  }
  // 2 ghế đặt hai bên trục X
  for (const dir of [-1, 1]) {
    const cx = dir * 0.72;
    group.add(makePartBox(0.4, 0.05, 0.4, 'fabric', PALETTE.pinkSoft, cx, 0.45, 0));
    group.add(makePartBox(0.05, 0.42, 0.4, 'fabric', PALETTE.pinkBlush, cx + dir * 0.18, 0.68, 0));
    for (const dx of [-0.15, 0.15]) {
      for (const dz of [-0.15, 0.15]) {
        group.add(makePartBox(0.045, 0.43, 0.045, 'wood', PALETTE.teaDark, cx + dx, 0.215, dz));
      }
    }
  }
  return group;
}

// Dựng bảng menu treo tường với các dòng món pastel
export function buildMenuBoard(): THREE.Group {
  const group = new THREE.Group();
  group.add(makePartBox(1.95, 1.05, 0.06, 'wood', PALETTE.teaDark, 0, 0, 0));
  group.add(makePartBox(1.78, 0.88, 0.03, 'paint', PALETTE.creamWall, 0, 0, 0.03, { outline: 0.008 }));
  const bars = [
    { y: 0.24, c: PALETTE.pinkBlush },
    { y: 0.02, c: PALETTE.matchaGreen },
    { y: -0.2, c: PALETTE.syrupPeach },
  ];
  for (const bar of bars) {
    group.add(makePartBox(1.35, 0.12, 0.02, 'paint', bar.c, 0, bar.y, 0.05, { outline: 0.006 }));
  }
  return group;
}

// Dựng cửa ra vào kính khung nâu trà
export function buildDoor(): THREE.Group {
  const group = new THREE.Group();
  group.add(makePartBox(1.44, 2.38, 0.14, 'wood', PALETTE.teaDark, 0, 1.19, 0, {
    castShadow: false,
    receiveShadow: true,
  }));
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.16, 2.08, 0.06),
    createMaterial('glass', PALETTE.glassBlue, { opacity: 0.45 }),
  );
  glass.position.set(0, 1.2, 0);
  markShadow(glass, false, false);
  addOutline(glass, 0.01);
  group.add(glass);
  group.add(makePartBox(0.04, 0.36, 0.07, 'metal', PALETTE.steelSoft, 0.45, 1.05, -0.08, { outline: 0.007 }));
  group.add(makePartBox(0.46, 0.18, 0.04, 'paint', PALETTE.pinkBlush, 0, 1.68, -0.06, { outline: 0.008 }));
  return group;
}

// Dựng thùng rác hình trụ đặt cạnh quầy
export function buildTrashCan(): THREE.Group {
  const group = new THREE.Group();
  group.add(makePartCylinder(0.2, 0.16, 0.48, 'metal', PALETTE.steelSoft, 0, 0.24, 0));
  group.add(makePartCylinder(0.22, 0.22, 0.06, 'plastic', PALETTE.pinkBlush, 0, 0.5, 0, { outline: 0.01 }));
  return group;
}

// Dựng xô và chổi lau nhà đặt góc quán
export function buildMopSet(): THREE.Group {
  const group = new THREE.Group();
  group.add(makePartCylinder(0.18, 0.14, 0.32, 'plastic', PALETTE.matchaMint, 0, 0.16, 0));
  const mopStick = new THREE.Group();
  mopStick.position.set(0.06, 0.12, 0);
  mopStick.rotation.z = -0.18;
  mopStick.add(makePartBox(0.04, 1.2, 0.04, 'wood', PALETTE.teaBrown, 0, 0.6, 0, { outline: 0.008 }));
  mopStick.add(makePartBox(0.26, 0.08, 0.12, 'fabric', PALETTE.creamTrim, 0, 0.02, 0, { outline: 0.01 }));
  group.add(mopStick);
  return group;
}

// Dựng bàn và máy tính nhập hàng đặt gần tường sau
export function buildRestockPc(): THREE.Group {
  const group = new THREE.Group();
  group.add(makePartBox(0.76, 0.05, 0.5, 'wood', PALETTE.teaBrown, 0, 0.74, 0, {
    map: getWoodTableTexture(),
    roughness: 0.64,
  }));
  for (const lx of [-0.32, 0.32]) {
    for (const lz of [-0.2, 0.2]) {
      group.add(makePartBox(0.05, 0.72, 0.05, 'wood', PALETTE.teaDark, lx, 0.36, lz));
    }
  }
  group.add(makePartBox(0.16, 0.12, 0.12, 'metal', PALETTE.steelSoft, 0, 0.82, -0.1, { outline: 0.008 }));
  group.add(makePartBox(0.52, 0.34, 0.04, 'plastic', PALETTE.pinkBlush, 0, 1.03, -0.1, { outline: 0.01 }));
  group.add(makePartBox(0.46, 0.28, 0.02, 'ceramic', PALETTE.glassBlue, 0, 1.03, -0.08, {
    roughness: 0.16,
    emissive: 0x5c8ea8,
    emissiveIntensity: 0.25,
    outline: 0.005,
  }));
  group.add(makePartBox(0.36, 0.03, 0.14, 'plastic', PALETTE.creamWall, -0.05, 0.78, 0.12, { outline: 0.007 }));
  group.add(makePartBox(0.07, 0.03, 0.1, 'plastic', PALETTE.pinkSoft, 0.22, 0.78, 0.12, { outline: 0.006 }));
  return group;
}

// Dựng bảng thông báo treo tường để mở bảng thuê/sa thải nhân viên
export function buildStaffBoard(): THREE.Group {
  const group = new THREE.Group();
  group.add(makePartBox(1.28, 0.88, 0.05, 'wood', PALETTE.teaDark, 0, 0, 0));
  group.add(makePartBox(1.14, 0.74, 0.03, 'fabric', PALETTE.creamTrim, 0, 0, 0.025, { outline: 0.008 }));
  group.add(makePartBox(0.36, 0.26, 0.02, 'paint', PALETTE.pinkSoft, -0.28, 0.12, 0.045, { outline: 0.006 }));
  group.add(makePartBox(0.36, 0.26, 0.02, 'paint', PALETTE.matchaMint, 0.24, 0.12, 0.045, { outline: 0.006 }));
  group.add(makePartBox(0.54, 0.2, 0.02, 'paint', PALETTE.creamWall, 0, -0.18, 0.045, { outline: 0.006 }));
  return group;
}
