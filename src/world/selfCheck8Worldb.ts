import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { GameCtx } from '../gameplay/gameCtx.ts';
import { createInteractionSystem } from '../interaction/interactionSystem.ts';
import { createCleanlinessStore } from '../state/cleanliness.ts';
import { TRASH_FULL_CUPS } from '../state/constants.ts';
import {
  CEILING_LAMP_COLOR,
  CEILING_LAMP_POSITIONS,
  OUTLINE_ENABLED,
} from '../state/constantsGraphics.ts';
import { createCleanlinessView } from './cleanlinessView.ts';
import { createShopWorld } from './shopWorld.ts';
import {
  disposeTextures,
  getTileTexture,
  getWallTexture,
  getWoodFloorTexture,
  getWoodTableTexture,
} from './textures.ts';
import { createToolRack } from './toolRack.ts';

function assertStandardMaterialsOnly(root: THREE.Object3D, skip?: (obj: THREE.Object3D) => boolean): void {
  root.traverse((obj) => {
    if (skip?.(obj)) return;
    if (!(obj instanceof THREE.Mesh)) return;
    assert.ok(OUTLINE_ENABLED || obj.name !== '__outline', 'Không được sinh __outline khi tắt');
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      assert.ok(m instanceof THREE.MeshStandardMaterial, `Mesh ${obj.name || '(unnamed)'} phải dùng MeshStandardMaterial`);
      assert.equal(m instanceof THREE.MeshToonMaterial, false);
    }
  });
}

function checkShopWorldMaterialsAndShadows(): void {
  const world = createShopWorld(() => {});
  assertStandardMaterialsOnly(world.root);

  const floor = world.root.getObjectByName('shopFloor') as THREE.Mesh;
  const tile = world.root.getObjectByName('shopCounterTile') as THREE.Mesh;
  const ceiling = world.root.getObjectByName('shopCeiling') as THREE.Mesh;
  assert.ok(floor && tile && ceiling);
  assert.equal(floor.castShadow, false);
  assert.equal(floor.receiveShadow, true);
  assert.equal(tile.castShadow, false);
  assert.equal(tile.receiveShadow, true);
  assert.equal(ceiling.castShadow, false);
  assert.equal(ceiling.receiveShadow, false);

  const walls: THREE.Mesh[] = [];
  const windows: THREE.Mesh[] = [];
  const globes: THREE.Mesh[] = [];
  world.root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.name === 'shopWall') walls.push(obj);
    else if (obj.name === 'shopWindowGlass') windows.push(obj);
    else if (obj.name === 'ceilingLampGlobe') globes.push(obj);
  });

  assert.equal(walls.length, 6);
  for (const w of walls) {
    assert.equal(w.castShadow, false);
    assert.equal(w.receiveShadow, true);
  }

  assert.equal(windows.length, 2);
  for (const win of windows) {
    assert.equal((win.material as THREE.MeshStandardMaterial).transparent, true);
    assert.equal(win.castShadow, false);
    assert.equal(win.receiveShadow, false);
  }

  // Đèn trần khớp vị trí X/Z với CEILING_LAMP_POSITIONS và phát sáng emissive
  assert.equal(globes.length, CEILING_LAMP_POSITIONS.length);
  CEILING_LAMP_POSITIONS.forEach(([lx, ly, lz], idx) => {
    const g = globes[idx];
    assert.ok(Math.abs(g.position.x - lx) < 1e-6);
    assert.ok(Math.abs(g.position.z - lz) < 1e-6);
    assert.ok(g.position.y > ly && g.position.y < 3.4);
    const mat = g.material as THREE.MeshStandardMaterial;
    assert.equal(mat.emissive.getHex(), CEILING_LAMP_COLOR);
    assert.ok(mat.emissiveIntensity > 0);
    assert.equal(g.castShadow, false);
    assert.equal(g.receiveShadow, false);
  });

  // Quầy và bàn ghế đổ + nhận bóng
  for (const furnitureRoot of [world.stations.counter, ...world.tables]) {
    furnitureRoot.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        assert.equal(obj.castShadow, true);
        assert.equal(obj.receiveShadow, true);
      }
    });
  }
}

