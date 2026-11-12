import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AabbBox } from '../player/collision.ts';
import { CEILING_LAMP_COLOR, CEILING_LAMP_POSITIONS } from '../state/constantsGraphics.ts';
import {
  SHOP_DOOR_HEIGHT,
  SHOP_DOOR_WIDTH,
  SHOP_FRONT_WALL_Z,
  SHOP_WINDOW_SIZE,
  SHOP_WINDOW_XS,
} from '../state/constantsStreet.ts';
import { createMaterial, markShadow } from '../styles/materials.ts';
import { addOutline } from '../styles/outline.ts';
import { PALETTE } from '../styles/palette.ts';
import { makePartBox } from './furniturePrimitives.ts';
import type { ThrowSurfaceKind } from './shopWorld.ts';
import { getShopSignTexture, getTileTexture, getWallTexture, getWoodFloorTexture } from './textures.ts';

export interface ShopShellResult {
  door: THREE.Object3D;
  setShopOpen(open: boolean): void;
}

const WALL_THICKNESS = 0.2;
const WALL_HEIGHT = 3.4;

function buildFrontWallSegmentWithWindow(
  xStart: number,
  xEnd: number,
  winCenterX: number,
  wallMat: THREE.MeshStandardMaterial,
): THREE.Mesh {
  const winMinX = winCenterX - SHOP_WINDOW_SIZE.width * 0.5;
  const winMaxX = winCenterX + SHOP_WINDOW_SIZE.width * 0.5;
  const winMinY = SHOP_WINDOW_SIZE.centerY - SHOP_WINDOW_SIZE.height * 0.5;
  const winMaxY = SHOP_WINDOW_SIZE.centerY + SHOP_WINDOW_SIZE.height * 0.5;

  const rects: Array<[number, number, number, number]> = [
    [xStart, xEnd, 0, winMinY],
    [xStart, xEnd, winMaxY, WALL_HEIGHT],
    [xStart, winMinX, winMinY, winMaxY],
    [winMaxX, xEnd, winMinY, winMaxY],
  ];
  const parts = rects.map(([x0, x1, y0, y1]) => {
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, WALL_THICKNESS);
    geo.translate((x0 + x1) * 0.5, (y0 + y1) * 0.5, SHOP_FRONT_WALL_Z);
    return geo;
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('Không thể ghép hình học tường cửa sổ');

  const wall = new THREE.Mesh(merged, wallMat);
  wall.name = 'shopWall';
  markShadow(wall, false, true);
  addOutline(wall, 0.014);
  return wall;
}

function buildWindowFrameAndGlass(root: THREE.Group, wx: number, glassMat: THREE.MeshStandardMaterial): void {
  const cy = SHOP_WINDOW_SIZE.centerY;
  const frameOpts = { castShadow: false, receiveShadow: true, outline: 0.008 };
  root.add(makePartBox(2.04, 0.08, 0.24, 'wood', PALETTE.teaDark, wx, cy + 0.61, SHOP_FRONT_WALL_Z, frameOpts));
  root.add(makePartBox(2.08, 0.08, 0.28, 'wood', PALETTE.teaDark, wx, cy - 0.61, SHOP_FRONT_WALL_Z, frameOpts));
  root.add(makePartBox(0.08, 1.14, 0.24, 'wood', PALETTE.teaDark, wx - 0.96, cy, SHOP_FRONT_WALL_Z, frameOpts));
  root.add(makePartBox(0.08, 1.14, 0.24, 'wood', PALETTE.teaDark, wx + 0.96, cy, SHOP_FRONT_WALL_Z, frameOpts));

  const win = new THREE.Mesh(new THREE.BoxGeometry(1.84, 1.14, 0.04), glassMat);
  win.name = 'shopWindowGlass';
  win.position.set(wx, cy, SHOP_FRONT_WALL_Z);
  markShadow(win, false, false);
  addOutline(win, 0.012);
  root.add(win);
}

function buildOpenDoorway(glassMat: THREE.MeshStandardMaterial): ShopShellResult {
  const door = new THREE.Group();
  door.name = 'shopDoor';
  door.position.set(0, 0, SHOP_FRONT_WALL_Z);

  const halfDoor = SHOP_DOOR_WIDTH * 0.5;
  const frameOpts = { castShadow: false, receiveShadow: true, outline: 0.01 };
  door.add(makePartBox(0.06, SHOP_DOOR_HEIGHT, 0.22, 'wood', PALETTE.teaDark, -halfDoor + 0.03, SHOP_DOOR_HEIGHT * 0.5, 0, frameOpts));
  door.add(makePartBox(0.06, SHOP_DOOR_HEIGHT, 0.22, 'wood', PALETTE.teaDark, halfDoor - 0.03, SHOP_DOOR_HEIGHT * 0.5, 0, frameOpts));
  door.add(makePartBox(SHOP_DOOR_WIDTH, 0.06, 0.22, 'wood', PALETTE.teaDark, 0, SHOP_DOOR_HEIGHT - 0.03, 0, frameOpts));

  // Hai cánh cửa kính mở sẵn hướng ra ngoài (gần như áp sát tường mặt tiền, không cản lối đi 1.32m)
  for (const side of [-1, 1] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(side * (halfDoor - 0.04), 0, 0.11);
    pivot.rotation.y = side * Math.PI * 0.88;
    const leafW = 0.62;
    const cx = -side * (leafW * 0.5);
    pivot.add(makePartBox(leafW, 0.16, 0.05, 'wood', PALETTE.teaDark, cx, 0.08, 0, frameOpts));
    pivot.add(makePartBox(leafW, 0.12, 0.05, 'wood', PALETTE.teaDark, cx, 2.2, 0, frameOpts));
    pivot.add(makePartBox(0.07, 2.26, 0.05, 'wood', PALETTE.teaDark, -side * 0.035, 1.13, 0, frameOpts));
    pivot.add(makePartBox(0.07, 2.26, 0.05, 'wood', PALETTE.teaDark, -side * (leafW - 0.035), 1.13, 0, frameOpts));
    const pane = new THREE.Mesh(new THREE.BoxGeometry(leafW - 0.14, 1.98, 0.025), glassMat);
    pane.position.set(cx, 1.15, 0);
    markShadow(pane, false, false);
    pivot.add(pane);
    pivot.add(makePartBox(0.03, 0.28, 0.04, 'metal', PALETTE.steelSoft, -side * (leafW - 0.12), 1.05, 0.04, frameOpts));
    door.add(pivot);
  }

  // Biển nhỏ treo phía trên ô cửa (cao hơn tầm đầu 1.75m), đồng bộ Mở cửa / Đóng cửa qua EventBus
  door.add(makePartBox(0.58, 0.22, 0.03, 'wood', PALETTE.teaDark, 0, 2.16, 0, frameOpts));
  const openTex = getShopSignTexture(true);
  const closedTex = getShopSignTexture(false);
  const openBoard = makePartBox(0.54, 0.18, 0.045, 'paint', openTex ? 0xffffff : PALETTE.matchaMint, 0, 2.16, 0, {
    map: openTex,
    castShadow: false,
    receiveShadow: true,
    outline: 0,
  });
  openBoard.name = 'shopSignOpen';
  const closedBoard = makePartBox(0.54, 0.18, 0.045, 'paint', closedTex ? 0xffffff : PALETTE.pinkBlush, 0, 2.16, 0, {
    map: closedTex,
    castShadow: false,
    receiveShadow: true,
    outline: 0,
  });
  closedBoard.name = 'shopSignClosed';
  openBoard.visible = false;
  door.add(openBoard, closedBoard);

  return {
    door,
    setShopOpen(open) {
      openBoard.visible = open;
      closedBoard.visible = !open;
    },
  };
}

// Dựng vỏ quán 10x8m: sàn, trần, đèn thả, cửa sổ kính nhìn xuyên ra phố và ô cửa đi thông
export function buildShopShell(
  root: THREE.Group,
  colliders: AabbBox[],
  pushSurface: (box: AabbBox, maxY: number, kind: ThrowSurfaceKind) => void,
): ShopShellResult {
  const floor = makePartBox(10.2, 0.1, 8.2, 'wood', PALETTE.floorLight, 0, -0.05, 0, {
    map: getWoodFloorTexture(),
    roughness: 0.72,
    outline: 0,
    castShadow: false,
    receiveShadow: true,
  });
  floor.name = 'shopFloor';
  root.add(floor);

  const areaMat = makePartBox(5.2, 0.01, 3.0, 'ceramic', PALETTE.floorAccent, -1.8, 0.005, -2.4, {
    map: getTileTexture(),
    roughness: 0.62,
    outline: 0,
    castShadow: false,
    receiveShadow: true,
  });
  areaMat.name = 'shopCounterTile';
  root.add(areaMat);

  const ceiling = makePartBox(10.4, 0.12, 8.4, 'paint', PALETTE.creamTrim, 0, 3.46, 0, {
    outline: 0,
    castShadow: false,
    receiveShadow: false,
  });
  ceiling.name = 'shopCeiling';
  root.add(ceiling);

  const lampGeo = new THREE.SphereGeometry(0.16, 16, 12);
  const lampGlobeMat = createMaterial('ceramic', PALETTE.pinkSoft, {
    emissive: CEILING_LAMP_COLOR,
    emissiveIntensity: 0.65,
    roughness: 0.35,
  });
  for (const [lx, ly, lz] of CEILING_LAMP_POSITIONS) {
    root.add(makePartBox(0.03, 0.55, 0.03, 'metal', PALETTE.teaDark, lx, 3.12, lz, {
      outline: 0.006,
      castShadow: false,
      receiveShadow: false,
    }));
    const globe = new THREE.Mesh(lampGeo, lampGlobeMat);
    globe.name = 'ceilingLampGlobe';
    globe.position.set(lx, ly + 0.23, lz);
    markShadow(globe, false, false);
    addOutline(globe, 0.012);
    root.add(globe);
  }

  const wallMap = getWallTexture();
  const wallOpts = { map: wallMap, roughness: 0.88, outline: 0.014, castShadow: false, receiveShadow: true };
  const wallMat = createMaterial('paint', PALETTE.creamWall, { map: wallMap, roughness: 0.88 });
  const halfDoor = SHOP_DOOR_WIDTH * 0.5;

  const solidWallSpecs: Array<[number, number, number, number, number, number]> = [
    [10.4, WALL_HEIGHT, WALL_THICKNESS, 0, 1.7, -4.1],
    [WALL_THICKNESS, WALL_HEIGHT, 8.0, -5.1, 1.7, 0],
    [WALL_THICKNESS, WALL_HEIGHT, 8.0, 5.1, 1.7, 0],
    [SHOP_DOOR_WIDTH, WALL_HEIGHT - SHOP_DOOR_HEIGHT, WALL_THICKNESS, 0, (WALL_HEIGHT + SHOP_DOOR_HEIGHT) * 0.5, SHOP_FRONT_WALL_Z],
  ];
  for (const [w, h, d, x, y, z] of solidWallSpecs) {
    const wall = makePartBox(w, h, d, 'paint', PALETTE.creamWall, x, y, z, wallOpts);
    wall.name = 'shopWall';
    root.add(wall);
  }

  root.add(buildFrontWallSegmentWithWindow(-5.2, -halfDoor, SHOP_WINDOW_XS[0], wallMat));
  root.add(buildFrontWallSegmentWithWindow(halfDoor, 5.2, SHOP_WINDOW_XS[1], wallMat));

  const frontWindowMat = createMaterial('glass', PALETTE.glassBlue, { opacity: 0.32 });
  for (const wx of SHOP_WINDOW_XS) {
    buildWindowFrameAndGlass(root, wx, frontWindowMat);
  }

  const wallBoxes: AabbBox[] = [
    { minX: -5.2, maxX: 5.2, minZ: -4.2, maxZ: -4.0, minY: 0, maxY: WALL_HEIGHT, tag: 'wall' },
    { minX: -5.2, maxX: -5.0, minZ: -4.2, maxZ: 4.2, minY: 0, maxY: WALL_HEIGHT, tag: 'wall' },
    { minX: 5.0, maxX: 5.2, minZ: -4.2, maxZ: 4.2, minY: 0, maxY: WALL_HEIGHT, tag: 'wall' },
    { minX: -5.2, maxX: -halfDoor, minZ: 4.0, maxZ: 4.2, minY: 0, maxY: WALL_HEIGHT, tag: 'wall' },
    { minX: halfDoor, maxX: 5.2, minZ: 4.0, maxZ: 4.2, minY: 0, maxY: WALL_HEIGHT, tag: 'wall' },
    { minX: -halfDoor, maxX: halfDoor, minZ: 4.0, maxZ: 4.2, minY: SHOP_DOOR_HEIGHT, maxY: WALL_HEIGHT, tag: 'wall' },
  ];
  colliders.push(...wallBoxes);
  wallBoxes.forEach((b) => pushSurface(b, WALL_HEIGHT, 'wall'));

  const doorRes = buildOpenDoorway(frontWindowMat);
  root.add(doorRes.door);
  return doorRes;
}
