import * as THREE from 'three';
import { addOutline } from '../styles/outline.ts';
import { createGlassMaterial, getToonMaterial, PALETTE } from '../styles/palette.ts';

// Tạo khối hộp có MeshToonMaterial, đổ bóng và viền đen
export function makeBox(
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  outlineThickness = 0.014,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), getToonMaterial(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (outlineThickness > 0) addOutline(mesh, outlineThickness);
  return mesh;
}

// Tạo khối trụ có MeshToonMaterial, đổ bóng và viền đen
export function makeCylinder(
  rTop: number,
  rBottom: number,
  h: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  outlineThickness = 0.012,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBottom, h, 16),
    getToonMaterial(color),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (outlineThickness > 0) addOutline(mesh, outlineThickness);
  return mesh;
}

// Dựng quầy pha chế kèm máy tính tiền và khay giao đồ
export function buildCounter(): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox(4.0, 0.94, 0.78, PALETTE.pinkBlush, 0, 0.47, 0));
  group.add(makeBox(4.14, 0.08, 0.9, PALETTE.teaBrown, 0, 0.98, 0));
  group.add(makeBox(3.84, 0.14, 0.06, PALETTE.creamTrim, 0, 0.12, 0.4));
  // Máy POS mini
  group.add(makeBox(0.32, 0.06, 0.28, PALETTE.steelSoft, 1.0, 1.05, 0));
  const screen = makeBox(0.3, 0.24, 0.05, PALETTE.teaDark, 1.0, 1.2, -0.05);
  screen.rotation.x = -0.25;
  group.add(screen);
  // Khay giao ly trà sữa cho khách
  group.add(makeBox(0.62, 0.03, 0.42, PALETTE.matchaMint, 1.55, 1.035, 0.06, 0.008));
  return group;
}

// Dựng kệ ly chồng nhiều ly pastel trên quầy
export function buildCupRack(): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox(0.42, 0.04, 0.32, PALETTE.teaBrown, 0, 0.02, 0, 0.008));
  group.add(makeCylinder(0.065, 0.05, 0.28, PALETTE.creamWall, -0.1, 0.18, 0, 0.009));
  group.add(makeCylinder(0.065, 0.05, 0.22, PALETTE.pinkSoft, 0.1, 0.15, 0, 0.009));
  return group;
}

// Dựng máy ép nắp ly đặt trên quầy
export function buildCupSealer(): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox(0.42, 0.06, 0.42, PALETTE.steelSoft, 0, 0.03, 0, 0.009));
  group.add(makeBox(0.38, 0.46, 0.26, PALETTE.pinkBlush, 0, 0.29, -0.06, 0.01));
  group.add(makeBox(0.34, 0.1, 0.38, PALETTE.creamTrim, 0, 0.48, 0.02, 0.009));
  group.add(makeBox(0.04, 0.22, 0.04, PALETTE.teaDark, 0.22, 0.38, 0.05, 0.007));
  return group;
}

// Dựng máy pha trà sữa tông xanh matcha đặt trên quầy
export function buildTeaMachine(): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox(0.62, 0.58, 0.48, PALETTE.matchaGreen, 0, 0.29, 0));
  group.add(makeBox(0.66, 0.08, 0.52, PALETTE.creamTrim, 0, 0.6, 0));
  group.add(makeBox(0.54, 0.05, 0.22, PALETTE.steelSoft, 0, 0.025, 0.22));
  group.add(makeCylinder(0.04, 0.04, 0.12, PALETTE.steelSoft, -0.14, 0.36, 0.24, 0.008));
  group.add(makeCylinder(0.04, 0.04, 0.12, PALETTE.steelSoft, 0.14, 0.36, 0.24, 0.008));
  group.add(makeCylinder(0.05, 0.04, 0.13, PALETTE.pinkSoft, -0.14, 0.115, 0.24, 0.008));
  return group;
}

