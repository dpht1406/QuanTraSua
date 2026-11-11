import * as THREE from 'three';
import type { GameCtx } from '../gameplay/gameCtx.ts';
import { HAND_PRIORITY } from '../state/constantsHands.ts';
import type { HandId, HeldItemKind } from '../state/hands.ts';
import { createHeldMesh } from './heldMeshes.ts';

interface RestPose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
}

const CUP_POSE: RestPose = { x: 0.26, y: -0.19, z: -0.45, rx: 0.08, ry: -0.25, rz: 0.04, scale: 1 };
const TOOL_POSE: RestPose = { x: 0.30, y: -0.15, z: -0.55, rx: 0.35, ry: -0.22, rz: 0.14, scale: 0.45 };
const SWING_SPEED = 11;

let viewRoot: THREE.Group | null = null;
let slots: Record<HandId, THREE.Group> | null = null;
let shownKinds: Record<HandId, HeldItemKind | null> = { right: null, left: null };
let swingActive: Record<HandId, boolean> = { right: false, left: false };
let swingPhase: Record<HandId, number> = { right: 0, left: 0 };
let cleanups: Array<() => void> = [];

function getPose(kind: HeldItemKind | null): RestPose {
  return kind === 'broom' || kind === 'mop' ? TOOL_POSE : CUP_POSE;
}

function applyRestPose(hand: HandId, slot: THREE.Group, kind: HeldItemKind | null, alpha: number): void {
  const pose = getPose(kind);
  const sign = hand === 'right' ? 1 : -1;
  const tx = pose.x * sign;
  const ty = pose.y;
  const tz = pose.z;
  const rx = pose.rx;
  const ry = pose.ry * sign;
  const rz = pose.rz * sign;

  if (alpha >= 1) {
    slot.position.set(tx, ty, tz);
    slot.rotation.set(rx, ry, rz);
    return;
  }
  slot.position.x += (tx - slot.position.x) * alpha;
  slot.position.y += (ty - slot.position.y) * alpha;
  slot.position.z += (tz - slot.position.z) * alpha;
  slot.rotation.x += (rx - slot.rotation.x) * alpha;
  slot.rotation.y += (ry - slot.rotation.y) * alpha;
  slot.rotation.z += (rz - slot.rotation.z) * alpha;
}

function syncHandSlot(hand: HandId, nextKind: HeldItemKind | null): void {
  if (!slots || shownKinds[hand] === nextKind) return;
  const slot = slots[hand];
  slot.clear();
  shownKinds[hand] = nextKind;
  swingPhase[hand] = 0;

  if (!nextKind) return;
  const mesh = createHeldMesh(nextKind);
  mesh.scale.setScalar(getPose(nextKind).scale);
  mesh.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) obj.castShadow = false;
  });
  slot.add(mesh);
  applyRestPose(hand, slot, nextKind, 1);
}

// Khởi tạo viewmodel hai tay gắn vào camera ở góc nhìn thứ nhất
export function initHandViewmodel(ctx: GameCtx): void {
  for (const fn of cleanups) fn();
  cleanups = [];
  viewRoot?.removeFromParent();

  // Camera phải thuộc scene thì các mesh con gắn vào camera mới được render
  if (!ctx.camera.parent) ctx.scene.add(ctx.camera);

  viewRoot = new THREE.Group();
  slots = { right: new THREE.Group(), left: new THREE.Group() };
  shownKinds = { right: null, left: null };
  swingActive = { right: false, left: false };
  swingPhase = { right: 0, left: 0 };

  viewRoot.add(slots.left, slots.right);
  ctx.camera.add(viewRoot);

  const syncMeshes = () => {
    const hands = ctx.gameStore.getState().hands;
    for (const hand of HAND_PRIORITY) {
      syncHandSlot(hand, hands[hand]?.kind ?? null);
    }
  };

  const tick = (dt: number) => {
    syncMeshes();
    if (!slots) return;
    for (const hand of HAND_PRIORITY) {
      const kind = shownKinds[hand];
      const slot = slots[hand];
      if (!kind) continue;
      if (swingActive[hand]) {
        const pose = getPose(kind);
        const sign = hand === 'right' ? 1 : -1;
        swingPhase[hand] += dt * SWING_SPEED;
        const s = Math.sin(swingPhase[hand]);
        slot.rotation.x = pose.rx + s * (kind === 'cup' ? 0.24 : 0.36);
        slot.rotation.z = pose.rz * sign + s * 0.18 * sign;
        slot.position.z = pose.z - Math.abs(s) * 0.05;
      } else {
        swingPhase[hand] = 0;
        applyRestPose(hand, slot, kind, Math.min(1, dt * 15));
      }
    }
  };

  syncMeshes();
  cleanups.push(
    ctx.eventBus.on('state:changed', syncMeshes),
    ctx.eventBus.on('shiftClosed', () => {
      swingActive = { right: false, left: false };
      syncMeshes();
    }),
    ctx.registerTick(tick),
  );
}

// Bật/tắt động tác vung tay trái hoặc phải
export function setHandSwing(hand: HandId, active: boolean): void {
  swingActive[hand] = active;
  if (!active) swingPhase[hand] = 0;
}
