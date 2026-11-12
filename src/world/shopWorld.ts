import * as THREE from 'three';
import type { Interactable } from '../interaction/interactionSystem.ts';
import type { AabbBox } from '../player/collision.ts';
import {
  buildChair,
  buildCounter,
  buildCupRack,
  buildCupSealer,
  buildFridge,
  buildMenuBoard,
  buildMopSet,
  buildRestockPc,
  buildShelf,
  buildStaffBoard,
  buildTable,
  buildTeaMachine,
  buildTrashCan,
} from './furniture.ts';
import { buildShopShell } from './shopShell.ts';

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

export interface ChairInstance {
  id: string;
  mesh: THREE.Group;
  initialPos: { x: number; y: number; z: number };
  initialYaw: number;
}

export interface ShopWorld {
  root: THREE.Group;
  colliders: AabbBox[];
  interactables: Interactable[];
  stations: ShopStations;
  tables: THREE.Group[];
  chairs: ChairInstance[];
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

  const door = buildShopShell(root, colliders, pushSurface);

  // Máy tính nhập hàng đặt cạnh kệ nguyên liệu ở tường sau
  const restockPc = buildRestockPc();
  restockPc.position.set(-0.2, 0, -3.66);
  root.add(restockPc);
  const pcBox: AabbBox = { minX: -0.62, maxX: 0.22, minZ: -3.95, maxZ: -3.37, minY: 0, maxY: 0.77, tag: 'counter' };
  const pcMonitorBox: AabbBox = { minX: -0.46, maxX: 0.06, minZ: -3.84, maxZ: -3.68, minY: 0.77, maxY: 1.22, tag: 'machine' };
  colliders.push(pcBox, pcMonitorBox);
  pushSurface(pcBox, 0.77, 'counter');

  // Quầy pha chế (dài 4m từ x=-3.85..+0.25 để chừa lối đi >= 1.15m ở hai đầu vào khu sau quầy)
  const counter = buildCounter();
  counter.position.set(-1.8, 0, -1.5);
  root.add(counter);
  const counterBox: AabbBox = { minX: -3.87, maxX: 0.27, minZ: -1.95, maxZ: -1.05, minY: 0, maxY: 1.02, tag: 'counter' };
  colliders.push(counterBox);
  pushSurface(counterBox, 1.02, 'counter');

  // Kệ ly, máy pha trà và máy ép ly đặt dọc mặt quầy (tầm với ~1.1m từ sau quầy)
  const cupRack = buildCupRack();
  cupRack.position.set(-3.25, 1.02, -1.5);
  root.add(cupRack);
  colliders.push({ minX: -3.46, maxX: -3.04, minZ: -1.66, maxZ: -1.34, minY: 1.02, maxY: 1.34, tag: 'rack' });

  const teaMachine = buildTeaMachine();
  teaMachine.position.set(-2.3, 1.02, -1.5);
  root.add(teaMachine);
  colliders.push({ minX: -2.63, maxX: -1.97, minZ: -1.76, maxZ: -1.24, minY: 1.02, maxY: 1.66, tag: 'machine' });

  const sealer = buildCupSealer();
  sealer.position.set(-1.3, 1.02, -1.5);
  root.add(sealer);
  colliders.push({ minX: -1.51, maxX: -1.09, minZ: -1.71, maxZ: -1.29, minY: 1.02, maxY: 1.56, tag: 'machine' });

  // Kệ nguyên liệu (tách khu đường và khu topping)
  const shelf = buildShelf();
  shelf.root.position.set(-2.05, 0, -3.68);
  root.add(shelf.root);
  const shelfBox: AabbBox = { minX: -3.08, maxX: -1.02, minZ: -3.94, maxZ: -3.42, minY: 0, maxY: 1.85, tag: 'rack' };
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
  const fridgeBox: AabbBox = { minX: -4.88, maxX: -3.88, minZ: -3.86, maxZ: -3.04, minY: 0, maxY: 2.05, tag: 'machine' };
  colliders.push(fridgeBox);
  pushSurface(fridgeBox, 2.05, 'wall');

  // Thùng rác đặt sát đầu phải quầy, chừa lối đi > 1.3m tới bàn 1
  const trashCan = buildTrashCan();
  trashCan.position.set(0.62, 0, -1.5);
  root.add(trashCan);
  const binBox: AabbBox = { minX: 0.39, maxX: 0.85, minZ: -1.73, maxZ: -1.27, minY: 0, maxY: 0.53, tag: 'bin' };
  colliders.push(binBox);
  pushSurface(binBox, 0.53, 'bin');

  // Cụm xô chổi trang trí góc quán (dụng cụ cầm tay nằm trên giá treo tường sau)
  const mopSet = buildMopSet();
  mopSet.position.set(4.35, 0, -3.35);
  root.add(mopSet);
  colliders.push({ minX: 4.05, maxX: 4.65, minZ: -3.65, maxZ: -3.05, minY: 0, maxY: 1.2, tag: 'rack' });
  registerDecor(
    mopSet,
    'Góc xô chổi trang trí',
    'Lấy chổi hoặc cây lau trên giá treo tường sau, rồi giữ chuột để quét/lau!',
  );

  // 4 bộ bàn ghế khách (tương tác bàn bẩn/sạch gắn trên tables, 8 ghế tách riêng để gắn thân động)
  const tableCoords: Array<[number, number]> = [
    [3.1, -1.7],
    [3.1, 0.4],
    [3.1, 2.5],
    [-3.1, 1.8],
  ];
  const tables: THREE.Group[] = [];
  const chairs: ChairInstance[] = [];
  tableCoords.forEach(([tx, tz], tableIdx) => {
    const table = buildTable();
    table.position.set(tx, 0, tz);
    root.add(table);
    tables.push(table);
    const tableBox: AabbBox = { minX: tx - 0.46, maxX: tx + 0.46, minZ: tz - 0.4, maxZ: tz + 0.4, minY: 0, maxY: 0.77, tag: 'table' };
    colliders.push(tableBox);
    pushSurface(tableBox, 0.77, 'table');

    for (const dir of [-1, 1] as const) {
      const chair = buildChair();
      const cx = tx + dir * 0.72;
      const yaw = dir === 1 ? 0 : Math.PI;
      chair.position.set(cx, 0, tz);
      chair.rotation.y = yaw;
      root.add(chair);
      chairs.push({
        id: `chair_${tableIdx}_${dir === -1 ? 'L' : 'R'}`,
        mesh: chair,
        initialPos: { x: cx, y: 0, z: tz },
        initialYaw: yaw,
      });
    }
  });

  return {
    root,
    colliders,
    interactables,
    tables,
    chairs,
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
