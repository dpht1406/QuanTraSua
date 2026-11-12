import * as THREE from 'three';
import type { PhysicsWorld } from './physicsWorld.ts';

export interface PhysicsDebug {
  toggle(): boolean;
  update(): void;
  isEnabled(): boolean;
  dispose(): void;
}

const DEBUG_TOGGLE_KEY = 'F4';

// Công cụ vẽ khung collider bằng debugRender của Rapier (mặc định tắt, nhấn F4 bật/tắt)
export function createPhysicsDebug(scene: THREE.Scene, physicsWorld: PhysicsWorld): PhysicsDebug {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineBasicMaterial({ vertexColors: true });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = '__physicsDebugLines';
  lines.visible = false;
  lines.frustumCulled = false;
  scene.add(lines);

  let enabled = false;
  let disposed = false;

  const update = () => {
    if (disposed || !enabled) return;
    const { vertices, colors } = physicsWorld.world.debugRender();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  };

  const toggle = () => {
    if (disposed) return false;
    enabled = !enabled;
    lines.visible = enabled;
    if (enabled) update();
    return enabled;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || event.code !== DEBUG_TOGGLE_KEY) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    toggle();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
  }

  return {
    toggle,
    update,
    isEnabled: () => enabled,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKeyDown);
      }
      lines.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
