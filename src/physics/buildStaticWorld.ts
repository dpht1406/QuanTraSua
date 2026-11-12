import type RAPIER from '@dimforge/rapier3d-compat';
import type { AabbBox, StaticColliderTag } from '../player/collision.ts';
import type { ThrowTarget } from '../state/throwConsequence.ts';
import {
  DEFAULT_STATIC_HEIGHT,
  SHOP_CEILING_BOX,
  WORLD_FLOOR_BOX,
} from './constantsPhysics.ts';
import type { BodyKind, PhysicsWorld } from './physicsWorld.ts';

export interface BuildStaticWorldOptions {
  includeFloor?: boolean;
  includeCeiling?: boolean;
  streetColliders?: readonly AabbBox[];
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

// Dựng các collider tĩnh cho khu đường phố từ cùng danh sách AABB
export function addStreetColliders(
  physics: PhysicsWorld,
  streetColliders: readonly AabbBox[],
): RAPIER.Collider[] {
  const created: RAPIER.Collider[] = [];
  for (const box of streetColliders) {
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

// Dựng toàn bộ vật thể tĩnh Rapier từ danh sách AABB của quán + đường phố kèm sàn chung và trần quán
export function buildStaticWorld(
  physics: PhysicsWorld,
  colliders: readonly AabbBox[],
  opts: BuildStaticWorldOptions = {},
): RAPIER.Collider[] {
  const created: RAPIER.Collider[] = [];

  if (opts.includeFloor !== false) {
    created.push(addBoxFromAabb(physics, WORLD_FLOOR_BOX, 'floor'));
  }
  if (opts.includeCeiling !== false) {
    created.push(addBoxFromAabb(physics, SHOP_CEILING_BOX, 'wall'));
  }

  created.push(...addStreetColliders(physics, colliders));
  if (opts.streetColliders && opts.streetColliders.length > 0) {
    // Khi đã dùng WORLD_FLOOR_BOX liền mạch cho cả quán+phố thì bỏ qua box 'floor' trùng lặp ở đường
    const streetItems =
      opts.includeFloor !== false
        ? opts.streetColliders.filter((b) => b.tag !== 'floor')
        : opts.streetColliders;
    created.push(...addStreetColliders(physics, streetItems));
  }

  return created;
}
