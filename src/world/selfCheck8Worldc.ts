import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { GameCtx } from '../gameplay/gameCtx.ts';
import { STAFF_CANDIDATES } from '../state/constants.ts';
import { CAT_VARIANTS } from '../state/catVariants.ts';
import { CAT_BASE_HEIGHT, CAT_INNER_EAR_COLOR } from '../state/constantsCat.ts';
import { createEventBus } from '../state/eventBus.ts';
import { createGameStore, type GameEvents } from '../state/gameState.ts';
import { createEmptyCup } from '../state/scoring.ts';
import { createCat } from './catModel.ts';
import { createCustomerActor } from './customer.ts';
import { createFallAnimation } from './fallAnimation.ts';
import { initHandViewmodel } from './handViewmodel.ts';
import { createHeldMesh } from './heldMeshes.ts';
import { createPlayerAvatar } from './playerAvatar.ts';
import { createProjectileVisual } from './projectileMeshes.ts';
import { createStaffActor } from './staffMember.ts';

function worldBox(mesh: THREE.Mesh): THREE.Box3 {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    box.expandByPoint(v);
  }
  return box;
}

function assertStandardMaterials(root: THREE.Object3D, label: string): void {
  let count = 0;
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      assert.ok(obj.name !== '__outline', `${label}: không được tạo viền khi OUTLINE_ENABLED=false`);
      assert.ok(obj.material instanceof THREE.MeshStandardMaterial, `${label}: phải dùng MeshStandardMaterial`);
      count++;
    }
  });
  assert.ok(count > 0, `${label}: phải có mesh`);
}

function checkVariantsAndEars(scale: number, expectedHeight: number, label: string): void {
  for (const variant of CAT_VARIANTS) {
    const rig = createCat(variant.id, scale === 1 ? undefined : { scale });
    assert.ok(Math.abs(rig.height - expectedHeight) < 1e-6, `${label} ${variant.id} sai rig.height`);
    assertStandardMaterials(rig.root, `${label}:${variant.id}`);

    rig.root.updateMatrixWorld(true);
    const skull = rig.head.getObjectByName('catSkull') as THREE.Mesh;
    const skullBox = worldBox(skull);
    for (const side of ['L', 'R'] as const) {
      const ear = rig.head.getObjectByName(`catEar${side}`) as THREE.Mesh;
      const inner = rig.head.getObjectByName(`catInnerEar${side}`) as THREE.Mesh;
      assert.ok(ear && inner, `${variant.id} thiếu tai ${side}`);
      assert.equal((inner.material as THREE.MeshStandardMaterial).color.getHex(), CAT_INNER_EAR_COLOR);
      const earBox = worldBox(ear);
      assert.equal(earBox.intersectsBox(skullBox), true, `${variant.id} tai ${side} phải giao với đầu`);
      assert.ok(Math.abs(earBox.max.y - expectedHeight) < 0.01, `${variant.id} đỉnh tai lệch ${earBox.max.y}`);
    }

    let hasEyeGloss = false;
    let hasEyeShine = false;
    let hasLens = false;
    rig.root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material as THREE.MeshStandardMaterial;
      assert.equal(obj.receiveShadow, false, `${variant.id}: mèo không tự nhận bóng`);
      if (obj.name === 'catEyeShine' || obj.name === 'catWhisker' || obj.name === 'catGlassLens') {
        assert.equal(obj.castShadow, false);
      } else {
        assert.equal(obj.castShadow, true);
      }
      if (obj.name === 'catEye' && mat.roughness <= 0.2) hasEyeGloss = true;
      if (obj.name === 'catEyeShine' && mat.emissiveIntensity > 0) hasEyeShine = true;
      if (obj.name === 'catGlassLens' && mat.transparent) hasLens = true;
    });
    assert.ok(hasEyeGloss && hasEyeShine, `${variant.id} mắt phải bóng và có điểm sáng`);
    if (variant.accessory === 'glasses') assert.ok(hasLens, `${variant.id} kính phải có tròng glass`);
  }
}

