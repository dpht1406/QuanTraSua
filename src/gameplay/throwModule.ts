import * as THREE from 'three';
import { onHandThrowKey } from '../core/handInput.ts';
import {
  CUP_BREAK_POWER,
  DROP_POWER,
  MAX_CHARGE_SEC,
  MAX_THROW_POWER,
  MIN_THROW_POWER,
  TAP_SEC,
  THROW_UP_BOOST,
} from '../state/constantsThrow.ts';
import type { GameEventReason, ThrowObjectKind } from '../state/gameState.ts';
import { getHeld, pickUp, removeFrom, type HandId, type HeldItem } from '../state/hands.ts';
import { clampReputation } from '../state/reputation.ts';
import { createStaffHitTracker } from '../state/staffStun.ts';
import { getLocation, setLocation } from '../state/toolLocations.ts';
import { createThrowBar } from '../ui/throwBar.ts';
import { createProjectileVisual, setProjectileLandedPose, type ProjectileVisual } from '../world/projectileMeshes.ts';
import { discardCupInBin } from './cupDisposal.ts';
import type { GameCtx, Phase6Module } from './gameCtx.ts';
import { computeSafeSpawn, createProjectileWorld, type ActorHitbox, type LandedProjectile, type PhysicsEvent } from './projectilePhysics.ts';

function itemLabel(kind: ThrowObjectKind): string {
  return kind === 'cup' ? 'Nhặt ly' : kind === 'broom' ? 'Nhặt chổi' : 'Nhặt cây lau';
}

function computePower(elapsed: number): { isTap: boolean; power: number } {
  if (elapsed < TAP_SEC) return { isTap: true, power: DROP_POWER };
  const ratio = Math.min(1, (elapsed - TAP_SEC) / Math.max(0.01, MAX_CHARGE_SEC - TAP_SEC));
  return { isTap: false, power: MIN_THROW_POWER + ratio * (MAX_THROW_POWER - MIN_THROW_POWER) };
}