// Dựng kệ nguyên liệu 3 tầng tách khu đường (trái) và khu topping (phải)
export function buildShelf(): {
  root: THREE.Group;
  sugarZone: THREE.Group;
  toppingZone: THREE.Group;
} {
  const root = new THREE.Group();
  const postXs = [-0.95, 0.95];
  const postZs = [-0.2, 0.2];
  for (const px of postXs) {
    for (const pz of postZs) {
      root.add(makeBox(0.07, 1.85, 0.07, PALETTE.teaDark, px, 0.925, pz));
    }
  }
  for (const ly of [0.28, 0.9, 1.52]) {
    root.add(makeBox(2.0, 0.06, 0.46, PALETTE.teaBrown, 0, ly, 0));
  }

  // Khu đường bên trái kệ
  const sugarZone = new THREE.Group();
  sugarZone.add(makeBox(0.86, 0.04, 0.4, PALETTE.creamTrim, -0.48, 0.95, 0, 0.008));
  sugarZone.add(makeCylinder(0.11, 0.11, 0.26, PALETTE.creamWall, -0.66, 1.1, 0, 0.009));
  sugarZone.add(makeCylinder(0.11, 0.11, 0.22, PALETTE.syrupPeach, -0.3, 1.08, 0, 0.009));
  sugarZone.add(makeBox(0.75, 0.22, 0.28, PALETTE.creamWall, -0.48, 1.66, 0, 0.009));
  root.add(sugarZone);

  // Khu topping bên phải kệ (trân châu, thạch matcha, thạch đào)
  const toppingZone = new THREE.Group();
  toppingZone.add(makeBox(0.86, 0.04, 0.4, PALETTE.pinkSoft, 0.48, 0.95, 0, 0.008));
  const toppingColors = [PALETTE.bobaDark, PALETTE.matchaGreen, PALETTE.pinkBlush];
  toppingColors.forEach((col, i) => {
    toppingZone.add(makeCylinder(0.09, 0.09, 0.22, col, 0.22 + i * 0.26, 1.08, 0, 0.009));
    toppingZone.add(makeBox(0.18, 0.22, 0.16, col, 0.22 + i * 0.26, 1.66, 0, 0.009));
  });
  root.add(toppingZone);

  return { root, sugarZone, toppingZone };
}

// Dựng tủ lạnh cửa kính tông bạc hà
export function buildFridge(): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox(0.95, 2.05, 0.78, PALETTE.matchaMint, 0, 1.025, 0));
  const doorGlass = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 1.65, 0.04),
    createGlassMaterial(PALETTE.glassBlue, 0.55),
  );
  doorGlass.position.set(0, 1.12, 0.39);
  addOutline(doorGlass, 0.01);
  group.add(doorGlass);
  group.add(makeBox(0.04, 0.38, 0.05, PALETTE.steelSoft, 0.34, 1.1, 0.43, 0.008));
  return group;
}

// Dựng 1 bộ bàn và 2 ghế gỗ tông nâu trà - hồng pastel
export function buildTableSet(): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox(0.9, 0.06, 0.78, PALETTE.teaBrown, 0, 0.74, 0));
  const legOffsets = [
    [-0.36, -0.3],
    [0.36, -0.3],
    [-0.36, 0.3],
    [0.36, 0.3],
  ];
  for (const [lx, lz] of legOffsets) {
    group.add(makeBox(0.06, 0.72, 0.06, PALETTE.teaDark, lx, 0.36, lz));
  }
  // 2 ghế đặt hai bên trục X
  for (const dir of [-1, 1]) {
    const cx = dir * 0.72;
    group.add(makeBox(0.4, 0.05, 0.4, PALETTE.pinkSoft, cx, 0.45, 0));
    group.add(makeBox(0.05, 0.42, 0.4, PALETTE.pinkBlush, cx + dir * 0.18, 0.68, 0));
    for (const dx of [-0.15, 0.15]) {
      for (const dz of [-0.15, 0.15]) {
        group.add(makeBox(0.045, 0.43, 0.045, PALETTE.teaDark, cx + dx, 0.215, dz));
      }
    }
  }
  return group;
}

// Dựng bảng menu treo tường với các dòng món pastel
export function buildMenuBoard(): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox(1.95, 1.05, 0.06, PALETTE.teaDark, 0, 0, 0));
  group.add(makeBox(1.78, 0.88, 0.03, PALETTE.creamWall, 0, 0, 0.03, 0.008));
  const bars = [
    { y: 0.24, c: PALETTE.pinkBlush },
    { y: 0.02, c: PALETTE.matchaGreen },
    { y: -0.2, c: PALETTE.syrupPeach },
  ];
  for (const bar of bars) {
    group.add(makeBox(1.35, 0.12, 0.02, bar.c, 0, bar.y, 0.05, 0.006));
  }
  return group;
}

