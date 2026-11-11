import * as THREE from 'three';
import { PALETTE } from './palette.ts';

const outlineMaterial = new THREE.MeshBasicMaterial({
  color: PALETTE.outline,
  side: THREE.BackSide,
});

// Thêm viền đen inverted hull cho mesh; BoxGeometry scale từng trục để giữ viền đều
export function addOutline(mesh: THREE.Mesh, thickness = 0.014): THREE.Mesh {
  const outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
  outline.name = '__outline';
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.raycast = () => {};

  if (mesh.geometry instanceof THREE.BoxGeometry) {
    const { width, height, depth } = mesh.geometry.parameters;
    const sx = Math.max(width * Math.abs(mesh.scale.x), 0.001);
    const sy = Math.max(height * Math.abs(mesh.scale.y), 0.001);
    const sz = Math.max(depth * Math.abs(mesh.scale.z), 0.001);
    outline.scale.set(
      (sx + 2 * thickness) / sx,
      (sy + 2 * thickness) / sy,
      (sz + 2 * thickness) / sz,
    );
  } else {
    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }
    const size = new THREE.Vector3();
    mesh.geometry.boundingBox?.getSize(size);
    const avg = Math.max((size.x + size.y + size.z) / 3, 0.05);
    outline.scale.setScalar((avg + 2 * thickness) / avg);
  }

  mesh.add(outline);
  return outline;
}
