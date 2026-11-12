// Hằng số mô phỏng vật lý Rapier (bước cố định, trọng lực, khối lượng, ma sát, damping)
export const GRAVITY = -12.0;
export const FIXED_STEP = 1 / 60;
export const MAX_SUBSTEPS = 5;

export const STATIC_FRICTION = 0.6;
export const STATIC_RESTITUTION = 0.1;
export const DEFAULT_STATIC_HEIGHT = 2.0;

export const SHOP_FLOOR_BOX = {
  minX: -5.2,
  maxX: 5.2,
  minY: -0.25,
  maxY: 0,
  minZ: -4.2,
  maxZ: 4.2,
} as const;

export const SHOP_CEILING_BOX = {
  minX: -5.2,
  maxX: 5.2,
  minY: 3.4,
  maxY: 3.55,
  minZ: -4.2,
  maxZ: 4.2,
} as const;

// Ghế động đẩy được: mặt ghế + lưng ghế
export const CHAIR_MASS = 6.0;
export const CHAIR_FRICTION = 0.7;
export const CHAIR_RESTITUTION = 0.05;
export const CHAIR_LINEAR_DAMPING = 4.0;
export const CHAIR_ANGULAR_DAMPING = 5.0;
export const CHAIR_OUT_OF_BOUNDS_Y = -1.0;

// Người chơi (capsule khóa xoay, ma sát 0 để không dính tường)
export const PLAYER_MASS = 65.0;
export const PLAYER_RADIUS = 0.32;
export const PLAYER_HEIGHT = 1.75;
export const PLAYER_HALF_HEIGHT = (PLAYER_HEIGHT - 2 * PLAYER_RADIUS) / 2;
export const PLAYER_EYE_HEIGHT = 1.65;
export const PLAYER_WALK_SPEED = 3.4;
export const PLAYER_SPRINT_SPEED = 5.0;
export const PLAYER_FRICTION = 0;
export const PLAYER_RESTITUTION = 0;
export const PLAYER_LINEAR_DAMPING = 0;
export const PLAYER_GROUND_ACCEL = 30.0;
export const PLAYER_GROUND_DECEL = 26.0;
export const PLAYER_AIR_ACCEL = 10.0;
export const PLAYER_AIR_DECEL = 2.0;
export const PLAYER_GROUND_RAY_EXTRA = 0.08;
export const MIN_GROUND_NORMAL_Y = 0.5;

// Vật ném (ly khóa xoay, chổi và cây lau)
export const CUP_MASS = 0.35;
export const CUP_RADIUS = 0.07;
export const CUP_HALF_HEIGHT = 0.09;
export const CUP_FRICTION = 0.5;
export const CUP_RESTITUTION = 0.1;
export const CUP_LINEAR_DAMPING = 0.1;
export const CUP_BREAK_IMPULSE = 2.8;

export const BROOM_MASS = 0.9;
export const MOP_MASS = 1.1;
export const TOOL_RADIUS = 0.09;
export const TOOL_HALF_LENGTH = 0.55;
export const TOOL_FRICTION = 0.68;
export const TOOL_RESTITUTION = 0.36;
export const TOOL_LINEAR_DAMPING = 0.4;
export const TOOL_ANGULAR_DAMPING = 1.2;

// Hitbox nhân viên và khách hàng (thân kinematic)
export const STAFF_COLLIDER_HALF_W = 0.28;
export const STAFF_COLLIDER_HEIGHT = 1.32;
export const CUSTOMER_COLLIDER_HALF_W = 0.28;
export const CUSTOMER_COLLIDER_HEIGHT = 1.56;