// Dựng cửa ra vào kính khung nâu trà
export function buildDoor(): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox(1.44, 2.38, 0.14, PALETTE.teaDark, 0, 1.19, 0));
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.16, 2.08, 0.06),
    createGlassMaterial(PALETTE.glassBlue, 0.45),
  );
  glass.position.set(0, 1.2, 0);
  addOutline(glass, 0.01);
  group.add(glass);
  group.add(makeBox(0.04, 0.36, 0.07, PALETTE.steelSoft, 0.45, 1.05, -0.08, 0.007));
  group.add(makeBox(0.46, 0.18, 0.04, PALETTE.pinkBlush, 0, 1.68, -0.06, 0.008));
  return group;
}

// Dựng thùng rác hình trụ đặt cạnh quầy
export function buildTrashCan(): THREE.Group {
  const group = new THREE.Group();
  group.add(makeCylinder(0.2, 0.16, 0.48, PALETTE.steelSoft, 0, 0.24, 0));
  group.add(makeCylinder(0.22, 0.22, 0.06, PALETTE.pinkBlush, 0, 0.5, 0, 0.01));
  return group;
}

// Dựng xô và chổi lau nhà đặt góc quán
export function buildMopSet(): THREE.Group {
  const group = new THREE.Group();
  group.add(makeCylinder(0.18, 0.14, 0.32, PALETTE.matchaMint, 0, 0.16, 0));
  const mopStick = new THREE.Group();
  mopStick.position.set(0.06, 0.12, 0);
  mopStick.rotation.z = -0.18;
  mopStick.add(makeBox(0.04, 1.2, 0.04, PALETTE.teaBrown, 0, 0.6, 0, 0.008));
  mopStick.add(makeBox(0.26, 0.08, 0.12, PALETTE.creamTrim, 0, 0.02, 0, 0.01));
  group.add(mopStick);
  return group;
}

// Dựng bàn và máy tính nhập hàng đặt gần tường sau
export function buildRestockPc(): THREE.Group {
  const group = new THREE.Group();
  // Bàn máy tính nhỏ
  group.add(makeBox(0.76, 0.05, 0.5, PALETTE.teaBrown, 0, 0.74, 0));
  for (const lx of [-0.32, 0.32]) {
    for (const lz of [-0.2, 0.2]) {
      group.add(makeBox(0.05, 0.72, 0.05, PALETTE.teaDark, lx, 0.36, lz));
    }
  }
  // Màn hình và bàn phím pastel
  group.add(makeBox(0.16, 0.12, 0.12, PALETTE.steelSoft, 0, 0.82, -0.1, 0.008));
  group.add(makeBox(0.52, 0.34, 0.04, PALETTE.pinkBlush, 0, 1.03, -0.1, 0.01));
  group.add(makeBox(0.46, 0.28, 0.02, PALETTE.glassBlue, 0, 1.03, -0.08, 0.005));
  group.add(makeBox(0.36, 0.03, 0.14, PALETTE.creamWall, -0.05, 0.78, 0.12, 0.007));
  group.add(makeBox(0.07, 0.03, 0.1, PALETTE.pinkSoft, 0.22, 0.78, 0.12, 0.006));
  return group;
}

// Dựng bảng thông báo treo tường để mở bảng thuê/sa thải nhân viên
export function buildStaffBoard(): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox(1.28, 0.88, 0.05, PALETTE.teaDark, 0, 0, 0));
  group.add(makeBox(1.14, 0.74, 0.03, PALETTE.creamTrim, 0, 0, 0.025, 0.008));
  group.add(makeBox(0.36, 0.26, 0.02, PALETTE.pinkSoft, -0.28, 0.12, 0.045, 0.006));
  group.add(makeBox(0.36, 0.26, 0.02, PALETTE.matchaMint, 0.24, 0.12, 0.045, 0.006));
  group.add(makeBox(0.54, 0.2, 0.02, PALETTE.creamWall, 0, -0.18, 0.045, 0.006));
  return group;
}
