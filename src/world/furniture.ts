import * as THREE from 'three';
import { createMaterial, markShadow } from '../styles/materials.ts';
import { addOutline } from '../styles/outline.ts';
import { PALETTE } from '../styles/palette.ts';
import { makePartBox, makePartCylinder } from './furniturePrimitives.ts';
import { getWoodTableTexture } from './textures.ts';

export {
  buildDoor,
  buildMenuBoard,
  buildMopSet,
  buildRestockPc,
  buildStaffBoard,
  buildTableSet,
  buildTrashCan,
} from './furnitureDecor.ts';

// Dựng quầy pha chế kèm máy tính tiền và khay giao đồ
export function buildCounter(): THREE.Group {
  const group = new THREE.Group();
  const woodMap = getWoodTableTexture();
  group.add(makePartBox(4.0, 0.94, 0.78, 'paint', PALETTE.pinkBlush, 0, 0.47, 0, { roughness: 0.74 }));
  group.add(makePartBox(4.14, 0.08, 0.9, 'wood', PALETTE.teaBrown, 0, 0.98, 0, { map: woodMap, roughness: 0.64 }));
  group.add(makePartBox(3.84, 0.14, 0.06, 'wood', PALETTE.creamTrim, 0, 0.12, 0.4));
  // Máy POS mini
  group.add(makePartBox(0.32, 0.06, 0.28, 'metal', PALETTE.steelSoft, 1.0, 1.05, 0));
  const screen = makePartBox(0.3, 0.24, 0.05, 'plastic', PALETTE.teaDark, 1.0, 1.2, -0.05, {
    roughness: 0.24,
    emissive: 0x263238,
    emissiveIntensity: 0.2,
  });
  screen.rotation.x = -0.25;
  group.add(screen);
  // Khay giao ly trà sữa cho khách
  group.add(makePartBox(0.62, 0.03, 0.42, 'plastic', PALETTE.matchaMint, 1.55, 1.035, 0.06, { outline: 0.008 }));
  return group;
}

// Dựng kệ ly chồng nhiều ly pastel trên quầy
export function buildCupRack(): THREE.Group {
  const group = new THREE.Group();
  group.add(makePartBox(0.42, 0.04, 0.32, 'wood', PALETTE.teaBrown, 0, 0.02, 0, {
    map: getWoodTableTexture(),
    outline: 0.008,
  }));
  group.add(makePartCylinder(0.065, 0.05, 0.28, 'plastic', PALETTE.creamWall, -0.1, 0.18, 0, { outline: 0.009 }));
  group.add(makePartCylinder(0.065, 0.05, 0.22, 'plastic', PALETTE.pinkSoft, 0.1, 0.15, 0, { outline: 0.009 }));
  return group;
}

// Dựng máy ép nắp ly đặt trên quầy
export function buildCupSealer(): THREE.Group {
  const group = new THREE.Group();
  group.add(makePartBox(0.42, 0.06, 0.42, 'metal', PALETTE.steelSoft, 0, 0.03, 0, { outline: 0.009 }));
  group.add(makePartBox(0.38, 0.46, 0.26, 'plastic', PALETTE.pinkBlush, 0, 0.29, -0.06, {
    roughness: 0.36,
    outline: 0.01,
  }));
  group.add(makePartBox(0.34, 0.1, 0.38, 'plastic', PALETTE.creamTrim, 0, 0.48, 0.02, { outline: 0.009 }));
  group.add(makePartBox(0.04, 0.22, 0.04, 'metal', PALETTE.teaDark, 0.22, 0.38, 0.05, { outline: 0.007 }));
  return group;
}

