import * as THREE from 'three';
import type { Interactable } from '../interaction/interactionSystem.ts';
import type { AabbBox } from '../player/collision.ts';
import { addOutline } from '../styles/outline.ts';
import { createGlassMaterial, getToonMaterial, PALETTE } from '../styles/palette.ts';
import {
  buildCounter,
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

export interface ShopWorld {
  root: THREE.Group;
  colliders: AabbBox[];
  interactables: Interactable[];
}

// Dựng toàn bộ không gian quán trà sữa 10x8m cùng collider và danh sách vật tương tác
export function createShopWorld(onNotify: (msg: string) => void): ShopWorld {
  const root = new THREE.Group();
  const colliders: AabbBox[] = [];
  const interactables: Interactable[] = [];

  const registerInteractable = (target: THREE.Object3D, label: string, testMessage: string) => {
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

  const areaMat = makeBox(5.2, 0.01, 3.0, PALETTE.floorAccent, -1.5, 0.005, -2.4, 0);
  areaMat.castShadow = false;
  root.add(areaMat);

  // Trần sáng và 3 đèn thả trần hình cầu
  const ceiling = makeBox(10.4, 0.12, 8.4, PALETTE.creamTrim, 0, 3.46, 0, 0);
  ceiling.castShadow = false;
  root.add(ceiling);

  const lampGeo = new THREE.SphereGeometry(0.16, 16, 12);
  for (const [lx, lz] of [
    [-1.5, -1.5],
    [2.8, -0.5],
    [2.8, 2.0],
  ]) {
    root.add(makeBox(0.03, 0.55, 0.03, PALETTE.teaDark, lx, 3.12, lz, 0.006));
    const globe = new THREE.Mesh(lampGeo, getToonMaterial(PALETTE.pinkSoft));
    globe.position.set(lx, 2.75, lz);
    addOutline(globe, 0.012);
    root.add(globe);
  }

  // 4 bức tường bao quanh 10x8m (tường trước chừa đúng ô cửa 1.44m và 2 cửa sổ)
  root.add(makeBox(10.4, 3.4, 0.2, PALETTE.creamWall, 0, 1.7, -4.1, 0.014));
  root.add(makeBox(0.2, 3.4, 8.0, PALETTE.creamWall, -5.1, 1.7, 0, 0.014));
  root.add(makeBox(0.2, 3.4, 8.0, PALETTE.creamWall, 5.1, 1.7, 0, 0.014));

  // Tường trước (z = +4.1): hai bên tường + phần trên cửa + cửa sổ kính
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
  registerInteractable(door, 'Kiểm tra cửa quán', 'Test: Cửa quán đang mở đón khách!');

  // Quầy pha chế
  const counter = buildCounter();
  counter.position.set(-1.5, 0, -1.5);
  root.add(counter);
  colliders.push({ minX: -3.85, maxX: 0.85, minZ: -1.94, maxZ: -1.06 });
  registerInteractable(counter, 'Kiểm tra quầy pha chế', 'Test: Quầy pha chế sạch sẽ, sẵn sàng!');

  // Máy pha trà đặt trên quầy
  const teaMachine = buildTeaMachine();
  teaMachine.position.set(-2.4, 1.02, -1.5);
  root.add(teaMachine);
  registerInteractable(teaMachine, 'Pha trà sữa', 'Test: Máy pha trà đang khởi động!');

  // Kệ nguyên liệu
  const shelf = buildShelf();
  shelf.position.set(-2.1, 0, -3.68);
  root.add(shelf);
  colliders.push({ minX: -3.12, maxX: -1.08, minZ: -3.94, maxZ: -3.42 });
  registerInteractable(shelf, 'Xem kệ nguyên liệu', 'Test: Kệ nguyên liệu đầy đủ trân châu & siro!');

  // Bảng menu treo tường
  const menuBoard = buildMenuBoard();
  menuBoard.position.set(0.35, 1.95, -3.96);
  root.add(menuBoard);
  registerInteractable(menuBoard, 'Xem bảng menu', 'Test: Trà sữa trân châu, Matcha kem cheese, Trà đào dâu!');

  // Tủ lạnh
  const fridge = buildFridge();
  fridge.position.set(-4.38, 0, -3.45);
  root.add(fridge);
  colliders.push({ minX: -4.88, maxX: -3.88, minZ: -3.86, maxZ: -3.04 });
  registerInteractable(fridge, 'Mở tủ lạnh', 'Test: Tủ lạnh đang giữ sữa tươi ở 4°C!');

  // Thùng rác
  const trashCan = buildTrashCan();
  trashCan.position.set(1.25, 0, -1.5);
  root.add(trashCan);
  colliders.push({ minX: 1.02, maxX: 1.48, minZ: -1.73, maxZ: -1.27 });
  registerInteractable(trashCan, 'Đổ thùng rác', 'Test: Đã kiểm tra thùng rác!');

  // Chổi lau nhà
  const mopSet = buildMopSet();
  mopSet.position.set(4.35, 0, -3.35);
  root.add(mopSet);
  colliders.push({ minX: 4.05, maxX: 4.65, minZ: -3.65, maxZ: -3.05 });
  registerInteractable(mopSet, 'Cầm chổi lau nhà', 'Test: Đã cầm chổi lau nhà (độ sạch 100%)!');

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
    registerInteractable(
      tableSet,
      `Lau dọn bàn ${idx + 1}`,
      `Test: Bàn số ${idx + 1} sạch bóng!`,
    );
  });

  return { root, colliders, interactables };
}