function checkCleanlinessViewAndToolRack(): void {
  const world = createShopWorld(() => {});
  const cleanliness = createCleanlinessStore(undefined, { rng: () => 0 });
  const spill = cleanliness.spawnFloorStain('spill');
  const trash = cleanliness.spawnFloorStain('trash');
  cleanliness.dirtyRandomTable();
  for (let i = 0; i < TRASH_FULL_CUPS; i++) cleanliness.recordTrashCup();
  assert.ok(spill && trash);

  const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 20);
  const interaction = createInteractionSystem(cam, [], () => {});
  const childrenBefore = world.root.children.length;
  const expectedFloorStains = cleanliness
    .getStains()
    .filter((s) => s.kind === 'spill' || s.kind === 'trash').length;
  const view = createCleanlinessView(world, cleanliness, interaction, () => {});
  assert.equal(world.root.children.length, childrenBefore + expectedFloorStains);
  assertStandardMaterialsOnly(world.root);

  const spillGroup = world.root.children[childrenBefore];
  const trashGroup = world.root.children[childrenBefore + 1];
  const spillMain = spillGroup.children[0] as THREE.Mesh;
  const trashMain = trashGroup.children[0] as THREE.Mesh;
  assert.equal(spillMain.receiveShadow, false);
  assert.equal(trashMain.receiveShadow, false);
  assert.ok(
    (spillMain.material as THREE.MeshStandardMaterial).roughness <
      (trashMain.material as THREE.MeshStandardMaterial).roughness,
    'Vết đổ phải bóng hơn rác',
  );
  // Nâng cao hơn đỉnh thảm (0.010) để tránh z-fighting
  const spillHalfH = (spillMain.geometry as THREE.BoxGeometry).parameters.height * 0.5;
  assert.ok(spillMain.position.y - spillHalfH > 0.01);

  const dirtyTableOverlay = world.tables[cleanliness.getDirtyTableIndices()[0]].children.at(-1);
  const trashOverflow = world.stations.trashCan.children.at(-1);
  assert.equal(dirtyTableOverlay?.visible, true);
  assert.equal(trashOverflow?.visible, true);

  view.dispose();
  assert.equal(world.root.children.length, childrenBefore);

  // Kiểm tra toolRack (không ép heldMeshes nếu tab khác phụ trách)
  const scene = new THREE.Scene();
  const colliders: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
  const fakeCtx = { scene, colliders, interaction } as unknown as GameCtx;
  const rack = createToolRack(fakeCtx, {
    getSlotLabel: (k) => k,
    onSlotInteract: () => {},
  });
  assert.equal(colliders.length, 1);
  const rackOwnParts = rack.root.children.slice(0, 3);
  for (const part of rackOwnParts) assertStandardMaterialsOnly(part);
  rack.sync({ broom: 'hand', mop: 'rack' });
  assert.equal(rack.root.children[3].visible, false);
  assert.equal(rack.root.children[4].visible, true);
  rack.dispose();
  assert.equal(colliders.length, 0);
  assert.equal(scene.children.length, 0);
}

function checkTexturesSafe(): void {
  if (typeof document === 'undefined') {
    assert.equal(getWoodFloorTexture(), null);
    assert.equal(getTileTexture(), null);
    assert.equal(getWallTexture(), null);
    assert.equal(getWoodTableTexture(), null);
    disposeTextures();
    return;
  }
  const f1 = getWoodFloorTexture();
  const f2 = getWoodFloorTexture();
  assert.ok(f1 && f1 === f2);
  assert.equal(f1.colorSpace, THREE.SRGBColorSpace);
  assert.equal(f1.wrapS, THREE.RepeatWrapping);
  assert.equal(f1.wrapT, THREE.RepeatWrapping);
  assert.ok(getTileTexture() && getWallTexture() && getWoodTableTexture());
  disposeTextures();
}

// Tự kiểm tra 3D phần quán, vật liệu, bóng đổ, đèn trần, vết bẩn và texture GĐ8a
export function runSelfCheck8Worldb(): void {
  checkShopWorldMaterialsAndShadows();
  checkCleanlinessViewAndToolRack();
  checkTexturesSafe();
}
