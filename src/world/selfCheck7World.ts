import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createInteractionSystem } from '../interaction/interactionSystem.ts';
import { CAT_VARIANTS } from '../state/catVariants.ts';
import { CAT_BASE_HEIGHT } from '../state/constantsCat.ts';
import { OUTLINE_ENABLED } from '../state/constantsGraphics.ts';
import { FALL_DOWN_SEC } from '../state/constantsThrow.ts';
import { createMaterial } from '../styles/materials.ts';
import { animateCat, createCat } from './catModel.ts';
import { createCustomerActor } from './customer.ts';
import { createPlayerAvatar } from './playerAvatar.ts';
import { runSelfCheck7c } from './selfCheck7c.ts';
import { runSelfCheck7d } from './selfCheck7d.ts';

function measureMeshWorldBox(mesh: THREE.Mesh): THREE.Box3 {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    box.expandByPoint(v);
  }
  return box;
}

function assertHeadAndEarsGeometry(scale: number): void {
  const tmpPos = new THREE.Vector3();
  const skullCenter = new THREE.Vector3();
  const skullSize = new THREE.Vector3();

  for (const variant of CAT_VARIANTS) {
    const rig = createCat(variant.id, scale === 1 ? undefined : { scale });
    rig.root.updateMatrixWorld(true);

    const skull = rig.head.getObjectByName('catSkull') as THREE.Mesh;
    const earL = rig.head.getObjectByName('catEarL') as THREE.Mesh;
    const earR = rig.head.getObjectByName('catEarR') as THREE.Mesh;
    const muzzle = rig.head.getObjectByName('catMuzzle') as THREE.Mesh;
    const nose = rig.head.getObjectByName('catNose') as THREE.Mesh;
    assert.ok(skull && earL && earR && muzzle && nose, `${variant.id} thiếu cụm đầu/tai/mũi`);

    const skullBox = measureMeshWorldBox(skull);
    skullBox.getCenter(skullCenter);
    skullBox.getSize(skullSize);
    assert.ok(skullSize.y >= skullSize.x - 1e-4, `${variant.id} đầu bị dẹt`);

    const rx = skullSize.x * 0.5;
    const ry = skullSize.y * 0.5;
    const rz = skullSize.z * 0.5;

    for (const ear of [earL, earR]) {
      assert.equal(ear.parent, rig.head);
      const earBox = measureMeshWorldBox(ear);
      assert.equal(earBox.intersectsBox(skullBox), true, `${variant.id} tai không giao với đầu`);
      assert.ok(earBox.min.y < skullBox.max.y, `${variant.id} đáy tai phải thấp hơn đỉnh đầu`);

      ear.getWorldPosition(tmpPos);
      const nx = (tmpPos.x - skullCenter.x) / rx;
      const nz = (tmpPos.z - skullCenter.z) / rz;
      const surfaceY = skullCenter.y + ry * Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
      const embedDepth = surfaceY - earBox.min.y;
      assert.ok(embedDepth > 0.02 * scale && embedDepth < 0.14 * scale, `${variant.id} embed=${embedDepth}`);
      assert.ok(Math.abs(earBox.max.y - rig.height) < 0.01, `${variant.id} earMaxY=${earBox.max.y}`);
    }

    const muzzleBox = measureMeshWorldBox(muzzle);
    const noseBox = measureMeshWorldBox(nose);
    assert.ok(noseBox.max.z > muzzleBox.max.z, `${variant.id} mũi bị chìm vào mõm`);
  }
}

