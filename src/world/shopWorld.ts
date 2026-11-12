import * as THREE from 'three';
import { getShopBounds as getCoreShopBounds } from '../core/worldBounds.ts';
import type { Interactable } from '../interaction/interactionSystem.ts';
import type { AabbBox } from '../player/collision.ts';
import { buildShopInterior } from './shopInterior.ts';
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
  setShopOpen?(open: boolean): void;
}

// Dựng toàn bộ không gian quán trà sữa 10x8m cùng collider, trạm pha chế và đồ trang trí
export function createShopWorld(onNotify: (msg: string) => void): ShopWorld {
  const root = new THREE.Group();
  const colliders: AabbBox[] = [];
  const interactables: Interactable[] = [];
  const throwSurfaces: ThrowSurface[] = [
    { aabb: { minX: -5.1, maxX: 5.1, minY: -0.1, maxY: 0, minZ: -4.1, maxZ: 4.1 }, kind: 'floor' },
  ];

  const pushSurface = (box: AabbBox, maxY: number, kind: ThrowSurfaceKind) => {
    throwSurfaces.push({ aabb: { ...box, minY: box.minY ?? 0, maxY }, kind });
  };

  const registerDecor = (target: THREE.Object3D, label: string, testMessage: string) => {
    interactables.push({
      target,
      label,
      onInteract: () => onNotify(testMessage),
    });
  };

  const { door, setShopOpen } = buildShopShell(root, colliders, pushSurface);
  const { stations, tables, chairs } = buildShopInterior(
    root,
    colliders,
    pushSurface,
    registerDecor,
    door,
  );

  return {
    root,
    colliders,
    interactables,
    tables,
    chairs,
    getShopBounds: getCoreShopBounds,
    getThrowSurfaces: () => throwSurfaces.map((s) => ({ kind: s.kind, aabb: { ...s.aabb } })),
    stations,
    setShopOpen,
  };
}
