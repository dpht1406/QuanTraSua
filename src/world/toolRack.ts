import * as THREE from 'three';
import type { GameCtx } from '../gameplay/gameCtx.ts';
import type { AabbBox } from '../player/collision.ts';
import type { ToolKind, ToolLocations } from '../state/toolLocations.ts';
import { markShadow } from '../styles/materials.ts';
import { PALETTE } from '../styles/palette.ts';
import { makePartBox } from './furniturePrimitives.ts';
import { createHeldMesh } from './heldMeshes.ts';

export interface ToolRack {
  root: THREE.Group;
  sync(tools: ToolLocations): void;
  dispose(): void;
}

export interface ToolRackHandlers {
  getSlotLabel(kind: ToolKind): string;
  onSlotInteract(kind: ToolKind): void;
}

const RACK_POS = { x: 3.6, y: 0, z: -3.97 } as const;
const RACK_COLLIDER: AabbBox = { minX: 3.18, maxX: 4.02, minZ: -4.02, maxZ: -3.82, minY: 0, maxY: 1.65, tag: 'rack' };
const SLOT_X: Record<ToolKind, number> = { broom: -0.19, mop: 0.19 };

function buildSlotGroup(x: number, badgeColor: number): THREE.Group {
  const slot = new THREE.Group();
  slot.position.set(x, 0, 0);
  slot.add(makePartBox(0.35, 1.08, 0.02, 'paint', PALETTE.creamWall, 0, 1.03, 0.01, {
    outline: 0.008,
    castShadow: false,
    receiveShadow: true,
  }));
  slot.add(makePartBox(0.24, 0.07, 0.02, 'plastic', badgeColor, 0, 1.56, 0.045, { outline: 0.006 }));
  slot.add(makePartBox(0.025, 0.04, 0.09, 'metal', PALETTE.teaDark, -0.042, 1.46, 0.065, { outline: 0.006 }));
  slot.add(makePartBox(0.025, 0.04, 0.09, 'metal', PALETTE.teaDark, 0.042, 1.46, 0.065, { outline: 0.006 }));
  return slot;
}

// Dựng giá treo chổi & cây lau ở tường sau (cạnh bảng nhân viên), đồng bộ hiển thị và đăng ký E
export function createToolRack(ctx: GameCtx, handlers: ToolRackHandlers): ToolRack {
  const root = new THREE.Group();
  root.position.set(RACK_POS.x, RACK_POS.y, RACK_POS.z);
  root.add(makePartBox(0.78, 0.14, 0.04, 'wood', PALETTE.teaDark, 0, 1.56, 0.02, { outline: 0.01 }));

  const broomSlot = buildSlotGroup(SLOT_X.broom, PALETTE.pinkBlush);
  const mopSlot = buildSlotGroup(SLOT_X.mop, PALETTE.matchaGreen);
  root.add(broomSlot, mopSlot);

  const broomMesh = createHeldMesh('broom');
  broomMesh.position.set(SLOT_X.broom, 0.94, 0.095);
  markShadow(broomMesh, true, true);
  const mopMesh = createHeldMesh('mop');
  mopMesh.position.set(SLOT_X.mop, 0.94, 0.095);
  markShadow(mopMesh, true, true);
  root.add(broomMesh, mopMesh);

  ctx.scene.add(root);
  ctx.colliders.push(RACK_COLLIDER);

  const slots: Array<{ kind: ToolKind; target: THREE.Group }> = [
    { kind: 'broom', target: broomSlot },
    { kind: 'mop', target: mopSlot },
  ];
  for (const s of slots) {
    ctx.interaction.register({
      target: s.target,
      label: () => handlers.getSlotLabel(s.kind),
      onInteract: () => handlers.onSlotInteract(s.kind),
    });
  }

  return {
    root,

    sync(tools) {
      broomMesh.visible = tools.broom === 'rack';
      mopMesh.visible = tools.mop === 'rack';
    },

    dispose() {
      for (const s of slots) ctx.interaction.unregister(s.target);
      const colIdx = ctx.colliders.indexOf(RACK_COLLIDER);
      if (colIdx >= 0) ctx.colliders.splice(colIdx, 1);
      root.removeFromParent();
    },
  };
}
