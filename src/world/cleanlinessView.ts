import * as THREE from 'three';
import type { InteractionSystem } from '../interaction/interactionSystem.ts';
import { CLEAN_HOLD_SEC } from '../state/constants.ts';
import type { CleanlinessStore } from '../state/cleanliness.ts';
import { PALETTE } from '../styles/palette.ts';
import { makeBox, makeCylinder } from './furniture.ts';
import type { ShopWorld } from './shopWorld.ts';

export interface CleanlinessView {
  sync(): void;
  dispose(): void;
}

function buildFloorStainMesh(kind: 'spill' | 'trash'): THREE.Group {
  const group = new THREE.Group();
  if (kind === 'spill') {
    group.add(makeBox(0.56, 0.02, 0.44, PALETTE.teaBrown, 0, 0.012, 0, 0.008));
    const splash = makeBox(0.28, 0.02, 0.24, PALETTE.syrupPeach, 0.16, 0.014, 0.14, 0.008);
    splash.rotation.y = 0.45;
    group.add(splash);
  } else {
    const wrapper = makeBox(0.42, 0.02, 0.32, PALETTE.creamWall, 0, 0.012, 0, 0.008);
    wrapper.rotation.y = 0.3;
    group.add(wrapper);
    const cup = makeCylinder(0.06, 0.05, 0.16, PALETTE.pinkSoft, 0.05, 0.07, 0.02, 0.008);
    cup.rotation.z = 1.32;
    cup.rotation.y = 0.5;
    group.add(cup);
  }
  return group;
}

function buildDirtyTableOverlay(): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox(0.26, 0.02, 0.24, PALETTE.creamWall, -0.08, 0.78, 0.06, 0.007));
  group.add(makeBox(0.18, 0.012, 0.16, PALETTE.teaBrown, -0.1, 0.776, -0.14, 0.005));
  group.add(makeCylinder(0.055, 0.045, 0.16, PALETTE.pinkSoft, 0.16, 0.85, -0.04, 0.008));
  group.add(makeCylinder(0.05, 0.04, 0.14, PALETTE.matchaMint, 0.05, 0.84, 0.14, 0.008));
  group.visible = false;
  return group;
}

function buildTrashOverflow(): THREE.Group {
  const group = new THREE.Group();
  const c1 = makeCylinder(0.06, 0.05, 0.16, PALETTE.creamWall, -0.06, 0.58, 0.03, 0.008);
  c1.rotation.z = 0.4;
  const c2 = makeCylinder(0.06, 0.05, 0.16, PALETTE.pinkSoft, 0.07, 0.59, -0.04, 0.008);
  c2.rotation.z = -0.45;
  const bag = makeBox(0.24, 0.12, 0.22, PALETTE.teaBrown, 0, 0.57, 0, 0.009);
  group.add(bag, c1, c2);
  group.visible = false;
  return group;
}

// Đồng bộ hiển thị 3D các vết bẩn sàn, bàn bẩn, thùng rác đầy và gắn tương tác giữ E để dọn
export function createCleanlinessView(
  world: ShopWorld,
  cleanliness: CleanlinessStore,
  interaction: InteractionSystem,
  onNotify: (msg: string) => void,
): CleanlinessView {
  const stainMeshes = new Map<string, THREE.Group>();

  const dirtyTableOverlays = world.tables.map((tableSet, idx) => {
    const overlay = buildDirtyTableOverlay();
    tableSet.add(overlay);
    const findDirtyId = () =>
      cleanliness.getStains().find((s) => s.kind === 'dirty_table' && s.tableIndex === idx)?.id;

    // shortcut: dùng dụng cụ lau mặc định khi giữ E vào vết bẩn/bàn bẩn, không cần nhặt chổi
    interaction.register({
      target: tableSet,
      label: () => (findDirtyId() ? `Lau bàn bẩn số ${idx + 1}` : `Kiểm tra bàn ${idx + 1}`),
      holdSec: () => (findDirtyId() ? CLEAN_HOLD_SEC.dirty_table : 0),
      onInteract() {
        const id = findDirtyId();
        if (!id) {
          onNotify(`Bàn số ${idx + 1} sạch sẽ!`);
          return;
        }
        cleanliness.cleanStain(id);
        sync();
        onNotify(`Đã lau sạch bàn số ${idx + 1}!`);
      },
    });
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

      interaction.register({
        target: mesh,
        label: stain.kind === 'spill' ? 'Lau vết đổ trên sàn' : 'Dọn rác trên sàn',
        holdSec: CLEAN_HOLD_SEC[stain.kind],
        onInteract() {
          cleanliness.cleanStain(stain.id);
          sync();
          onNotify(stain.kind === 'spill' ? 'Đã lau sạch vết đổ!' : 'Đã dọn rác trên sàn!');
        },
      });
    }

    for (const [id, mesh] of stainMeshes) {
      if (activeFloorIds.has(id)) continue;
      interaction.unregister(mesh);
      mesh.removeFromParent();
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
        interaction.unregister(mesh);
        mesh.removeFromParent();
      }
      stainMeshes.clear();
      trashOverflow.removeFromParent();
      dirtyTableOverlays.forEach((o) => o.removeFromParent());
    },
  };
}