// Tự kiểm tra GĐ8a Tab 3: vật liệu PBR, bóng đổ mèo/vật cầm/sao choáng, chiều cao rig & hitbox và tai 6 biến thể
export function runSelfCheck8Worldc(): void {
  // 1. Chiều cao rig & tai giao đầu cho cả 6 biến thể (khách 1.56, nhân viên 1.32)
  checkVariantsAndEars(1, 1.56, 'customer');
  checkVariantsAndEars(1.32 / CAT_BASE_HEIGHT, 1.32, 'staff');

  // 2. Khách hàng & nhân viên: khớp hitbox 1.56 / 1.32 và vật liệu MeshStandardMaterial
  const customer = createCustomerActor();
  customer.spawnAt([{ x: 0, z: 0 }], () => {});
  assert.equal(customer.hitbox?.maxY, 1.56);
  assertStandardMaterials(customer.root, 'customerActor');

  for (const cand of [STAFF_CANDIDATES[0], STAFF_CANDIDATES[1]]) {
    const staff = createStaffActor({ ...cand }, [], 0, 0);
    assert.equal(staff.hitbox?.maxY, 1.32);
    assertStandardMaterials(staff.root, `staff:${cand.id}`);
  }

  // 3. Player avatar: mặc định ẩn, thân dùng MeshStandardMaterial và bật castShadow
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 50);
  scene.add(camera);
  const avatar = createPlayerAvatar(scene, camera);
  const avatarRoot = scene.getObjectByName('playerCatAvatar')!;
  assert.equal(avatarRoot.visible, false);
  avatar.setVisibleToSelf(true);
  assertStandardMaterials(avatarRoot, 'playerAvatar');
  avatar.dispose();

  // 4. Vật cầm & vật bay: ly nhựa trong + nắp + ống hút, chổi gỗ + sợi, cây lau gỗ + vải, vật bay castShadow
  const cup = createHeldMesh('cup');
  assertStandardMaterials(cup, 'heldCup');
  const cupShell = cup.getObjectByName('cupShell') as THREE.Mesh;
  assert.equal((cupShell.material as THREE.MeshStandardMaterial).transparent, true);
  assert.ok(cup.getObjectByName('cupLid'));

  const unsealedCup = createEmptyCup();
  const projUnsealed = createProjectileVisual('cup', unsealedCup);
  assert.equal(projUnsealed.inner.getObjectByName('cupLid')?.visible, false);
  assert.equal(projUnsealed.inner.getObjectByName('cupLiquid')?.visible, false);

  const sealedCup = { ...createEmptyCup(), base: 'matcha' as const, topping: 'pearl' as const, sealed: true };
  const projSealed = createProjectileVisual('cup', sealedCup);
  assert.equal(projSealed.inner.getObjectByName('cupLid')?.visible, true);
  assert.equal(projSealed.inner.getObjectByName('cupLiquid')?.visible, true);
  projSealed.root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) assert.equal(obj.castShadow, true);
  });

  for (const tool of ['broom', 'mop'] as const) {
    const proj = createProjectileVisual(tool);
    assertStandardMaterials(proj.root, `proj:${tool}`);
    proj.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) assert.equal(obj.castShadow, true);
    });
  }

  // 5. Viewmodel: không cast/receive shadow, có emissive nhẹ để không bị tối
  const store = createGameStore();
  const bus = createEventBus<GameEvents>();
  const mockCtx = {
    scene,
    camera,
    eventBus: bus,
    gameStore: store,
    registerTick: () => () => {},
  } as unknown as GameCtx;
  initHandViewmodel(mockCtx);
  const hands = store.getState().hands;
  hands.right = { kind: 'cup', cup: sealedCup };
  hands.left = { kind: 'mop' };
  store.updateState({ hands });
  bus.emit('state:changed', store.getState());
  for (const name of ['catHand_right', 'catHand_left']) {
    const hand = camera.getObjectByName(name)!;
    assertStandardMaterials(hand, name);
    hand.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        assert.equal(obj.castShadow, false);
        assert.equal(obj.receiveShadow, false);
        assert.ok((obj.material as THREE.MeshStandardMaterial).emissiveIntensity > 0);
      }
    });
  }

  // 6. Sao choáng: emissive nhẹ, không đổ/nhận bóng
  const stunRoot = new THREE.Group();
  const fallAnim = createFallAnimation(stunRoot, 1.2);
  fallAnim.trigger(2.0);
  fallAnim.update(0.1);
  assertStandardMaterials(stunRoot, 'stunStars');
  stunRoot.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      assert.equal(obj.castShadow, false);
      assert.equal(obj.receiveShadow, false);
      assert.ok((obj.material as THREE.MeshStandardMaterial).emissiveIntensity > 0);
    }
  });
}
