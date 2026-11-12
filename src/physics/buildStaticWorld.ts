import type RAPIER from '@dimforge/rapier3d-compat';
import type { AabbBox, StaticColliderTag } from '../player/collision.ts';
import type { ThrowTarget } from '../state/throwConsequence.ts';
import {
  DEFAULT_STATIC_HEIGHT,
  SHOP_CEILING_BOX,
  SHOP_FLOOR_BOX,
} from './constantsPhysics.ts';
import type { BodyKind, PhysicsWorld } from './physicsWorld.ts';

export interface BuildStaticWorldOptions {
  includeFloor?: boolean;
  includeCeiling?: boolean;
}

function addBoxFromAabb(
  physics: PhysicsWorld,
  box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
  tag: StaticColliderTag,
): RAPIER.Collider {
  const cx = (box.minX + box.maxX) * 0.5;
  const cy = (box.minY + box.maxY) * 0.5;
  const cz = (box.minZ + box.maxZ) * 0.5;
  const hx = Math.max(0.01, (box.maxX - box.minX) * 0.5);
  const hy = Math.max(0.01, (box.maxY - box.minY) * 0.5);
  const hz = Math.max(0.01, (box.maxZ - box.minZ) * 0.5);
  return physics.addStaticBox({ x: cx, y: cy, z: cz }, { x: hx, y: hy, z: hz }, tag);
}

// Ánh xạ tag vật tĩnh sang đích va chạm của resolveThrow/objectThrown
export function staticTagToThrowTarget(kind: BodyKind): ThrowTarget | null {
  switch (kind) {
    case 'floor':
    case 'wall':
    case 'table':
    case 'counter':
    case 'bin':
    case 'staff':
    case 'customer':
      return kind;
    case 'machine':
    case 'rack':
      return 'wall';
    case 'chair':
      return 'table';
    default:
      return null;
  }
}

// Dựng toàn bộ vật thể tĩnh Rapier từ cùng danh sách AABB của collision.ts kèm sàn và trần
export function buildStaticWorld(
  physics: PhysicsWorld,
  colliders: readonly AabbBox[],
  opts: BuildStaticWorldOptions = {},
): RAPIER.Collider[] {
  const created: RAPIER.Collider[] = [];

  if (opts.includeFloor !== false) {
    created.push(addBoxFromAabb(physics, SHOP_FLOOR_BOX, 'floor'));
  }
  if (opts.includeCeiling !== false) {
    created.push(addBoxFromAabb(physics, SHOP_CEILING_BOX, 'wall'));
  }

  for (const box of colliders) {
    created.push(
      addBoxFromAabb(
        physics,
        {
          minX: box.minX,
          maxX: box.maxX,
          minY: box.minY ?? 0,
          maxY: box.maxY ?? DEFAULT_STATIC_HEIGHT,
          minZ: box.minZ,
          maxZ: box.maxZ,
        },
        box.tag ?? 'wall',
      ),
    );
  }

  return created;
}
