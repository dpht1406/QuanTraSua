import * as THREE from 'three';
import { PALETTE } from '../styles/palette.ts';
import {
  computeFallDurations,
  computeFallHitbox,
  fallPose,
  resolveFallDir,
  timeForDownTilt,
  type FallDir,
  type FallPoseResult,
} from './fallPose.ts';
import { makeBox } from './furniture.ts';
import type { Aabb3D } from './shopWorld.ts';

export { fallPose, resolveFallDir, computeFallHitbox, type FallDir, type FallPoseResult };

const UP = new THREE.Vector3(0, 1, 0);
const STAR_COLORS = [PALETTE.syrupPeach, PALETTE.creamTrim, PALETTE.syrupPeach, PALETTE.creamTrim];

function buildStunStars(): THREE.Group {
  const group = new THREE.Group();
  const radius = 0.24;
  for (let i = 0; i < STAR_COLORS.length; i++) {
    const angle = (i / STAR_COLORS.length) * Math.PI * 2;
    const star = makeBox(0.075, 0.075, 0.075, STAR_COLORS[i], Math.cos(angle) * radius, 0, Math.sin(angle) * radius, 0.008);
    star.rotation.set(Math.PI / 4, angle, Math.PI / 4);
    star.castShadow = false;
    star.receiveShadow = false;
    star.raycast = () => {};
    group.add(star);
  }
  return group;
}

export interface FallAnimation {
  trigger(dur: number, hitDir?: FallDir, currentYaw?: number): void;
  update(dt: number): boolean;
  reset(): void;
  isActive(): boolean;
  getHitbox(x: number, z: number, halfW: number, height: number): Aabb3D;
}

// Tạo bộ điều khiển hoạt ảnh ngã trên nhóm gốc kèm vòng sao choáng trên đầu
export function createFallAnimation(root: THREE.Group, headY = 1.2): FallAnimation {
  const stars = buildStunStars();
  const qYaw = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const qInvRoot = new THREE.Quaternion();
  const qSpin = new THREE.Quaternion();
  const axisVec = new THREE.Vector3();
  const starOffset = new THREE.Vector3();

  let active = false;
  let elapsed = 0;
  let duration = 0;
  let baseYaw = 0;
  let fallDir: FallDir = { x: 0, z: -1 };
  let lastPose: FallPoseResult = { tiltRad: 0, dropY: 0, phase: 'done' };
  let starSpin = 0;

  const applyPose = (pose: FallPoseResult) => {
    qYaw.setFromAxisAngle(UP, baseYaw);
    axisVec.set(fallDir.z, 0, -fallDir.x);
    qTilt.setFromAxisAngle(axisVec, pose.tiltRad);
    root.quaternion.multiplyQuaternions(qTilt, qYaw);
    root.position.y = pose.dropY;

    if (pose.phase === 'down' || pose.phase === 'lie') {
      if (stars.parent !== root) root.add(stars);
      qInvRoot.copy(root.quaternion).invert();
      starOffset.set(0, 0.34, 0).applyQuaternion(qInvRoot);
      stars.position.set(0, headY, 0).add(starOffset);
      qSpin.setFromAxisAngle(UP, starSpin);
      stars.quaternion.multiplyQuaternions(qInvRoot, qSpin);
    } else {
      stars.removeFromParent();
    }
  };

  const reset = () => {
    stars.removeFromParent();
    if (active) {
      root.rotation.set(0, baseYaw, 0);
      root.position.y = 0;
    }
    active = false;
    elapsed = 0;
    duration = 0;
    lastPose = { tiltRad: 0, dropY: 0, phase: 'done' };
  };

  return {
    trigger(dur, hitDir, currentYaw = root.rotation.y) {
      if (dur <= 0) return;
      if (!active) {
        active = true;
        elapsed = 0;
        duration = dur;
        baseYaw = currentYaw;
        fallDir = resolveFallDir(hitDir, baseYaw);
      } else if (lastPose.phase === 'lie') {
        elapsed = computeFallDurations(dur).downSec;
        duration = elapsed + dur;
      } else if (lastPose.phase === 'down') {
        duration = elapsed + dur;
      } else {
        if (lastPose.tiltRad < 0.25) fallDir = resolveFallDir(hitDir, baseYaw);
        elapsed = timeForDownTilt(lastPose.tiltRad, dur);
        duration = elapsed + dur;
      }
      lastPose = fallPose(elapsed, duration);
      applyPose(lastPose);
    },

    update(dt) {
      if (!active) return false;
      elapsed += dt;
      starSpin += dt * 4.2;
      lastPose = fallPose(elapsed, duration);
      if (lastPose.phase === 'done') {
        reset();
        return false;
      }
      applyPose(lastPose);
      return true;
    },

    reset,
    isActive: () => active,

    getHitbox(x, z, halfW, height) {
      if (!active) {
        return { minX: x - halfW, maxX: x + halfW, minY: 0, maxY: height, minZ: z - halfW, maxZ: z + halfW };
      }
      return computeFallHitbox(x, z, halfW, height, lastPose.tiltRad, lastPose.dropY, fallDir);
    },
  };
}
