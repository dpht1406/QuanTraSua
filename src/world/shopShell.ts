import * as THREE from 'three';
import type { AabbBox } from '../player/collision.ts';
import { CEILING_LAMP_COLOR, CEILING_LAMP_POSITIONS } from '../state/constantsGraphics.ts';
import { createMaterial, markShadow } from '../styles/materials.ts';
import { addOutline } from '../styles/outline.ts';
import { PALETTE } from '../styles/palette.ts';
import { buildDoor } from './furnitureDecor.ts';
import { makePartBox } from './furniturePrimitives.ts';
import type { ThrowSurfaceKind } from './shopWorld.ts';
import { getTileTexture, getWallTexture, getWoodFloorTexture } from './textures.ts';

// Dựng vỏ quán 10x8m: sàn gỗ/gạch, tường sơn mịn, trần, 3 đèn thả khớp PointLight và cửa sổ kính
export function buildShopShell(
  root: THREE.Group,
  colliders: AabbBox[],
  pushSurface: (box: AabbBox, maxY: number, kind: ThrowSurfaceKind) => void,
): THREE.Object3D {
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

  // Trần sáng tắt cast/receive để không che nắng từ trên xuống hoặc tự gây vệt bóng
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

  // 4 bức tường bao quanh 10x8m: chỉ receive bóng để tránh tự đổ bóng lên chính mặt tường
  const wallOpts = {
    map: getWallTexture(),
    roughness: 0.88,
    outline: 0.014,
    castShadow: false,
    receiveShadow: true,
  };
  const wallSpecs: Array<[number, number, number, number, number, number]> = [
    [10.4, 3.4, 0.2, 0, 1.7, -4.1],
    [0.2, 3.4, 8.0, -5.1, 1.7, 0],
    [0.2, 3.4, 8.0, 5.1, 1.7, 0],
    [4.48, 3.4, 0.2, -2.96, 1.7, 4.1],
    [4.48, 3.4, 0.2, 2.96, 1.7, 4.1],
    [1.44, 1.02, 0.2, 0, 2.89, 4.1],
  ];
  for (const [w, h, d, x, y, z] of wallSpecs) {
    const wall = makePartBox(w, h, d, 'paint', PALETTE.creamWall, x, y, z, wallOpts);
    wall.name = 'shopWall';
    root.add(wall);
  }

  const frontWindowMat = createMaterial('glass', PALETTE.glassBlue, { opacity: 0.35 });
  for (const wx of [-3.0, 3.0]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 0.24), frontWindowMat);
    win.name = 'shopWindowGlass';
    win.position.set(wx, 1.55, 4.1);
    markShadow(win, false, false);
    addOutline(win, 0.012);
    root.add(win);
  }

  const wallBoxes: AabbBox[] = [
    { minX: -5.2, maxX: 5.2, minZ: -4.2, maxZ: -4.0, minY: 0, maxY: 3.4, tag: 'wall' },
    { minX: -5.2, maxX: -5.0, minZ: -4.2, maxZ: 4.2, minY: 0, maxY: 3.4, tag: 'wall' },
    { minX: 5.0, maxX: 5.2, minZ: -4.2, maxZ: 4.2, minY: 0, maxY: 3.4, tag: 'wall' },
    { minX: -5.2, maxX: 5.2, minZ: 4.0, maxZ: 4.2, minY: 0, maxY: 3.4, tag: 'wall' },
  ];
  colliders.push(...wallBoxes);
  wallBoxes.forEach((b) => pushSurface(b, 3.4, 'wall'));

  // Cửa ra vào (nối với hệ thống mở/kết ca)
  const door = buildDoor();
  door.position.set(0, 0, 4.1);
  root.add(door);

  return door;
}
