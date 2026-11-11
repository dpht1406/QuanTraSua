import * as THREE from 'three';

export interface Interactable {
  target: THREE.Object3D;
  label: string | (() => string);
  onInteract: () => void;
}

export interface InteractionSystem {
  update(): void;
  trigger(): void;
  getCurrentTarget(): Interactable | null;
  getCurrentLabel(): string | null;
}

const CENTER_NDC = new THREE.Vector2(0, 0);
const MAX_INTERACT_DISTANCE = 2.0;

// Hệ thống raycast tầm 2m từ tâm màn hình để phát hiện vật thể tương tác và kích hoạt phím E
export function createInteractionSystem(
  camera: THREE.Camera,
  interactables: readonly Interactable[],
  onTargetChange: (label: string | null) => void,
): InteractionSystem {
  const raycaster = new THREE.Raycaster();
  raycaster.far = MAX_INTERACT_DISTANCE;

  const rayTargets: THREE.Mesh[] = [];
  const meshToItem = new Map<THREE.Object3D, Interactable>();

  for (const item of interactables) {
    item.target.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name !== '__outline') {
        rayTargets.push(child);
        meshToItem.set(child, item);
      }
    });
  }

  let current: Interactable | null = null;
  let lastLabel: string | null = null;

  return {
    update() {
      raycaster.setFromCamera(CENTER_NDC, camera);
      const hits = raycaster.intersectObjects(rayTargets, false);
      const next = hits.length > 0 ? (meshToItem.get(hits[0].object) ?? null) : null;
      current = next;

      const nextLabel = next
        ? typeof next.label === 'function'
          ? next.label()
          : next.label
        : null;
      if (nextLabel !== lastLabel) {
        lastLabel = nextLabel;
        onTargetChange(nextLabel);
      }
    },

    trigger() {
      current?.onInteract();
    },

    getCurrentTarget() {
      return current;
    },

    getCurrentLabel() {
      return lastLabel;
    },
  };
}
