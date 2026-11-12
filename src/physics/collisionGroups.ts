// Nhóm bitmask va chạm cho Rapier InteractionGroups (16 bit cao = membership, 16 bit thấp = filter)
export const CollisionGroup = {
  NONE: 0,
  STATIC: 1 << 0,
  PLAYER: 1 << 1,
  CHAIR: 1 << 2,
  PROJECTILE: 1 << 3,
  STAFF: 1 << 4,
  CUSTOMER: 1 << 5,
  ALL: 0xffff,
} as const;

// Ghép cặp (membership, filter) thành số nguyên 32-bit cho ColliderDesc.setCollisionGroups
export function groups(membership: number, filter: number): number {
  return (((membership & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
}

// Kiểm tra hai nhóm InteractionGroups có cho phép va chạm đối xứng nhau hay không
export function canCollide(groupA: number, groupB: number): boolean {
  const memA = (groupA >>> 16) & 0xffff;
  const filA = groupA & 0xffff;
  const memB = (groupB >>> 16) & 0xffff;
  const filB = groupB & 0xffff;
  return (memA & filB) !== 0 && (memB & filA) !== 0;
}

// Hợp đồng va chạm:
// - STATIC <-> PLAYER, CHAIR, PROJECTILE, STAFF
// - PLAYER <-> STATIC, CHAIR (không với PROJECTILE, CUSTOMER, STAFF — giữ hành vi collision.ts cũ)
// - CHAIR <-> STATIC, PLAYER, CHAIR, STAFF, PROJECTILE
// - PROJECTILE <-> STATIC, CHAIR, STAFF, CUSTOMER (không với PLAYER hoặc PROJECTILE khác)
// - STAFF <-> CHAIR, PROJECTILE, STATIC
// - CUSTOMER <-> PROJECTILE (chỉ với PROJECTILE)
export const COLLISION_GROUPS = {
  STATIC: groups(
    CollisionGroup.STATIC,
    CollisionGroup.PLAYER | CollisionGroup.CHAIR | CollisionGroup.PROJECTILE | CollisionGroup.STAFF,
  ),
  PLAYER: groups(CollisionGroup.PLAYER, CollisionGroup.STATIC | CollisionGroup.CHAIR),
  CHAIR: groups(
    CollisionGroup.CHAIR,
    CollisionGroup.STATIC | CollisionGroup.PLAYER | CollisionGroup.CHAIR | CollisionGroup.STAFF | CollisionGroup.PROJECTILE,
  ),
  PROJECTILE: groups(
    CollisionGroup.PROJECTILE,
    CollisionGroup.STATIC | CollisionGroup.CHAIR | CollisionGroup.STAFF | CollisionGroup.CUSTOMER,
  ),
  STAFF: groups(CollisionGroup.STAFF, CollisionGroup.CHAIR | CollisionGroup.PROJECTILE | CollisionGroup.STATIC),
  CUSTOMER: groups(CollisionGroup.CUSTOMER, CollisionGroup.PROJECTILE),
} as const;
