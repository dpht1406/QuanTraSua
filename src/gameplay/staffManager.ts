import type { CleanlinessStore } from '../state/cleanliness.ts';
import { FALL_DOWN_SEC } from '../state/constantsThrow.ts';
import type { EventBus } from '../state/eventBus.ts';
import type { GameEvents } from '../state/gameState.ts';
import type { createInventoryStore } from '../state/inventory.ts';
import type { DrinkOrder } from '../state/menu.ts';
import type { ShiftState } from '../state/shift.ts';
import type { StaffRole, StaffStore } from '../state/staff.ts';
import type { FallDir } from '../world/fallPose.ts';
import type { ShopWorld } from '../world/shopWorld.ts';
import { createStaffActor, type StaffActor } from '../world/staffMember.ts';
import type { OrderManager } from './orderManager.ts';
import { resetStaffRuntime, updateBarista, updateCleaner, type StaffRuntime } from './staffBehavior.ts';

export interface StaffManager {
  update(dt: number, shiftState: ShiftState): void;
  syncRoster(): void;
  stunStaff(role: StaffRole, sec: number, hitDir?: FallDir): void;
  isStunned(role: StaffRole): boolean;
  clearStuns(): void;
  getActors(): readonly StaffActor[];
}

const CLEANER_HOMES: readonly [number, number][] = [
  [1.4, -2.7],
  [2.2, -2.7],
];

const BARISTA_HOMES: readonly [number, number][] = [
  [-1.9, -2.65],
  [-2.75, -2.65],
];

// Điều phối nhân viên 3D: Dọn dẹp tự đi lau vết bẩn, Pha chế tự nhận đơn sau X giây nếu người chơi chưa lấy ly
export function createStaffManager(
  world: ShopWorld,
  staffStore: StaffStore,
  cleanliness: CleanlinessStore,
  onCleanlinessSync: () => void,
  orderManager: OrderManager,
  inventory: ReturnType<typeof createInventoryStore>,
  hasPlayerCup: () => boolean,
  bus: EventBus<GameEvents>,
  isPaused?: () => boolean,
): StaffManager {
  const runtimes = new Map<string, StaffRuntime>();
  const warnedRef = { current: null as DrinkOrder | null };

  const removeRuntime = (id: string, rt: StaffRuntime) => {
    if (rt.actor.member.role === 'barista' && (rt.state === 'working' || rt.state === 'delivering')) {
      orderManager.unlockOrder();
    }
    rt.actor.clearFall();
    rt.actor.root.removeFromParent();
    runtimes.delete(id);
  };

  const syncRoster = () => {
    const hired = staffStore.getHired();
    const activeIds = new Set(hired.map((s) => s.id));

    for (const [id, rt] of runtimes) {
      if (!activeIds.has(id) && rt.leavingTimer <= 0) {
        removeRuntime(id, rt);
      }
    }

    let cleanerIdx = 0;
    let baristaIdx = 0;
    for (const member of hired) {
      const [hx, hz] =
        member.role === 'cleaner'
          ? CLEANER_HOMES[cleanerIdx++ % CLEANER_HOMES.length]
          : BARISTA_HOMES[baristaIdx++ % BARISTA_HOMES.length];
      const existing = runtimes.get(member.id);
      if (existing && existing.leavingTimer <= 0) {
        existing.homeX = hx;
        existing.homeZ = hz;
        continue;
      }
      const actor = createStaffActor(member, world.colliders, hx, hz);
      world.root.add(actor.root);
      runtimes.set(member.id, {
        actor,
        homeX: hx,
        homeZ: hz,
        state: 'idle',
        targetStainId: null,
        workTimer: 0,
        stunSec: 0,
        leavingTimer: 0,
        preparedCup: null,
      });
    }
  };

  bus.on('staffHired', syncRoster);
  bus.on('staffFired', ({ staff, reason }) => {
    const rt = runtimes.get(staff.id);
    if (reason === 'bi_nem_nhieu_lan' && rt) {
      if (rt.actor.member.role === 'barista' && (rt.state === 'working' || rt.state === 'delivering')) {
        orderManager.unlockOrder();
      }
      rt.state = 'idle';
      rt.targetStainId = null;
      rt.workTimer = 0;
      rt.preparedCup = null;
      rt.leavingTimer = FALL_DOWN_SEC + 0.55;
      const minDur = rt.leavingTimer + 1;
      if (rt.stunSec < minDur) {
        rt.stunSec = minDur;
        rt.actor.triggerFall(minDur);
      }
      return;
    }
    syncRoster();
  });
  syncRoster();

  return {
    syncRoster,

    stunStaff(role, sec, hitDir) {
      if (sec <= 0) return;
      for (const rt of runtimes.values()) {
        if (rt.leavingTimer <= 0 && rt.actor.member.role === role) {
          rt.stunSec = Math.max(rt.stunSec, sec);
          rt.actor.animateWork(false, 0);
          rt.actor.triggerFall(rt.stunSec, hitDir);
        }
      }
    },

    isStunned(role) {
      for (const rt of runtimes.values()) {
        if (rt.leavingTimer <= 0 && rt.actor.member.role === role && rt.stunSec > 0) return true;
      }
      return false;
    },

    clearStuns() {
      for (const [id, rt] of runtimes) {
        rt.stunSec = 0;
        rt.actor.clearFall();
        if (rt.leavingTimer > 0) removeRuntime(id, rt);
      }
    },

    getActors() {
      const active: StaffActor[] = [];
      for (const rt of runtimes.values()) {
        if (rt.leavingTimer <= 0) active.push(rt.actor);
      }
      return active;
    },

    update(dt, shiftState) {
      const workingShift = shiftState === 'open' || shiftState === 'closing';
      if (!workingShift) {
        warnedRef.current = null;
        for (const [id, rt] of runtimes) {
          rt.stunSec = 0;
          rt.actor.clearFall();
          if (rt.leavingTimer > 0) {
            removeRuntime(id, rt);
            continue;
          }
          if (rt.state !== 'idle') resetStaffRuntime(rt);
          rt.actor.moveToward(rt.homeX, rt.homeZ, dt);
        }
        return;
      }

      if (isPaused?.()) {
        for (const rt of runtimes.values()) {
          if (rt.stunSec <= 0 && rt.leavingTimer <= 0) rt.actor.animateWork(false, dt);
        }
        return;
      }

      const claimedStains = new Set<string>();
      for (const rt of runtimes.values()) {
        if (rt.leavingTimer <= 0 && rt.actor.member.role === 'cleaner' && rt.targetStainId) {
          claimedStains.add(rt.targetStainId);
        }
      }

      for (const [id, rt] of runtimes) {
        if (rt.leavingTimer > 0) {
          rt.leavingTimer -= dt;
          rt.actor.updateFall(dt);
          if (rt.leavingTimer <= 0) removeRuntime(id, rt);
          continue;
        }
        if (rt.stunSec > 0) {
          rt.stunSec = Math.max(0, rt.stunSec - dt);
          rt.actor.updateFall(dt);
          if (rt.stunSec === 0) rt.actor.clearFall();
          continue;
        }
        if (rt.actor.member.role === 'cleaner') {
          updateCleaner(rt, dt, claimedStains, cleanliness, onCleanlinessSync);
        } else {
          updateBarista(rt, dt, { orderManager, inventory, hasPlayerCup, bus, warnedRef });
        }
      }
    },
  };
}
