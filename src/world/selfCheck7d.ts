import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { GameCtx } from '../gameplay/gameCtx.ts';
import { getCatVariant } from '../state/catVariants.ts';
import { createEventBus } from '../state/eventBus.ts';
import { createGameStore, type GameEvents } from '../state/gameState.ts';
import { createEmptyCup } from '../state/scoring.ts';
import { initHandViewmodel, setHandSwing } from './handViewmodel.ts';
import { createPlayerAvatar } from './playerAvatar.ts';

// Tự kiểm tra GĐ7 Tab 4: bàn tay mèo ở viewmodel và thân mèo của người chơi
export function runSelfCheck7d(): void {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 50);
  camera.position.set(1, 1.65, 2);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = Math.PI * 0.25;
  scene.add(camera);

  // 1. Kiểm tra playerAvatar: mặc định ẩn, lùi nhẹ sau camera, walk/idle, ẩn đầu khi bật tự xem
  const avatar = createPlayerAvatar(scene, camera);
  const avatarRoot = scene.getObjectByName('playerCatAvatar');
  assert.ok(avatarRoot instanceof THREE.Group);
  assert.equal(avatarRoot.visible, false);

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  assert.ok(Math.abs(avatarRoot.position.x - (camera.position.x - forward.x * 0.18)) < 1e-6);
  assert.ok(Math.abs(avatarRoot.position.z - (camera.position.z - forward.z * 0.18)) < 1e-6);
  assert.equal(avatarRoot.position.y, 0);

  avatar.setVisibleToSelf(true);
  assert.equal(avatarRoot.visible, true);
  // Khi bật xem thân mèo thì ẩn riêng cụm đầu để không che camera góc nhìn thứ nhất
  const hiddenChildren = avatarRoot.children.filter((c) => !c.visible);
  assert.equal(hiddenChildren.length, 1);

  avatar.update(0.05);
  const legIdleL = avatarRoot.children[1].rotation.x;
  assert.equal(legIdleL, 0);

  camera.position.z -= 0.34;
  avatar.update(0.1);
  const legWalkL = avatarRoot.children[1].rotation.x;
  const legWalkR = avatarRoot.children[2].rotation.x;
  assert.ok(Math.abs(legWalkL) > 0.05);
  assert.ok(Math.abs(legWalkL + legWalkR) < 1e-6);

  // Nhìn thẳng xuống không làm yaw nhảy về 0
  const yawBeforeLookDown = avatarRoot.rotation.y;
  camera.rotation.x = -Math.PI / 2;
  avatar.update(0.05);
  assert.ok(Math.abs(avatarRoot.rotation.y - yawBeforeLookDown) < 1e-5);

  avatar.setVisibleToSelf(false);
  assert.equal(avatarRoot.visible, false);

  avatar.dispose();
  assert.equal(scene.getObjectByName('playerCatAvatar'), undefined);

  // 2. Kiểm tra handViewmodel: tay mèo xám có tay áo + cẳng tay + bàn tay, vật gắn lòng bàn tay, swing giữ nguyên
  const store = createGameStore();
  const bus = createEventBus<GameEvents>();
  const ticks = new Set<(dt: number) => void>();
  const mockCtx = {
    scene,
    camera,
    eventBus: bus,
    gameStore: store,
    registerTick(fn: (dt: number) => void) {
      ticks.add(fn);
      return () => ticks.delete(fn);
    },
  } as unknown as GameCtx;

  initHandViewmodel(mockCtx);
  const gray = getCatVariant('gray');
  const hands = store.getState().hands;
  hands.right = { kind: 'cup', cup: createEmptyCup() };
  hands.left = { kind: 'broom' };
  store.updateState({ hands });
  bus.emit('state:changed', store.getState());

  const rightHand = camera.getObjectByName('catHand_right');
  const leftHand = camera.getObjectByName('catHand_left');
  assert.ok(rightHand instanceof THREE.Group);
  assert.ok(leftHand instanceof THREE.Group);

  const rightAnchor = rightHand.getObjectByName('palmAnchor');
  const leftAnchor = leftHand.getObjectByName('palmAnchor');
  assert.ok(rightAnchor && rightAnchor.children.length === 1);
  assert.ok(leftAnchor && leftAnchor.children.length === 1);

  const colors = new Set<number>();
  rightHand.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.name !== '__outline') {
      assert.equal(obj.castShadow, false);
      const mat = obj.material as THREE.MeshStandardMaterial;
      if (mat.color) colors.add(mat.color.getHex());
    }
  });
  assert.ok(colors.has(gray.furColor));
  assert.ok(colors.has(gray.outfitColor));

  const rightSlot = rightHand.parent!;
  const baseRx = rightSlot.rotation.x;
  setHandSwing('right', true);
  for (const tick of ticks) tick(0.05);
  assert.ok(rightSlot.rotation.x !== baseRx);
  setHandSwing('right', false);
  for (let i = 0; i < 20; i++) {
    for (const tick of ticks) tick(0.05);
  }
  assert.ok(Math.abs(rightSlot.rotation.x - baseRx) < 1e-3);

  // Chuyển từ chổi sang cây lau vẫn gắn đúng vào lòng bàn tay
  hands.left = { kind: 'mop' };
  store.updateState({ hands });
  bus.emit('state:changed', store.getState());
  const mopHand = camera.getObjectByName('catHand_left');
  assert.ok(mopHand?.getObjectByName('palmAnchor')?.children.length === 1);

  hands.right = null;
  hands.left = null;
  store.updateState({ hands });
  bus.emit('state:changed', store.getState());
  assert.equal(camera.getObjectByName('catHand_right'), undefined);
  assert.equal(camera.getObjectByName('catHand_left'), undefined);
}
