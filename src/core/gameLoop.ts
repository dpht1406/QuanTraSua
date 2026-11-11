import * as THREE from 'three';

// Chạy vòng lặp game 60fps với delta time giới hạn để tránh xuyên tường khi chuyển tab
export function startGameLoop(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  onTick: (dt: number) => void,
): () => void {
  const clock = new THREE.Clock();
  let frameId = 0;
  let running = true;

  const frame = () => {
    if (!running) return;
    frameId = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    onTick(dt);
    renderer.render(scene, camera);
  };

  frameId = requestAnimationFrame(frame);

  return () => {
    running = false;
    cancelAnimationFrame(frameId);
  };
}
