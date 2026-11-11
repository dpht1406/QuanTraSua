import * as THREE from 'three';
import type { InteractionSystem } from '../interaction/interactionSystem.ts';
import type { CleanlinessStore } from '../state/cleanliness.ts';
import { PALETTE } from '../styles/palette.ts';
import { makePartBox, makePartCylinder } from './furniturePrimitives.ts';
import type { ShopWorld } from './shopWorld.ts';

export interface CleanlinessView {
  sync(): void;
  dispose(): void;
}

const NO_SHADOW = { castShadow: false, receiveShadow: false } as const;

function disposeGroupGeometries(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.geometry.dispose();
  });
}

function buildFloorStainMesh(kind: 'spill' | 'trash'): THREE.Group {
  const group = new THREE.Group();
  if (kind === 'spill') {
    // Nâng nhẹ qua mặt thảm (y=0.010) để tránh z-fighting và giữ vết đổ hơi bóng
    group.add(makePartBox(0.56, 0.012, 0.44, 'ceramic', PALETTE.teaBrown, 0, 0.017, 0, {
      ...NO_SHADOW,
      roughness: 0.14,
      outline: 0.008,
    }));
    const splash = makePartBox(0.28, 0.012, 0.24, 'ceramic', PALETTE.syrupPeach, 0.16, 0.021, 0.14, {
      ...NO_SHADOW,
      roughness: 0.16,
      outline: 0.008,
    });
    splash.rotation.y = 0.45;
    group.add(splash);
  } else {
    const wrapper = makePartBox(0.42, 0.014, 0.32, 'fabric', PALETTE.creamWall, 0, 0.018, 0, {
      ...NO_SHADOW,
      roughness: 0.92,
      outline: 0.008,
    });
    wrapper.rotation.y = 0.3;
    group.add(wrapper);
    const cup = makePartCylinder(0.06, 0.05, 0.16, 'plastic', PALETTE.pinkSoft, 0.05, 0.072, 0.02, {
      ...NO_SHADOW,
      roughness: 0.72,
      outline: 0.008,
    });
    cup.rotation.z = 1.32;
    cup.rotation.y = 0.5;
    group.add(cup);
  }
  return group;
}

function buildDirtyTableOverlay(): THREE.Group {
  const group = new THREE.Group();
  group.add(makePartBox(0.26, 0.018, 0.24, 'fabric', PALETTE.creamWall, -0.08, 0.782, 0.06, {
    ...NO_SHADOW,
    roughness: 0.92,
    outline: 0.007,
  }));
  group.add(makePartBox(0.18, 0.01, 0.16, 'ceramic', PALETTE.teaBrown, -0.1, 0.779, -0.14, {
    ...NO_SHADOW,
    roughness: 0.15,
    outline: 0.005,
  }));
  group.add(makePartCylinder(0.055, 0.045, 0.16, 'plastic', PALETTE.pinkSoft, 0.16, 0.85, -0.04, {
    ...NO_SHADOW,
    roughness: 0.55,
    outline: 0.008,
  }));
  group.add(makePartCylinder(0.05, 0.04, 0.14, 'plastic', PALETTE.matchaMint, 0.05, 0.84, 0.14, {
    ...NO_SHADOW,
    roughness: 0.55,
    outline: 0.008,
  }));
  group.visible = false;
  return group;
}

function buildTrashOverflow(): THREE.Group {
  const group = new THREE.Group();
  const c1 = makePartCylinder(0.06, 0.05, 0.16, 'plastic', PALETTE.creamWall, -0.06, 0.58, 0.03, {
    ...NO_SHADOW,
    roughness: 0.72,
    outline: 0.008,
  });
  c1.rotation.z = 0.4;
  const c2 = makePartCylinder(0.06, 0.05, 0.16, 'plastic', PALETTE.pinkSoft, 0.07, 0.59, -0.04, {
    ...NO_SHADOW,
    roughness: 0.72,
    outline: 0.008,
  });
  c2.rotation.z = -0.45;
  const bag = makePartBox(0.24, 0.12, 0.22, 'fabric', PALETTE.teaBrown, 0, 0.57, 0, {
    ...NO_SHADOW,
    roughness: 0.9,
    outline: 0.009,
  });
  group.add(bag, c1, c2);
  group.visible = false;
  return group;
}

// Đồng bộ hiển thị 3D các vết bẩn sàn, bàn bẩn và thùng rác đầy
export function createCleanlinessView(
  world: ShopWorld,
  cleanliness: CleanlinessStore,
  _interaction: InteractionSystem,
  _onNotify: (msg: string) => void,
): CleanlinessView {
  const stainMeshes = new Map<string, THREE.Group>();

  const dirtyTableOverlays = world.tables.map((tableSet) => {
    const overlay = buildDirtyTableOverlay();
    tableSet.add(overlay);
    return overlay;
  });

  const trashOverflow = buildTrashOverflow();
  world.stations.trashCan.add(trashOverflow);

  const sync = () => {
    const stains = cleanliness.getStains();
    const activeFloorIds = new Set<string>();

    for (const stain of stains) {
      if (stain.kind !== 'spill' && stain.kind !== 'trash') continue;
      activeFloorIds.add(stain.id);
      if (stainMeshes.has(stain.id)) continue;

      const mesh = buildFloorStainMesh(stain.kind);
      mesh.position.set(stain.x, 0, stain.z);
      world.root.add(mesh);
      stainMeshes.set(stain.id, mesh);
    }

    for (const [id, mesh] of stainMeshes) {
      if (activeFloorIds.has(id)) continue;
      mesh.removeFromParent();
      disposeGroupGeometries(mesh);
      stainMeshes.delete(id);
    }

    const dirtyIndices = new Set(cleanliness.getDirtyTableIndices());
    dirtyTableOverlays.forEach((overlay, idx) => {
      overlay.visible = dirtyIndices.has(idx);
    });
    trashOverflow.visible = cleanliness.isTrashFull();
  };

  sync();

  return {
    sync,
    dispose() {
      for (const [, mesh] of stainMeshes) {
        mesh.removeFromParent();
        disposeGroupGeometries(mesh);
      }
      stainMeshes.clear();
      trashOverflow.removeFromParent();
      disposeGroupGeometries(trashOverflow);
      dirtyTableOverlays.forEach((o) => {
        o.removeFromParent();
        disposeGroupGeometries(o);
      });
    },
  };
}
