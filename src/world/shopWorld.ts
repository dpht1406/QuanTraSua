import * as THREE from 'three';
import type { Interactable } from '../interaction/interactionSystem.ts';
import type { AabbBox } from '../player/collision.ts';
import { addOutline } from '../styles/outline.ts';
import { createGlassMaterial, getToonMaterial, PALETTE } from '../styles/palette.ts';
import {
  buildCounter,
  buildCupRack,
  buildCupSealer,
  buildDoor,
  buildFridge,
  buildMenuBoard,
  buildMopSet,
  buildShelf,
  buildTableSet,
  buildTeaMachine,
  buildTrashCan,
  makeBox,
} from './furniture.ts';

export interface ShopStations {
  cupRack: THREE.Object3D;
  teaMachine: THREE.Object3D;
  fridge: THREE.Object3D;
  sugar: THREE.Object3D;
  topping: THREE.Object3D;
  sealer: THREE.Object3D;
  counter: THREE.Object3D;
  trashCan: THREE.Object3D;
}

export interface ShopWorld {
  root: THREE.Group;
  colliders: AabbBox[];
  interactables: Interactable[];
  stations: ShopStations;
}

// Dựng toàn bộ không gian quán trà sữa 10x8m cùng collider, trạm pha chế và đồ trang trí
export function createShopWorld(onNotify: (msg: string) => void): ShopWorld {
  const root = new THREE.Group();
  const colliders: AabbBox[] = [];
  const interactables: Interactable[] = [];

  const registerDecor = (target: THREE.Object3D, label: string, testMessage: string) => {
    interactables.push({
      target,
      label,
      onInteract: () => onNotify(testMessage),
    });
  };

  // Sàn 10x8m (x: -5..5, z: -4..4) và viền nền pastel
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(10.2, 0.1, 8.2),
    getToonMaterial(PALETTE.floorLight),
  );
  floor.position.set(0, -0.05, 0);
  floor.receiveShadow = true;
  root.add(floor);

  const areaMat = makeBox(5.2, 0.01, 3.0, PALETTE.floorAccent, -1.8, 0.005, -2.4, 0);
  areaMat.castShadow = false;
  root.add(areaMat);

  // Trần sáng và 3 đèn thả trần hình cầu
  const ceiling = makeBox(10.4, 0.12, 8.4, PALETTE.creamTrim, 0, 3.46, 0, 0);
  ceiling.castShadow = false;
  root.add(ceiling);

  const lampGeo = new THREE.SphereGeometry(0.16, 16, 12);
  for (const [lx, lz] of [
    [-1.8, -1.5],
    [2.8, -0.5],
    [2.8, 2.0],
  ]) {
    root.add(makeBox(0.03, 0.55, 0.03, PALETTE.teaDark, lx, 3.12, lz, 0.006));
    const globe = new THREE.Mesh(lampGeo, getToonMaterial(PALETTE.pinkSoft));
    globe.position.set(lx, 2.75, lz);
    addOutline(globe, 0.012);
    root.add(globe);
  }

  // 4 bức tường bao quanh 10x8m (tường trước chừa ô cửa 1.44m và 2 cửa sổ)
  root.add(makeBox(10.4, 3.4, 0.2, PALETTE.creamWall, 0, 1.7, -4.1, 0.014));
  root.add(makeBox(0.2, 3.4, 8.0, PALETTE.creamWall, -5.1, 1.7, 0, 0.014));
  root.add(makeBox(0.2, 3.4, 8.0, PALETTE.creamWall, 5.1, 1.7, 0, 0.014));
  root.add(makeBox(4.48, 3.4, 0.2, PALETTE.creamWall, -2.96, 1.7, 4.1, 0.014));
  root.add(makeBox(4.48, 3.4, 0.2, PALETTE.creamWall, 2.96, 1.7, 4.1, 0.014));
  root.add(makeBox(1.44, 1.02, 0.2, PALETTE.creamWall, 0, 2.89, 4.1, 0.014));

  const frontWindowMat = createGlassMaterial(PALETTE.glassBlue, 0.35);
  for (const wx of [-3.0, 3.0]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 0.24), frontWindowMat);
    win.position.set(wx, 1.55, 4.1);
    addOutline(win, 0.012);
    root.add(win);
  }

  colliders.push(
    { minX: -5.2, maxX: 5.2, minZ: -4.2, maxZ: -4.0 },
    { minX: -5.2, maxX: -5.0, minZ: -4.2, maxZ: 4.2 },
    { minX: 5.0, maxX: 5.2, minZ: -4.2, maxZ: 4.2 },
    { minX: -5.2, maxX: 5.2, minZ: 4.0, maxZ: 4.2 },
  );

  // Cửa ra vào
  const door = buildDoor();
  door.position.set(0, 0, 4.1);
  root.add(door);
  registerDecor(door, 'Kiểm tra cửa quán', 'Cửa quán đang mở đón khách!');

  // Quầy pha chế (dài 4m từ x=-3.85..+0.25 để chừa lối đi >= 1.15m ở hai đầu vào khu sau quầy)
  const counter = buildCounter();
  counter.position.set(-1.8, 0, -1.5);
  root.add(counter);
  colliders.push({ minX: -3.87, maxX: 0.27, minZ: -1.95, maxZ: -1.05 });

  // Kệ ly, máy pha trà và máy ép ly đặt dọc mặt quầy (tầm với ~1.1m từ sau quầy)
  const cupRack = buildCupRack();
  cupRack.position.set(-3.25, 1.02, -1.5);
  root.add(cupRack);

  const teaMachine = buildTeaMachine();
  teaMachine.position.set(-2.3, 1.02, -1.5);
  root.add(teaMachine);

  const sealer = buildCupSealer();
  sealer.position.set(-1.3, 1.02, -1.5);
  root.add(sealer);

  // Kệ nguyên liệu (tách khu đường và khu topping)
  const shelf = buildShelf();
  shelf.root.position.set(-2.05, 0, -3.68);
  root.add(shelf.root);
  colliders.push({ minX: -3.08, maxX: -1.02, minZ: -3.94, maxZ: -3.42 });

  // Bảng menu treo tường
  const menuBoard = buildMenuBoard();
  menuBoard.position.set(0.35, 1.95, -3.96);
  root.add(menuBoard);
  registerDecor(menuBoard, 'Xem bảng menu', 'Trà sữa 30k · Trà đào 35k · Matcha 40k (+5k topping)');

  // Tủ lạnh / thùng đá
  const fridge = buildFridge();
  fridge.position.set(-4.38, 0, -3.45);
  root.add(fridge);
  colliders.push({ minX: -4.88, maxX: -3.88, minZ: -3.86, maxZ: -3.04 });

  // Thùng rác đặt sát đầu phải quầy, chừa lối đi > 1.3m tới bàn 1
  const trashCan = buildTrashCan();
  trashCan.position.set(0.62, 0, -1.5);
  root.add(trashCan);
  colliders.push({ minX: 0.39, maxX: 0.85, minZ: -1.73, maxZ: -1.27 });

  // Chổi lau nhà
  const mopSet = buildMopSet();
  mopSet.position.set(4.35, 0, -3.35);
  root.add(mopSet);
  colliders.push({ minX: 4.05, maxX: 4.65, minZ: -3.65, maxZ: -3.05 });
  registerDecor(mopSet, 'Kiểm tra chổi lau nhà', 'Dụng cụ vệ sinh sẵn sàng (dùng ở giai đoạn sau)!');

  // 4 bộ bàn ghế khách
  const tableCoords: Array<[number, number]> = [
    [3.1, -1.7],
    [3.1, 0.4],
    [3.1, 2.5],
    [-3.1, 1.8],
  ];
  tableCoords.forEach(([tx, tz], idx) => {
    const tableSet = buildTableSet();
    tableSet.position.set(tx, 0, tz);
    root.add(tableSet);
    colliders.push({ minX: tx - 0.94, maxX: tx + 0.94, minZ: tz - 0.42, maxZ: tz + 0.42 });
    registerDecor(tableSet, `Kiểm tra bàn ${idx + 1}`, `Bàn số ${idx + 1} sạch sẽ!`);
  });

  return {
    root,
    colliders,
    interactables,
    stations: {
      cupRack,
      teaMachine,
      fridge,
      sugar: shelf.sugarZone,
      topping: shelf.toppingZone,
      sealer,
      counter,
      trashCan,
    },
  };
}
