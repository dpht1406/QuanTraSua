import { BARISTA_TAKEOVER_DELAY_SEC, INVENTORY_CONFIG } from '../state/constants.ts';
import type { CleanlinessStore } from '../state/cleanliness.ts';
import type { EventBus } from '../state/eventBus.ts';
import type { GameEvents } from '../state/gameState.ts';
import type { createInventoryStore } from '../state/inventory.ts';
import type { DrinkOrder } from '../state/menu.ts';
import { consumeCupIngredients, findMissingCupItem, type Cup } from '../state/scoring.ts';
import type { ShiftState } from '../state/shift.ts';
import { buildBaristaCup, type StaffStore } from '../state/staff.ts';
import type { ShopWorld } from '../world/shopWorld.ts';
import { createStaffActor, type StaffActor } from '../world/staffMember.ts';
import type { OrderManager } from './orderManager.ts';

interface StaffRuntime {
  actor: StaffActor;
  homeX: number;
  homeZ: number;
  state: 'idle' | 'moving' | 'working' | 'delivering';
  targetStainId: string | null;
  workTimer: number;
  preparedCup: Cup | null;
}

export interface StaffManager {
  update(dt: number, shiftState: ShiftState): void;
  syncRoster(): void;
}

const CLEANER_HOMES: readonly [number, number][] = [
  [1.4, -2.7],
  [2.2, -2.7],
];

const BARISTA_HOMES: readonly [number, number][] = [
  [-1.9, -2.65],
  [-2.75, -2.65],
];

const BREW_POS = { x: -2.15, z: -2.35 };
const DELIVER_POS = { x: -0.35, z: -2.35 };

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
  let warnedOrder: DrinkOrder | null = null;

  const syncRoster = () => {
    const hired = staffStore.getHired();
    const activeIds = new Set(hired.map((s) => s.id));

    for (const [id, rt] of runtimes) {
      if (!activeIds.has(id)) {
        rt.actor.root.removeFromParent();
        runtimes.delete(id);
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
      if (existing) {
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
        preparedCup: null,
      });
    }
  };

  bus.on('staffHired', syncRoster);
  bus.on('staffFired', syncRoster);

  const resetRuntime = (rt: StaffRuntime) => {
    rt.state = 'idle';
    rt.targetStainId = null;
    rt.workTimer = 0;
    rt.preparedCup = null;
    rt.actor.animateWork(false, 0);
  };

  const updateCleaner = (rt: StaffRuntime, dt: number, claimedStains: Set<string>) => {
    const stains = cleanliness.getStains();
    if (rt.state === 'idle') {
      const next = stains.find((s) => !claimedStains.has(s.id));
      if (!next) {
        if (!rt.actor.moveToward(rt.homeX, rt.homeZ, dt)) return;
        rt.actor.animateWork(false, dt);
        return;
      }
      claimedStains.add(next.id);
      rt.targetStainId = next.id;
      rt.state = 'moving';
    }

    const target = stains.find((s) => s.id === rt.targetStainId);
    if (!target) {
      resetRuntime(rt);
      return;
    }

    if (rt.state === 'moving') {
      if (rt.actor.moveToward(target.standX, target.standZ, dt)) {
        rt.state = 'working';
        rt.workTimer = Math.max(0.8, 3.0 / rt.actor.member.speed);
      }
      return;
    }

    if (rt.state === 'working') {
      rt.actor.faceToward(target.x, target.z);
      rt.actor.animateWork(true, dt);
      rt.workTimer -= dt;
      if (rt.workTimer <= 0) {
        cleanliness.cleanStain(target.id);
        onCleanlinessSync();
        resetRuntime(rt);
      }
    }
  };

  const updateBarista = (rt: StaffRuntime, dt: number) => {
    const active = orderManager.getActiveOrder();
    if (!active) {
      warnedOrder = null;
      if (rt.state !== 'idle') resetRuntime(rt);
      rt.actor.moveToward(rt.homeX, rt.homeZ, dt);
      rt.actor.animateWork(false, dt);
      return;
    }

    if (rt.state === 'idle') {
      if (
        orderManager.isOrderLocked() ||
        hasPlayerCup() ||
        active.elapsedSec < BARISTA_TAKEOVER_DELAY_SEC ||
        warnedOrder === active.order
      ) {
        rt.actor.moveToward(rt.homeX, rt.homeZ, dt);
        rt.actor.animateWork(false, dt);
        return;
      }

      const { cup } = buildBaristaCup(active.order, rt.actor.member.errorRate);
      const missing = findMissingCupItem(cup, inventory.getStock());
      if (missing) {
        warnedOrder = active.order;
        bus.emit('toast:show', {
          message: `${rt.actor.member.name}: Hết ${INVENTORY_CONFIG[missing].label}, không thể pha đơn!`,
        });
        return;
      }

      consumeCupIngredients(cup, (item, qty) => inventory.consume(item, qty));
      orderManager.lockOrder(rt.actor.member.name);
      rt.preparedCup = cup;
      rt.workTimer = Math.max(3.5, 9.5 / rt.actor.member.speed);
      rt.state = 'working';
      bus.emit('toast:show', { message: `${rt.actor.member.name} đã nhận pha đơn!` });
      return;
    }

    if (rt.state === 'working') {
      if (!rt.actor.moveToward(BREW_POS.x, BREW_POS.z, dt)) return;
      rt.actor.faceToward(-2.3, -1.5);
      rt.actor.animateWork(true, dt);
      rt.workTimer -= dt;
      if (rt.workTimer <= 0) {
        rt.state = 'delivering';
        rt.actor.animateWork(false, 0);
      }
      return;
    }

    if (rt.state === 'delivering' && rt.preparedCup) {
      if (rt.actor.moveToward(DELIVER_POS.x, DELIVER_POS.z, dt)) {
        rt.actor.faceToward(-0.25, -1.5);
        orderManager.deliverStaffCup(rt.preparedCup);
        resetRuntime(rt);
      }
    }
  };

  syncRoster();

  return {
    syncRoster,

    update(dt, shiftState) {
      const workingShift = shiftState === 'open' || shiftState === 'closing';
      if (!workingShift) {
        warnedOrder = null;
        for (const rt of runtimes.values()) {
          if (rt.state !== 'idle') resetRuntime(rt);
          rt.actor.moveToward(rt.homeX, rt.homeZ, dt);
        }
        return;
      }

      if (isPaused?.()) {
        for (const rt of runtimes.values()) {
          rt.actor.animateWork(false, dt);
        }
        return;
      }

      const claimedStains = new Set<string>();
      for (const rt of runtimes.values()) {
        if (rt.actor.member.role === 'cleaner' && rt.targetStainId) {
          claimedStains.add(rt.targetStainId);
        }
      }

      for (const rt of runtimes.values()) {
        if (rt.actor.member.role === 'cleaner') {
          updateCleaner(rt, dt, claimedStains);
        } else {
          updateBarista(rt, dt);
        }
      }
    },
  };
}
