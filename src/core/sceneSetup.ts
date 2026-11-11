import * as THREE from 'three';
import { PALETTE } from '../styles/palette.ts';

export interface SceneBundle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  setDimmed(dimmed: boolean): void;
  dispose(): void;
}

// Khởi tạo Scene nền sáng pastel, Camera góc nhìn thứ nhất và WebGLRenderer
export function createSceneSetup(container: HTMLElement): SceneBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.background);

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 50);
  camera.position.set(0, 1.65, 2.0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(PALETTE.ambientLight, 0.85);
  const hemi = new THREE.HemisphereLight(PALETTE.ambientLight, PALETTE.creamTrim, 0.65);
  const sun = new THREE.DirectionalLight(PALETTE.sunLight, 0.95);
  sun.position.set(3.5, 6.5, 4.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 20;
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  sun.shadow.bias = -0.0008;

  scene.add(ambient, hemi, sun);

  const onResize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
  };

  window.addEventListener('resize', onResize);

  return {
    scene,
    camera,
    renderer,
    setDimmed(dimmed) {
      ambient.intensity = dimmed ? 0.22 : 0.85;
      hemi.intensity = dimmed ? 0.16 : 0.65;
      sun.intensity = dimmed ? 0.18 : 0.95;
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    },
  };
}
