import type RAPIER from '@dimforge/rapier3d-compat';
import type { StaticColliderTag } from '../player/collision.ts';

export type BodyKind = StaticColliderTag | 'chair' | 'projectile' | 'player' | 'staff' | 'customer';

export interface BodyTag {
  kind: BodyKind;
  id?: string | number;
  colliderHandle?: number;
  bodyHandle?: number;
  meta?: Record<string, unknown>;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type ShapeDesc =
  | { type: 'box'; hx: number; hy: number; hz: number }
  | { type: 'ball'; radius: number }
  | { type: 'capsule'; halfHeight: number; radius: number }
  | { type: 'cylinder'; halfHeight: number; radius: number };

export interface ColliderPartDesc {
  shape: ShapeDesc;
  offset?: Vec3Like;
  rotation?: QuatLike;
  friction?: number;
  restitution?: number;
  mass?: number;
  isSensor?: boolean;
}

export interface DynamicBodyDesc {
  type?: 'dynamic' | 'kinematicPosition' | 'kinematicVelocity';
  position?: Vec3Like;
  rotation?: QuatLike;
  linvel?: Vec3Like;
  angvel?: Vec3Like;
  mass?: number;
  linearDamping?: number;
  angularDamping?: number;
  gravityScale?: number;
  canSleep?: boolean;
  ccdEnabled?: boolean;
  lockRotations?: boolean;
  enabledRotations?: [boolean, boolean, boolean];
  friction?: number;
  restitution?: number;
  frictionCombineRule?: RAPIER.CoefficientCombineRule;
  restitutionCombineRule?: RAPIER.CoefficientCombineRule;
  collisionGroups?: number;
  activeCollisionTypes?: number;
  activeEvents?: number;
  isSensor?: boolean;
  shape?: ShapeDesc;
  colliders?: ColliderPartDesc[];
  tag: BodyTag;
}

export interface RaycastFilter {
  groups?: number;
  flags?: RAPIER.QueryFilterFlags;
  excludeBody?: RAPIER.RigidBody;
  excludeCollider?: RAPIER.Collider;
  predicate?: (tag: BodyTag) => boolean;
}

export interface RaycastHit {
  distance: number;
  point: Vec3Like;
  normal: Vec3Like;
  tag: BodyTag;
  colliderHandle: number;
}

export type ContactCallback = (a: BodyTag, b: BodyTag, impulse: number) => void;

export interface PhysicsWorld {
  readonly world: RAPIER.World;
  readonly alpha: number;
  step(dt: number): void;
  onContact(cb: ContactCallback): () => void;
  addStaticBox(center: Vec3Like, halfExtents: Vec3Like, tag: StaticColliderTag | BodyTag): RAPIER.Collider;
  addDynamicBody(desc: DynamicBodyDesc): RAPIER.RigidBody;
  removeBody(handle: number): void;
  raycast(origin: Vec3Like, dir: Vec3Like, maxDist: number, filter?: number | RaycastFilter): RaycastHit | null;
  registerColliderTag(colliderHandle: number, tag: BodyTag): void;
  dispose(): void;
}
