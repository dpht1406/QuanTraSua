import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export interface BindMeshOptions {
  offset?: { x: number; y: number; z: number };
  syncRotation?: boolean;
  rotationOffset?: THREE.Quaternion;
}

interface Pose {
  px: number;
  py: number;
  pz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

interface MeshBinding {
  body: RAPIER.RigidBody;
  object3D: THREE.Object3D;
  offset: THREE.Vector3 | null;
  syncRotation: boolean;
  rotationOffset: THREE.Quaternion | null;
}

const prevPoses = new WeakMap<RAPIER.RigidBody, Pose>();
const bindings: MeshBinding[] = [];
let currentAlpha = 1;

const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpPrevQuat = new THREE.Quaternion();
const tmpCurrQuat = new THREE.Quaternion();
const tmpOffset = new THREE.Vector3();

function clampAlpha(alpha: number): number {
  return alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
}

// Ghi lại vị trí/hướng của 1 thân trước khi chạy bước vật lý tiếp theo
export function snapshotBodyPose(body: RAPIER.RigidBody): void {
  if (!body.isValid()) return;
  const t = body.translation();
  const r = body.rotation();
  const existing = prevPoses.get(body);
  if (existing) {
    existing.px = t.x;
    existing.py = t.y;
    existing.pz = t.z;
    existing.qx = r.x;
    existing.qy = r.y;
    existing.qz = r.z;
    existing.qw = r.w;
    return;
  }
  prevPoses.set(body, { px: t.x, py: t.y, pz: t.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w });
}

// Ghi lại trạng thái trước bước cho toàn bộ thân động/kinematic trong thế giới Rapier
export function snapshotWorldPoses(world: RAPIER.World): void {
  world.forEachRigidBody((body) => {
    if (!body.isFixed()) snapshotBodyPose(body);
  });
}

// Cập nhật hệ số nội suy alpha mới nhất từ PhysicsWorld
export function setPhysicsSyncAlpha(alpha: number): void {
  currentAlpha = clampAlpha(alpha);
}

// Lấy vị trí đã nội suy giữa bước vật lý trước và hiện tại để mượt trên màn hình 144Hz
export function getInterpolatedPosition(
  body: RAPIER.RigidBody,
  alpha = currentAlpha,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  if (!body.isValid()) return out;
  const curr = body.translation();
  const prev = prevPoses.get(body);
  if (!prev) return out.set(curr.x, curr.y, curr.z);
  const a = clampAlpha(alpha);
  return out.set(
    prev.px + (curr.x - prev.px) * a,
    prev.py + (curr.y - prev.py) * a,
    prev.pz + (curr.z - prev.pz) * a,
  );
}

// Lấy góc quay đã nội suy (slerp) giữa bước vật lý trước và hiện tại
export function getInterpolatedRotation(
  body: RAPIER.RigidBody,
  alpha = currentAlpha,
  out = new THREE.Quaternion(),
): THREE.Quaternion {
  if (!body.isValid()) return out;
  const curr = body.rotation();
  const prev = prevPoses.get(body);
  if (!prev) return out.set(curr.x, curr.y, curr.z, curr.w);
  tmpPrevQuat.set(prev.qx, prev.qy, prev.qz, prev.qw);
  tmpCurrQuat.set(curr.x, curr.y, curr.z, curr.w);
  return out.slerpQuaternions(tmpPrevQuat, tmpCurrQuat, clampAlpha(alpha));
}

function applyBinding(binding: MeshBinding, alpha: number): void {
  getInterpolatedPosition(binding.body, alpha, tmpPos);
  if (binding.syncRotation) {
    getInterpolatedRotation(binding.body, alpha, tmpQuat);
    if (binding.rotationOffset) tmpQuat.multiply(binding.rotationOffset);
    binding.object3D.quaternion.copy(tmpQuat);
  }
  if (binding.offset) {
    tmpOffset.copy(binding.offset);
    if (binding.syncRotation) tmpOffset.applyQuaternion(binding.object3D.quaternion);
    tmpPos.add(tmpOffset);
  }
  binding.object3D.position.copy(tmpPos);
}

// Gắn một mesh Three.js theo thân vật lý và đồng bộ tư thế ban đầu
export function bindMesh(body: RAPIER.RigidBody, object3D: THREE.Object3D, opts: BindMeshOptions = {}): void {
  if (!prevPoses.has(body)) snapshotBodyPose(body);
  for (let i = bindings.length - 1; i >= 0; i--) {
    if (bindings[i].object3D === object3D) bindings.splice(i, 1);
  }
  const binding: MeshBinding = {
    body,
    object3D,
    offset: opts.offset ? new THREE.Vector3(opts.offset.x, opts.offset.y, opts.offset.z) : null,
    syncRotation: opts.syncRotation !== false,
    rotationOffset: opts.rotationOffset ? opts.rotationOffset.clone() : null,
  };
  bindings.push(binding);
  applyBinding(binding, 1);
}

// Gỡ liên kết mesh theo RigidBody hoặc Object3D
export function unbindMesh(target: RAPIER.RigidBody | THREE.Object3D): void {
  for (let i = bindings.length - 1; i >= 0; i--) {
    if (bindings[i].body === target || bindings[i].object3D === target) {
      bindings.splice(i, 1);
    }
  }
}

// Nội suy và cập nhật toàn bộ mesh đang gắn thân động theo alpha (0..1)
export function updateBoundMeshes(alpha = currentAlpha): void {
  for (let i = bindings.length - 1; i >= 0; i--) {
    const binding = bindings[i];
    if (!binding.body.isValid()) {
      bindings.splice(i, 1);
      continue;
    }
    applyBinding(binding, alpha);
  }
}

// Xóa toàn bộ danh sách liên kết mesh khi hủy thế giới vật lý
export function clearPhysicsSync(): void {
  bindings.length = 0;
  currentAlpha = 1;
}
