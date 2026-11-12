import * as THREE from 'three';
import { pickVariant, type CatVariantId } from '../state/catVariants.ts';
import { PEDESTRIAN_MAX_BY_QUALITY } from '../state/constantsStreet.ts';
import { parseGraphicsQuality, type GraphicsQuality } from '../state/graphicsQuality.ts';
import {
  createPedestrianMotion,
  stepPedestrianMotion,
  type PedestrianMotionState,
} from '../state/pedestrianMotion.ts';
import { markShadow } from '../styles/materials.ts';
import { animateCat, createCat, type CatRig } from './catModel.ts';

export interface Pedestrian {
  id: string;
  root: THREE.Group;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  variantId: CatVariantId;
}

export interface PedestriansController {
  update(dt: number): void;
  setQuality(q: GraphicsQuality): void;
  getPedestrians(): Pedestrian[];
  dispose(): void;
}

interface PooledPedestrian {
  motion: PedestrianMotionState;
  rig: CatRig;
  pedestrian: Pedestrian;
}

const POOL_SIZE = PEDESTRIAN_MAX_BY_QUALITY.high;
const VARIANT_SLOTS = [0, 1, 3, 2, 4, 5] as const;
const PEDESTRIAN_SEED = 1;
const INITIAL_SPREAD_SEC = 2.4;

function setCatCastShadow(root: THREE.Object3D, castShadow: boolean): void {
  markShadow(root, castShadow, false);
  if (!castShadow) return;
  root.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh &&
      (obj.name === 'catEyeShine' || obj.name === 'catWhisker' || obj.name === 'catGlassLens')
    ) {
      obj.castShadow = false;
    }
  });
}

function syncEntry(entry: PooledPedestrian): void {
  const { motion, rig, pedestrian } = entry;
  rig.root.position.set(motion.x, 0, motion.z);
  rig.root.rotation.y = motion.yaw;
  pedestrian.position.x = motion.x;
  pedestrian.position.y = 0;
  pedestrian.position.z = motion.z;
  pedestrian.velocity.x = motion.vx;
  pedestrian.velocity.y = 0;
  pedestrian.velocity.z = motion.vz;
  animateCat(rig, 'walk', motion.walkTime, motion.speed);
}

// Tạo pool người đi đường mèo chibi đi bộ trên vỉa hè và băng qua vạch kẻ đường (không có thân vật lý ở GĐ9a)
export function createPedestrians(
  scene: THREE.Scene,
  quality: GraphicsQuality,
): PedestriansController {
  const group = new THREE.Group();
  group.name = 'streetPedestrians';
  scene.add(group);

  let currentQuality = parseGraphicsQuality(quality);
  let activeCount: number = PEDESTRIAN_MAX_BY_QUALITY[currentQuality];
  let disposed = false;

  const pool: PooledPedestrian[] = [];
  const castInitial = currentQuality === 'high';

  for (let slot = 0; slot < POOL_SIZE; slot++) {
    const variant = pickVariant(VARIANT_SLOTS[slot % VARIANT_SLOTS.length]);
    const motion = createPedestrianMotion(slot, PEDESTRIAN_SEED, slot * INITIAL_SPREAD_SEC);
    const rig = createCat(variant.id, { castShadow: castInitial });
    rig.root.name = `pedestrian_${slot}`;
    rig.root.visible = slot < activeCount;

    const entry: PooledPedestrian = {
      motion,
      rig,
      pedestrian: {
        id: `pedestrian-${slot}`,
        root: rig.root,
        position: { x: motion.x, y: 0, z: motion.z },
        velocity: { x: motion.vx, y: 0, z: motion.vz },
        variantId: variant.id,
      },
    };
    syncEntry(entry);
    group.add(rig.root);
    pool.push(entry);
  }

  const applyQuality = (q: GraphicsQuality) => {
    currentQuality = parseGraphicsQuality(q);
    activeCount = PEDESTRIAN_MAX_BY_QUALITY[currentQuality];
    const cast = currentQuality === 'high';
    for (let i = 0; i < pool.length; i++) {
      const entry = pool[i];
      entry.rig.root.visible = i < activeCount;
      setCatCastShadow(entry.rig.root, cast);
    }
  };

  return {
    update(dt) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return;
      for (let i = 0; i < activeCount && i < pool.length; i++) {
        const entry = pool[i];
        stepPedestrianMotion(entry.motion, dt, PEDESTRIAN_SEED);
        syncEntry(entry);
      }
    },

    setQuality(q) {
      if (disposed) return;
      applyQuality(q);
    },

    getPedestrians() {
      if (disposed) return [];
      return pool.slice(0, activeCount).map((entry) => entry.pedestrian);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      const disposedGeos = new Set<THREE.BufferGeometry>();
      for (const entry of pool) {
        entry.rig.root.traverse((obj) => {
          if (obj instanceof THREE.Mesh && !disposedGeos.has(obj.geometry)) {
            disposedGeos.add(obj.geometry);
            obj.geometry.dispose();
          }
        });
      }
      pool.length = 0;
    },
  };
}
