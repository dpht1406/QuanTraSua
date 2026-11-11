import { BARISTA_TAKEOVER_DELAY_SEC, INVENTORY_CONFIG } from '../state/constants.ts';
import type { CleanlinessStore } from '../state/cleanliness.ts';
import type { EventBus } from '../state/eventBus.ts';
import type { GameEvents } from '../state/gameState.ts';
import type { createInventoryStore } from '../state/inventory.ts';
import type { DrinkOrder } from '../state/menu.ts';
import { consumeCupIngredients, findMissingCupItem, type Cup } from '../state/scoring.ts';
import { buildBaristaCup } from '../state/staff.ts';
import type { StaffActor } from '../world/staffMember.ts';
import type { OrderManager } from './orderManager.ts';

export interface StaffRuntime {
  actor: StaffActor;
  homeX: number;
  homeZ: number;
  state: 'idle' | 'moving' | 'working' | 'delivering';
  targetStainId: string | null;
  workTimer: number;
  stunSec: number;
  leavingTimer: number;
  preparedCup: Cup | null;
}

export interface BaristaDeps {
  orderManager: OrderManager;
  inventory: ReturnType<typeof createInventoryStore>;
  hasPlayerCup: () => boolean;
  bus: EventBus<GameEvents>;
  warnedRef: { current: DrinkOrder | null };
}

const BREW_POS = { x: -2.15, z: -2.35 };
const DELIVER_POS = { x: -0.35, z: -2.35 };

// Đặt lại trạng thái làm việc của một nhân viên về nghỉ chờ
export function resetStaffRuntime(rt: StaffRuntime): void {
  rt.state = 'idle';
  rt.targetStainId = null;
  rt.workTimer = 0;
  rt.preparedCup = null;
  rt.actor.animateWork(false, 0);
}

// Cập nhật hành vi nhân viên dọn dẹp tìm và lau vết bẩn
export function updateCleaner(
  rt: StaffRuntime,
  dt: number,
  claimedStains: Set<string>,
  cleanliness: CleanlinessStore,
  onCleanlinessSync: () => void,
): void {
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
    resetStaffRuntime(rt);
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
      resetStaffRuntime(rt);
    }
  }
}

// Cập nhật hành vi nhân viên pha chế nhận đơn trễ và giao ly tại quầy
export function updateBarista(rt: StaffRuntime, dt: number, deps: BaristaDeps): void {
  const active = deps.orderManager.getActiveOrder();
  if (!active) {
    deps.warnedRef.current = null;
    if (rt.state !== 'idle') resetStaffRuntime(rt);
    rt.actor.moveToward(rt.homeX, rt.homeZ, dt);
    rt.actor.animateWork(false, dt);
    return;
  }

  if (rt.state === 'idle') {
    if (
      deps.orderManager.isOrderLocked() ||
      deps.hasPlayerCup() ||
      active.elapsedSec < BARISTA_TAKEOVER_DELAY_SEC ||
      deps.warnedRef.current === active.order
    ) {
      rt.actor.moveToward(rt.homeX, rt.homeZ, dt);
      rt.actor.animateWork(false, dt);
      return;
    }

    const { cup } = buildBaristaCup(active.order, rt.actor.member.errorRate);
    const missing = findMissingCupItem(cup, deps.inventory.getStock());
    if (missing) {
      deps.warnedRef.current = active.order;
      deps.bus.emit('toast:show', {
        message: `${rt.actor.member.name}: Hết ${INVENTORY_CONFIG[missing].label}, không thể pha đơn!`,
      });
      return;
    }

    consumeCupIngredients(cup, (item, qty) => deps.inventory.consume(item, qty));
    deps.orderManager.lockOrder(rt.actor.member.name);
    rt.preparedCup = cup;
    rt.workTimer = Math.max(3.5, 9.5 / rt.actor.member.speed);
    rt.state = 'working';
    deps.bus.emit('toast:show', { message: `${rt.actor.member.name} đã nhận pha đơn!` });
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
      deps.orderManager.deliverStaffCup(rt.preparedCup);
      resetStaffRuntime(rt);
    }
  }
}
