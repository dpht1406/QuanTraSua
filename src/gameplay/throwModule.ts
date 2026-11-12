import * as THREE from 'three';
import { onHandThrowKey } from '../core/handInput.ts';
import { CUP_HALF_HEIGHT } from '../physics/constantsPhysics.ts';
import { bindMesh, unbindMesh } from '../physics/physicsSync.ts';
import { createProjectileSim, type LandedProjectileItem } from '../physics/projectileSim.ts';
import {
  CUP_BREAK_POWER,
  DROP_POWER,
  MAX_CHARGE_SEC,
  THROW_UP_BOOST,
} from '../state/constantsThrow.ts';
import type { ThrowObjectKind } from '../state/gameState.ts';
import { getHeld, pickUp, removeFrom, type HandId, type HeldItem } from '../state/hands.ts';
import { createStaffHitTracker } from '../state/staffStun.ts';
import { getLocation, setLocation } from '../state/toolLocations.ts';
import { createThrowBar } from '../ui/throwBar.ts';
import { createProjectileVisual, setProjectileLandedPose, type ProjectileVisual } from '../world/projectileMeshes.ts';
import type { GameCtx, Phase6Module } from './gameCtx.ts';
import { applyThrowHitEvent, computeThrowPower, throwItemLabel } from './throwHitApply.ts';