// Khởi tạo module thả/ném vật, vật lý bay và hậu quả chạm mục tiêu
export function initThrowModule(ctx: GameCtx): Phase6Module {
  const throwBar = createThrowBar(ctx.app);
  const physics = createProjectileWorld();
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

  const registerLandedInteract = (landed: LandedProjectile, vis: ProjectileVisual) => {
    ctx.interaction.register({
      target: vis.root,
      label: itemLabel(landed.kind),
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
        physics.removeLanded(landed.id);
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

    const { isTap, power } = computePower(elapsed);
    ctx.camera.getWorldDirection(dirVec);
    rightVec.crossVectors(dirVec, ctx.camera.up).normalize();
    const side = hand === 'right' ? 0.16 : -0.16;
    const origin = { x: ctx.camera.position.x, y: ctx.camera.position.y - 0.14, z: ctx.camera.position.z };
    const desired = { x: origin.x + dirVec.x * 0.36 + rightVec.x * side, y: origin.y + dirVec.y * 0.36, z: origin.z + dirVec.z * 0.36 + rightVec.z * side };
    const pos = computeSafeSpawn(origin, desired, item.kind, ctx.shopWorld.getThrowSurfaces());
    const vel = isTap
      ? { x: dirVec.x * DROP_POWER, y: Math.min(0, dirVec.y * DROP_POWER) - 0.5, z: dirVec.z * DROP_POWER }
      : { x: dirVec.x * power, y: dirVec.y * power + THROW_UP_BOOST, z: dirVec.z * power };

    const yaw = Math.atan2(dirVec.x, dirVec.z);
    const { item: spawned, lost } = physics.spawn({ kind: item.kind, cup: item.kind === 'cup' ? item.cup : undefined, pos, vel, power, yaw });
    if (lost && lost.type === 'lost') {
      removeVisual(lost.id);
      returnToolToRack(lost.kind);
    }

    const vis = createProjectileVisual(item.kind, item.kind === 'cup' ? item.cup : undefined);
    vis.root.position.set(pos.x, pos.y, pos.z);
    vis.root.rotation.y = yaw;
    ctx.shopWorld.root.add(vis.root);
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

  const applyHitEvent = (ev: Extract<PhysicsEvent, { type: 'hit' }>) => {
    ctx.eventBus.emit('objectThrown', { kind: ev.item.kind, hit: ev.target });
    const res = ev.consequence;
    const hitVel = ev.hitVel ?? ev.item.vel;
    const hitDir = { x: hitVel.x, z: hitVel.z };
    if (res.customerLeaves) ctx.orderManager.forceCustomerLeave('bi_nem', hitDir);

    if (res.reputationDelta !== 0) {
      const reason: GameEventReason = ev.target === 'customer' ? 'bi_nem' : 'nhan_vien_choang';
      const prev = ctx.gameStore.getState().reputation;
      const next = clampReputation(prev + res.reputationDelta);
      ctx.gameStore.updateState({ reputation: next });
      if (next !== prev) ctx.eventBus.emit('reputationChanged', { value: next, delta: next - prev, reason });
    }

    if (res.spawnSpill) {
      ctx.cleanliness.spawnFloorStain('spill');
      ctx.cleanlinessView.sync();
    }
    if (res.binDiscard && ev.item.cup) discardCupInBin(ev.item.cup);

    if (res.staffStunSec > 0 && ev.staffRole && ev.staffId) {
      ctx.staffManager.stunStaff(ev.staffRole, res.staffStunSec, hitDir);
      const out = hitTracker.recordHit(ev.staffId, ctx.staffStore, ctx.eventBus);
      ctx.hud.showHint(out.fired && out.staff ? `${out.staff.name} tự nghỉ vì bị ném quá nhiều lần!` : 'Nhân viên bị choáng!');
    }

    if (res.broken || res.binDiscard) removeVisual(ev.item.id);
    if (ev.target === 'customer') ctx.hud.showHint('Khách giận bỏ đi vì bị ném!');
    else if (res.broken && ev.item.kind === 'cup') ctx.hud.showHint('Ly bị vỡ đổ ra sàn!');
  };

  return {
    update(dt) {
      hitTracker.syncDay(ctx.gameStore.getState().day);
      if (charging) {
        if (!ctx.player.isLocked() || isOverlayOpen()) cancelCharge();
        else {
          charging.elapsed += dt;
          const held = getHeld(ctx.gameStore.getState().hands, charging.hand);
          const { power } = computePower(charging.elapsed);
          const ratio = Math.min(1, charging.elapsed / MAX_CHARGE_SEC);
          throwBar.setProgress(ratio, `Thả / Ném ${charging.hand === 'right' ? '[F]' : '[Q]'}`, held?.kind === 'cup' && power > CUP_BREAK_POWER);
        }
      }

      const actors: ActorHitbox[] = [];
      if (ctx.customer.hitbox && !ctx.customer.isLeaving) actors.push({ id: 'customer', target: 'customer', aabb: ctx.customer.hitbox });
      for (const staff of ctx.staffManager.getActors()) {
        if (staff.hitbox) actors.push({ id: staff.member.id, target: 'staff', aabb: staff.hitbox, staffRole: staff.member.role });
      }

      const events = physics.step(dt, ctx.shopWorld.getThrowSurfaces(), ctx.shopWorld.getShopBounds(), actors, ctx.orderManager.hasCustomerAtCounter());
      for (const ev of events) {
        if (ev.type === 'hit') applyHitEvent(ev);
        else if (ev.type === 'evictedLanded') {
          removeVisual(ev.item.id, true);
          returnToolToRack(ev.item.kind);
        } else if (ev.type === 'landed') {
          const vis = visuals.get(ev.item.id);
          if (vis) {
            setProjectileLandedPose(vis, ev.item.kind, ev.item.pos.x, ev.item.pos.y, ev.item.pos.z, ev.item.yaw);
            registerLandedInteract(ev.item, vis);
          }
          if (ev.item.kind === 'broom' || ev.item.kind === 'mop') {
            const { tools } = ctx.gameStore.getState();
            setLocation(tools, ev.item.kind, 'floor');
            ctx.gameStore.updateState({ tools });
          }
        } else if (ev.type === 'lost') {
          removeVisual(ev.id);
          returnToolToRack(ev.kind);
          if (ev.reason !== 'capacity' && (ev.kind === 'broom' || ev.kind === 'mop')) {
            ctx.hud.showHint(`${ev.kind === 'broom' ? 'Chổi' : 'Cây lau'} đã quay về giá!`);
          }
        }
      }

      for (const f of physics.getFlying()) {
        const vis = visuals.get(f.id);
        if (!vis) continue;
        vis.root.position.set(f.pos.x, f.pos.y, f.pos.z);
        vis.inner.rotation.x += dt * 7;
      }
    },

    reset() {
      cancelCharge();
      const cleared = physics.clearAll();
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
