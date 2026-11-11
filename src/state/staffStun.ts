import { MAX_STAFF_HITS_PER_DAY } from './constantsThrow.ts';
import type { EventBus } from './eventBus.ts';
import type { GameEvents } from './gameState.ts';
import type { StaffMember, StaffStore } from './staff.ts';

export interface StaffHitOutcome {
  hitsToday: number;
  fired: boolean;
  staff?: StaffMember;
}

// Đếm số lần nhân viên bị ném trúng trong ngày và cho tự nghỉ khi chạm ngưỡng
export function createStaffHitTracker(initialDay = 1) {
  let currentDay = initialDay;
  const hitsByStaff = new Map<string, number>();

  const getHits = (staffId: string): number => hitsByStaff.get(staffId) ?? 0;

  const syncDay = (day: number): boolean => {
    if (day === currentDay) return false;
    currentDay = day;
    hitsByStaff.clear();
    return true;
  };

  const reset = (day = currentDay): void => {
    currentDay = day;
    hitsByStaff.clear();
  };

  const recordHit = (
    staffId: string,
    staffStore?: StaffStore,
    bus?: EventBus<GameEvents>,
  ): StaffHitOutcome => {
    const next = getHits(staffId) + 1;
    hitsByStaff.set(staffId, next);
    if (next < MAX_STAFF_HITS_PER_DAY) {
      return { hitsToday: next, fired: false };
    }

    const hired = staffStore?.getHired() ?? [];
    const target = hired.find((s) => s.id === staffId);
    if (!target || !staffStore) {
      return { hitsToday: next, fired: true, staff: target };
    }

    // Nếu chỉ còn 1 nhân viên thì dùng trực tiếp quitHighestPaid để phát staffFired chuẩn
    if (hired.length === 1) {
      const quit = staffStore.quitHighestPaid('bi_nem_nhieu_lan');
      return { hitsToday: next, fired: true, staff: quit ?? target };
    }

    // Dùng restoreHired + staffFired để cho đúng nhân viên bị ném nghỉ việc trong ca
    const remainingIds = hired.filter((s) => s.id !== staffId).map((s) => s.id);
    staffStore.restoreHired(remainingIds);
    bus?.emit('staffFired', { staff: target, reason: 'bi_nem_nhieu_lan' });
    return { hitsToday: next, fired: true, staff: target };
  };

  return {
    getCurrentDay: () => currentDay,
    getHits,
    syncDay,
    reset,
    recordHit,
  };
}

export type StaffHitTracker = ReturnType<typeof createStaffHitTracker>;
