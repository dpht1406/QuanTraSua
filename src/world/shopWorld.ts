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
  buildRestockPc,
  buildShelf,
  buildStaffBoard,
  buildTableSet,
  buildTeaMachine,
  buildTrashCan,
  makeBox,
} from './furniture.ts';

export interface Aabb3D extends AabbBox {
  minY: number;
  maxY: number;
}

export type ThrowSurfaceKind = 'floor' | 'wall' | 'table' | 'counter' | 'bin';

export interface ThrowSurface {
  aabb: Aabb3D;
  kind: ThrowSurfaceKind;
}

export interface ShopStations {
  door: THREE.Object3D;
  restockPc: THREE.Object3D;
  staffBoard: THREE.Object3D;
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
  tables: THREE.Group[];
  getShopBounds(): Aabb3D;
  getThrowSurfaces(): ThrowSurface[];
}

const SHOP_BOUNDS: Aabb3D = { minX: -5, maxX: 5, minY: 0, maxY: 3.4, minZ: -4, maxZ: 4 };

// Dựng toàn bộ không gian quán trà sữa 10x8m cùng collider, trạm pha chế và đồ trang trí
export function createShopWorld(onNotify: (msg: string) => void): ShopWorld {
  const root = new THREE.Group();
  const colliders: AabbBox[] = [];
  const interactables: Interactable[] = [];
  const throwSurfaces: ThrowSurface[] = [
    { aabb: { minX: -5.1, maxX: 5.1, minY: -0.1, maxY: 0, minZ: -4.1, maxZ: 4.1 }, kind: 'floor' },
  ];

  const pushSurface = (box: AabbBox, maxY: number, kind: ThrowSurfaceKind) => {
    throwSurfaces.push({ aabb: { ...box, minY: 0, maxY }, kind });
  };

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

  const wallBoxes: AabbBox[] = [
    { minX: -5.2, maxX: 5.2, minZ: -4.2, maxZ: -4.0 },
    { minX: -5.2, maxX: -5.0, minZ: -4.2, maxZ: 4.2 },
    { minX: 5.0, maxX: 5.2, minZ: -4.2, maxZ: 4.2 },
    { minX: -5.2, maxX: 5.2, minZ: 4.0, maxZ: 4.2 },
  ];
  colliders.push(...wallBoxes);
  wallBoxes.forEach((b) => pushSurface(b, 3.4, 'wall'));

  // Cửa ra vào (nối với hệ thống mở/kết ca)
  const door = buildDoor();
  door.position.set(0, 0, 4.1);
  root.add(door);

  // Máy tính nhập hàng đặt cạnh kệ nguyên liệu ở tường sau
  const restockPc = buildRestockPc();
  restockPc.position.set(-0.2, 0, -3.66);
  root.add(restockPc);
  const pcBox = { minX: -0.62, maxX: 0.22, minZ: -3.95, maxZ: -3.37 };
  colliders.push(pcBox);
  pushSurface(pcBox, 0.77, 'counter');

  // Quầy pha chế (dài 4m từ x=-3.85..+0.25 để chừa lối đi >= 1.15m ở hai đầu vào khu sau quầy)
  const counter = buildCounter();
  counter.position.set(-1.8, 0, -1.5);
  root.add(counter);
  const counterBox = { minX: -3.87, maxX: 0.27, minZ: -1.95, maxZ: -1.05 };
  colliders.push(counterBox);
  pushSurface(counterBox, 1.02, 'counter');

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
  const shelfBox = { minX: -3.08, maxX: -1.02, minZ: -3.94, maxZ: -3.42 };
  colliders.push(shelfBox);
  pushSurface(shelfBox, 1.85, 'wall');

  // Bảng menu treo tường và bảng nhân viên
  const menuBoard = buildMenuBoard();
  menuBoard.position.set(0.35, 1.95, -3.96);
  root.add(menuBoard);
  registerDecor(menuBoard, 'Xem bảng menu', 'Trà sữa 30k · Trà đào 35k · Matcha 40k (+5k topping)');

  const staffBoard = buildStaffBoard();
  staffBoard.position.set(2.45, 1.72, -3.96);
  root.add(staffBoard);

  // Tủ lạnh / thùng đá
  const fridge = buildFridge();
  fridge.position.set(-4.38, 0, -3.45);
  root.add(fridge);
  const fridgeBox = { minX: -4.88, maxX: -3.88, minZ: -3.86, maxZ: -3.04 };
  colliders.push(fridgeBox);
  pushSurface(fridgeBox, 2.05, 'wall');

  // Thùng rác đặt sát đầu phải quầy, chừa lối đi > 1.3m tới bàn 1
  const trashCan = buildTrashCan();
  trashCan.position.set(0.62, 0, -1.5);
  root.add(trashCan);
  const binBox = { minX: 0.39, maxX: 0.85, minZ: -1.73, maxZ: -1.27 };
  colliders.push(binBox);
  pushSurface(binBox, 0.53, 'bin');

  // Cụm xô chổi trang trí góc quán (dụng cụ cầm tay nằm trên giá treo tường sau)
  const mopSet = buildMopSet();
  mopSet.position.set(4.35, 0, -3.35);
  root.add(mopSet);
  colliders.push({ minX: 4.05, maxX: 4.65, minZ: -3.65, maxZ: -3.05 });
  registerDecor(
    mopSet,
    'Góc xô chổi trang trí',
    'Lấy chổi hoặc cây lau trên giá treo tường sau, rồi giữ chuột để quét/lau!',
  );

  // 4 bộ bàn ghế khách (tương tác bàn bẩn/sạch được gắn ở cleanlinessView)
  const tableCoords: Array<[number, number]> = [
    [3.1, -1.7],
    [3.1, 0.4],
    [3.1, 2.5],
    [-3.1, 1.8],
  ];
  const tables: THREE.Group[] = [];
  for (const [tx, tz] of tableCoords) {
    const tableSet = buildTableSet();
    tableSet.position.set(tx, 0, tz);
    root.add(tableSet);
    tables.push(tableSet);
    const tableBox = { minX: tx - 0.94, maxX: tx + 0.94, minZ: tz - 0.42, maxZ: tz + 0.42 };
    colliders.push(tableBox);
    pushSurface(tableBox, 0.77, 'table');
  }

  return {
    root,
    colliders,
    interactables,
    tables,
    getShopBounds: () => ({ ...SHOP_BOUNDS }),
    getThrowSurfaces: () => throwSurfaces.map((s) => ({ kind: s.kind, aabb: { ...s.aabb } })),
    stations: {
      door,
      restockPc,
      staffBoard,
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