// Khởi tạo module thả/ném vật bằng Rapier, đồng bộ mesh nội suy và hậu quả chạm mục tiêu
export function initThrowModule(ctx: GameCtx): Phase6Module {
  const throwBar = createThrowBar(ctx.app);
  const sim = createProjectileSim(ctx.physics);
  const hitTracker = createStaffHitTracker(ctx.gameStore.getState().day);
  const visuals = new Map<number, ProjectileVisual>();
  const dirVec = new THREE.Vector3();
  const rightVec = new THREE.Vector3();
  let charging: { hand: HandId; elapsed: number } | null = null;

  const isOverlayOpen = () =>
    ctx.app.querySelector(
      '.menu-overlay:not(.hidden), .panel-overlay:not(.hidden), .complaint-popup:not(.hidden), .level-picker:not(.hidden)',
    ) !== null;

  const cancelCharge = () => {
    if (!charging) return;
    charging = null;
    throwBar.setProgress(null);
  };

  const removeVisual = (id: number, unregister = false) => {
    const vis = visuals.get(id);
    if (!vis) return;
    unbindMesh(vis.root);
    if (unregister) ctx.interaction.unregister(vis.root);
    vis.root.removeFromParent();
    visuals.delete(id);
  };

  const returnToolToRack = (kind: ThrowObjectKind) => {
    if (kind !== 'broom' && kind !== 'mop') return;
    const { tools } = ctx.gameStore.getState();
    setLocation(tools, kind, 'rack');
    ctx.gameStore.updateState({ tools });
  };

  const registerLandedInteract = (landed: LandedProjectileItem, vis: ProjectileVisual) => {
    ctx.interaction.register({
      target: vis.root,
      label: throwItemLabel(landed.kind),
      onInteract() {
        const { hands, tools } = ctx.gameStore.getState();
        const held: HeldItem =
          landed.kind === 'cup' && landed.cup ? { kind: 'cup', cup: landed.cup } : { kind: landed.kind === 'broom' ? 'broom' : 'mop' };
        const res = pickUp(hands, held);
        if (!res.ok) {
          ctx.hud.showHint(res.reason === 'cup_limit' ? 'Chỉ cầm tối đa 1 ly!' : 'Tay đầy');
          return;
        }
        if (landed.kind === 'broom' || landed.kind === 'mop') setLocation(tools, landed.kind, 'hand');
        if (held.kind === 'cup') ctx.heldCupUi.render(held.cup);
        ctx.gameStore.updateState({ hands, tools });
        sim.removeLanded(landed.id);
        removeVisual(landed.id, true);
      },
    });
  };

  const launchFromHand = (hand: HandId, elapsed: number) => {
    const { hands, tools } = ctx.gameStore.getState();
    const item = removeFrom(hands, hand);
    if (!item) return;

    if (item.kind === 'broom' || item.kind === 'mop') setLocation(tools, item.kind, 'flying');
    if (item.kind === 'cup') ctx.heldCupUi.render(null);
    ctx.gameStore.updateState({ hands, tools });

    const { isTap, power } = computeThrowPower(elapsed);
    ctx.camera.getWorldDirection(dirVec);
    rightVec.crossVectors(dirVec, ctx.camera.up).normalize();
    const side = hand === 'right' ? 0.16 : -0.16;
    const origin = { x: ctx.camera.position.x, y: ctx.camera.position.y - 0.14, z: ctx.camera.position.z };
    const desired = { x: origin.x + dirVec.x * 0.36 + rightVec.x * side, y: origin.y + dirVec.y * 0.36, z: origin.z + dirVec.z * 0.36 + rightVec.z * side };
    const pos = sim.computeSafeSpawn(origin, desired, item.kind);
    const vel = isTap
      ? { x: dirVec.x * DROP_POWER, y: Math.min(0, dirVec.y * DROP_POWER) - 0.5, z: dirVec.z * DROP_POWER }
      : { x: dirVec.x * power, y: dirVec.y * power + THROW_UP_BOOST, z: dirVec.z * power };

    const yaw = Math.atan2(dirVec.x, dirVec.z);
    const { item: spawned, lost } = sim.spawn({ kind: item.kind, cup: item.kind === 'cup' ? item.cup : undefined, pos, vel, power, yaw });
    if (lost && lost.type === 'lost') {
      removeVisual(lost.id);
      returnToolToRack(lost.kind);
    }

    const vis = createProjectileVisual(item.kind, item.kind === 'cup' ? item.cup : undefined);
    ctx.shopWorld.root.add(vis.root);
    if (spawned.body) {
      bindMesh(spawned.body, vis.root, {
        offset: item.kind === 'cup' ? { x: 0, y: -(CUP_HALF_HEIGHT - 0.07), z: 0 } : undefined,
      });
    } else {
      vis.root.position.set(pos.x, pos.y, pos.z);
      vis.root.rotation.y = yaw;
    }
    visuals.set(spawned.id, vis);
  };

  onHandThrowKey((hand, phase) => {
    if (phase === 'down') {
      if (!ctx.player.isLocked() || isOverlayOpen() || charging || !getHeld(ctx.gameStore.getState().hands, hand)) {
        return;
      }
      charging = { hand, elapsed: 0 };
      throwBar.setProgress(0, `Thả / Ném ${hand === 'right' ? '[F]' : '[Q]'}`, false);
      return;
    }
    if (!charging || charging.hand !== hand) return;
    const elapsed = charging.elapsed;
    cancelCharge();
    if (ctx.player.isLocked() && !isOverlayOpen()) launchFromHand(hand, elapsed);
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== ctx.renderer.domElement) cancelCharge();
  });
  window.addEventListener('blur', cancelCharge);
  ctx.eventBus.on('state:changed', (s) => hitTracker.syncDay(s.day));

  const stepSim = (dt: number) => {
    const events = sim.step(dt, ctx.shopWorld.getShopBounds(), ctx.orderManager.hasCustomerAtCounter(), {
      customerTargetable: !ctx.customer.isLeaving,
    });
    for (const ev of events) {
      if (ev.type === 'hit') applyThrowHitEvent(ctx, ev, hitTracker, removeVisual);
      else if (ev.type === 'evictedLanded') {
        removeVisual(ev.item.id, true);
        returnToolToRack(ev.item.kind);
      } else if (ev.type === 'landed') {
        const vis = visuals.get(ev.item.id);
        if (vis) {
          if (!ev.item.body) setProjectileLandedPose(vis, ev.item.kind, ev.item.pos.x, ev.item.pos.y, ev.item.pos.z, ev.item.yaw);
          registerLandedInteract(ev.item, vis);
        }
        if (ev.item.kind === 'broom' || ev.item.kind === 'mop') {
          const { tools } = ctx.gameStore.getState();
          setLocation(tools, ev.item.kind, 'floor');
          ctx.gameStore.updateState({ tools });
        }
      } else if (ev.type === 'lost') {
        removeVisual(ev.id, true);
        returnToolToRack(ev.kind);
        if (ev.reason !== 'capacity' && (ev.kind === 'broom' || ev.kind === 'mop')) {
          ctx.hud.showHint(`${ev.kind === 'broom' ? 'Chổi' : 'Cây lau'} đã quay về giá!`);
        }
      }
    }
  };
  ctx.registerPostPhysicsTick?.(stepSim);

  return {
    update(dt) {
      hitTracker.syncDay(ctx.gameStore.getState().day);
      if (charging) {
        if (!ctx.player.isLocked() || isOverlayOpen()) cancelCharge();
        else {
          charging.elapsed += dt;
          const held = getHeld(ctx.gameStore.getState().hands, charging.hand);
          const { power } = computeThrowPower(charging.elapsed);
          const ratio = Math.min(1, charging.elapsed / MAX_CHARGE_SEC);
          throwBar.setProgress(ratio, `Thả / Ném ${charging.hand === 'right' ? '[F]' : '[Q]'}`, held?.kind === 'cup' && power > CUP_BREAK_POWER);
        }
      }
      if (!ctx.registerPostPhysicsTick) stepSim(dt);
    },

    reset() {
      cancelCharge();
      const cleared = sim.clearAll();
      for (const f of cleared.flying) removeVisual(f.id);
      for (const l of cleared.landed) removeVisual(l.id, true);
      const { tools } = ctx.gameStore.getState();
      let changed = false;
      for (const kind of ['broom', 'mop'] as const) {
        const loc = getLocation(tools, kind);
        if (loc === 'flying' || loc === 'floor') {
          setLocation(tools, kind, 'rack');
          changed = true;
        }
      }
      if (changed) ctx.gameStore.updateState({ tools });
      ctx.staffManager.clearStuns();
      ctx.customer.clearFall();
      hitTracker.syncDay(ctx.gameStore.getState().day);
    },
  };
}