// Dựng máy pha trà sữa tông xanh matcha đặt trên quầy
export function buildTeaMachine(): THREE.Group {
  const group = new THREE.Group();
  group.add(makePartBox(0.62, 0.58, 0.48, 'plastic', PALETTE.matchaGreen, 0, 0.29, 0, { roughness: 0.34 }));
  group.add(makePartBox(0.66, 0.08, 0.52, 'plastic', PALETTE.creamTrim, 0, 0.6, 0, { roughness: 0.38 }));
  group.add(makePartBox(0.54, 0.05, 0.22, 'metal', PALETTE.steelSoft, 0, 0.025, 0.22));
  group.add(makePartCylinder(0.04, 0.04, 0.12, 'metal', PALETTE.steelSoft, -0.14, 0.36, 0.24, { outline: 0.008 }));
  group.add(makePartCylinder(0.04, 0.04, 0.12, 'metal', PALETTE.steelSoft, 0.14, 0.36, 0.24, { outline: 0.008 }));
  group.add(makePartCylinder(0.05, 0.04, 0.13, 'ceramic', PALETTE.pinkSoft, -0.14, 0.115, 0.24, { outline: 0.008 }));
  return group;
}

// Dựng kệ nguyên liệu 3 tầng tách khu đường (trái) và khu topping (phải)
export function buildShelf(): {
  root: THREE.Group;
  sugarZone: THREE.Group;
  toppingZone: THREE.Group;
} {
  const root = new THREE.Group();
  const woodMap = getWoodTableTexture();
  const postXs = [-0.95, 0.95];
  const postZs = [-0.2, 0.2];
  for (const px of postXs) {
    for (const pz of postZs) {
      root.add(makePartBox(0.07, 1.85, 0.07, 'wood', PALETTE.teaDark, px, 0.925, pz));
    }
  }
  for (const ly of [0.28, 0.9, 1.52]) {
    root.add(makePartBox(2.0, 0.06, 0.46, 'wood', PALETTE.teaBrown, 0, ly, 0, {
      map: woodMap,
      roughness: 0.68,
    }));
  }

  // Khu đường bên trái kệ
  const sugarZone = new THREE.Group();
  sugarZone.add(makePartBox(0.86, 0.04, 0.4, 'plastic', PALETTE.creamTrim, -0.48, 0.95, 0, { outline: 0.008 }));
  sugarZone.add(makePartCylinder(0.11, 0.11, 0.26, 'ceramic', PALETTE.creamWall, -0.66, 1.1, 0, { outline: 0.009 }));
  sugarZone.add(makePartCylinder(0.11, 0.11, 0.22, 'plastic', PALETTE.syrupPeach, -0.3, 1.08, 0, {
    roughness: 0.25,
    outline: 0.009,
  }));
  sugarZone.add(makePartBox(0.75, 0.22, 0.28, 'paint', PALETTE.creamWall, -0.48, 1.66, 0, { outline: 0.009 }));
  root.add(sugarZone);

  // Khu topping bên phải kệ (trân châu, thạch matcha, thạch đào)
  const toppingZone = new THREE.Group();
  toppingZone.add(makePartBox(0.86, 0.04, 0.4, 'plastic', PALETTE.pinkSoft, 0.48, 0.95, 0, { outline: 0.008 }));
  const toppingColors = [PALETTE.bobaDark, PALETTE.matchaGreen, PALETTE.pinkBlush];
  toppingColors.forEach((col, i) => {
    toppingZone.add(makePartCylinder(0.09, 0.09, 0.22, 'ceramic', col, 0.22 + i * 0.26, 1.08, 0, { outline: 0.009 }));
    toppingZone.add(makePartBox(0.18, 0.22, 0.16, 'plastic', col, 0.22 + i * 0.26, 1.66, 0, { outline: 0.009 }));
  });
  root.add(toppingZone);

  return { root, sugarZone, toppingZone };
}

// Dựng tủ lạnh cửa kính tông bạc hà
export function buildFridge(): THREE.Group {
  const group = new THREE.Group();
  group.add(makePartBox(0.95, 2.05, 0.78, 'plastic', PALETTE.matchaMint, 0, 1.025, 0, { roughness: 0.34 }));
  const doorGlass = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 1.65, 0.04),
    createMaterial('glass', PALETTE.glassBlue, { opacity: 0.55 }),
  );
  doorGlass.position.set(0, 1.12, 0.39);
  markShadow(doorGlass, false, false);
  addOutline(doorGlass, 0.01);
  group.add(doorGlass);
  group.add(makePartBox(0.04, 0.38, 0.05, 'metal', PALETTE.steelSoft, 0.34, 1.1, 0.43, { outline: 0.008 }));
  return group;
}
