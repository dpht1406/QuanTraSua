import * as THREE from 'three';

export interface Interactable {
  target: THREE.Object3D;
  label: string | (() => string);
  onInteract: () => void;
  holdSec?: number | (() => number);
}

export interface InteractionSystem {
  update(dt?: number, isHoldDown?: boolean): void;
  trigger(): void;
  cancelHold(): void;
  register(item: Interactable): void;
  unregister(target: THREE.Object3D): void;
  getCurrentTarget(): Interactable | null;
  getCurrentLabel(): string | null;
}

const CENTER_NDC = new THREE.Vector2(0, 0);
const MAX_INTERACT_DISTANCE = 2.2;

function getHoldDuration(item: Interactable | null): number {
  if (!item || item.holdSec === undefined) return 0;
  return typeof item.holdSec === 'function' ? item.holdSec() : item.holdSec;
}

// Hệ thống raycast tầm 2.2m từ tâm màn hình, hỗ trợ cả nhấn E và giữ E kèm đăng ký vật thể động
export function createInteractionSystem(
  camera: THREE.Camera,
  initialInteractables: readonly Interactable[],
  onTargetChange: (label: string | null, isHold: boolean) => void,
  onHoldProgress?: (progress: number | null) => void,
): InteractionSystem {
  const raycaster = new THREE.Raycaster();
  raycaster.far = MAX_INTERACT_DISTANCE;

  const rayTargets: THREE.Mesh[] = [];
  const meshToItem = new Map<THREE.Object3D, Interactable>();

  const register = (item: Interactable) => {
    item.target.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name !== '__outline' && !meshToItem.has(child)) {
        rayTargets.push(child);
        meshToItem.set(child, item);
      }
    });
  };

  const unregister = (target: THREE.Object3D) => {
    target.traverse((child) => {
      if (meshToItem.delete(child)) {
        const idx = rayTargets.indexOf(child as THREE.Mesh);
        if (idx >= 0) rayTargets.splice(idx, 1);
      }
    });
    if (current?.target === target) current = null;
    if (holdTarget?.target === target) {
      holdTarget = null;
      holdElapsed = 0;
      emitProgress(null);
    }
  };

  for (const item of initialInteractables) register(item);

  let current: Interactable | null = null;
  let lastLabel: string | null = null;
  let lastIsHold = false;
  let holdTarget: Interactable | null = null;
  let holdElapsed = 0;
  let lastProgress: number | null = null;
  let requireRelease = false;

  const emitProgress = (progress: number | null) => {
    if (progress === lastProgress) return;
    lastProgress = progress;
    onHoldProgress?.(progress);
  };

  const cancelHold = () => {
    holdTarget = null;
    holdElapsed = 0;
    emitProgress(null);
  };

  return {
    register,
    unregister,
    cancelHold,

    update(dt = 0, isHoldDown = false) {
      raycaster.setFromCamera(CENTER_NDC, camera);
      const hits = raycaster.intersectObjects(rayTargets, false);
      const next = hits.length > 0 ? (meshToItem.get(hits[0].object) ?? null) : null;
      current = next;

      const requiredHold = getHoldDuration(next);
      const nextIsHold = requiredHold > 0;
      const nextLabel = next
        ? typeof next.label === 'function'
          ? next.label()
          : next.label
        : null;

      if (nextLabel !== lastLabel || nextIsHold !== lastIsHold) {
        lastLabel = nextLabel;
        lastIsHold = nextIsHold;
        onTargetChange(nextLabel, nextIsHold);
      }

      if (!isHoldDown) {
        requireRelease = false;
        cancelHold();
        return;
      }

      if (next && requiredHold > 0 && !requireRelease) {
        if (next !== holdTarget) {
          holdTarget = next;
          holdElapsed = 0;
        }
        holdElapsed += dt;
        if (holdElapsed >= requiredHold) {
          holdTarget = null;
          holdElapsed = 0;
          requireRelease = true;
          emitProgress(null);
          next.onInteract();
          return;
        }
        emitProgress(Math.min(1, holdElapsed / requiredHold));
      } else {
        cancelHold();
      }
    },

    trigger() {
      if (!current || getHoldDuration(current) > 0) return;
      current.onInteract();
    },

    getCurrentTarget() {
      return current;
    },

    getCurrentLabel() {
      return lastLabel;
    },
  };
}