function runCatModelAndCustomerChecks(): void {
  assertHeadAndEarsGeometry(1);
  assertHeadAndEarsGeometry(1.32 / CAT_BASE_HEIGHT);

  // 1. Kiểm tra đủ 6 biến thể mèo, khớp chiều cao 1.56, có viền đen và animateCat không chạm rig.root
  for (const variant of CAT_VARIANTS) {
    const rig = createCat(variant.id);
    assert.equal(rig.height, CAT_BASE_HEIGHT);
    assert.equal(rig.handAnchorL.name, 'handAnchorL');
    assert.equal(rig.handAnchorR.name, 'handAnchorR');

    let meshCount = 0;
    let outlineCount = 0;
    rig.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.name === '__outline') outlineCount++;
        else meshCount++;
      }
    });
    const expectedOutlines = OUTLINE_ENABLED ? meshCount : 0;
    assert.ok(meshCount > 0 && outlineCount === expectedOutlines, `${variant.id} sai số lượng outline`);

    rig.root.position.set(1, 0, 2);
    rig.root.rotation.set(0.1, 0.5, 0.2);
    for (const mode of ['idle', 'walk', 'work'] as const) {
      animateCat(rig, mode, 0.4, 1.5);
      assert.deepEqual(rig.root.position.toArray(), [1, 0, 2]);
      assert.ok(Math.abs(rig.root.rotation.x - 0.1) < 1e-9);
      assert.ok(Math.abs(rig.root.rotation.y - 0.5) < 1e-9);
      assert.ok(Math.abs(rig.root.rotation.z - 0.2) < 1e-9);
    }
  }

  // 2. Khách hàng mèo: hitbox 1.56, quay mặt về quầy (-Z), ngã/choáng hạ hitbox, không trùng biến thể liền trước
  const customer = createCustomerActor();
  assert.equal(customer.hitbox === null, true);

  let arrived = false;
  customer.spawnAt([{ x: 0, z: 2.0 }, { x: 0, z: 0 }], () => {
    arrived = true;
  });
  assert.equal(customer.root.visible, true);
  assert.equal(customer.hitbox?.maxY, CAT_BASE_HEIGHT);

  for (let i = 0; i < 40 && !arrived; i++) customer.update(0.05);
  assert.equal(arrived, true);
  assert.ok(Math.abs(customer.root.rotation.y - Math.PI) < 1e-6);

  let exited = false;
  customer.leaveAlong([{ x: 0, z: 2.0 }], () => {
    exited = true;
  }, { fall: true, hitDir: { x: 0, z: 1 } });
  customer.update(FALL_DOWN_SEC + 0.1);
  assert.ok((customer.hitbox?.maxY ?? 9) < 0.6);

  for (let i = 0; i < 60 && !exited; i++) customer.update(0.1);
  assert.equal(exited, true);
  assert.equal(customer.root.visible, false);

  // Kiểm tra 15 lượt spawn liên tiếp luôn giữ đúng 1 CatRig và không trùng biến thể liền kề
  const extractColors = () => {
    const hexes: number[] = [];
    customer.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.name !== '__outline') {
        hexes.push((obj.material as THREE.MeshStandardMaterial).color.getHex());
      }
    });
    return hexes.join(',');
  };
  let prevSig = '';
  for (let i = 0; i < 15; i++) {
    customer.spawnAt([{ x: 0, z: 0 }], () => {});
    assert.equal(customer.root.children.length, 1);
    const sig = extractColors();
    if (i > 0) assert.ok(sig !== prevSig);
    prevSig = sig;
  }

  // 3. Raycast interactionSystem không bị playerAvatar cản và vẫn trúng mesh mèo khi đăng ký
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 50);
  camera.position.set(0, 1.65, 1.5);
  camera.lookAt(0, 1.0, 0);
  scene.add(camera);
  camera.updateMatrixWorld(true);

  const avatar = createPlayerAvatar(scene, camera);
  avatar.setVisibleToSelf(true);
  avatar.update(0.016);

  const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createMaterial('paint', 0xffffff));
  boxMesh.position.set(0, 1.0, 0);
  scene.add(boxMesh);
  boxMesh.updateMatrixWorld(true);

  let triggered = false;
  const interaction = createInteractionSystem(
    camera,
    [{ target: boxMesh, label: 'Quầy', onInteract: () => { triggered = true; } }],
    () => {},
  );
  interaction.update();
  assert.equal(interaction.getCurrentLabel(), 'Quầy');
  interaction.trigger();
  assert.equal(triggered, true);

  // Đăng ký thử trên rig mèo: raycast trúng mesh mèo bình thường (bỏ qua __outline)
  const cat = createCat('calico');
  cat.root.position.set(0, 0, 0.5);
  scene.add(cat.root);
  cat.root.updateMatrixWorld(true);
  const catInter = createInteractionSystem(camera, [{ target: cat.root, label: 'Mèo', onInteract: () => {} }], () => {});
  catInter.update();
  assert.equal(catInter.getCurrentLabel(), 'Mèo');
  avatar.dispose();
}

runCatModelAndCustomerChecks();
runSelfCheck7c();
runSelfCheck7d();
console.log('Self-check 7 World OK: catModel, customer, staffMember, playerAvatar, handViewmodel');
