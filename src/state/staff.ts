import { MAX_STAFF, STAFF_CANDIDATES } from './constants.ts';
import type { EventBus } from './eventBus.ts';
import type { GameEvents } from './gameState.ts';
import {
  LEVEL_PERCENT_LIST,
  TOPPING_LIST,
  type DrinkOrder,
  type LevelPercent,
  type ToppingType,
} from './menu.ts';
import { createEmptyCup, type Cup } from './scoring.ts';
import type { ShiftState } from './shift.ts';

export type StaffRole = 'cleaner' | 'barista';

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  wage: number;
  speed: number;
  errorRate: number;
}

export interface StaffActionResult {
  ok: boolean;
  message: string;
  staff?: StaffMember;
}

type ErrorField = 'sugar' | 'ice' | 'topping';

function pickDifferent<T>(items: readonly T[], current: T, rng: () => number): T {
  const others = items.filter((item) => item !== current);
  const idx = Math.min(others.length - 1, Math.floor(rng() * others.length));
  return others[idx];
}

// Pha 1 ly hoàn chỉnh từ nhân viên Pha chế, có thể sai 1 thuộc tính (đường/đá/topping) theo errorRate
export function buildBaristaCup(
  order: DrinkOrder,
  errorRate: number,
  rng: () => number = Math.random,
): { cup: Cup; hadError: boolean; wrongField?: ErrorField } {
  const cup: Cup = {
    ...createEmptyCup(),
    base: order.base,
    sugar: order.sugar,
    ice: order.ice,
    topping: order.topping,
    sealed: true,
  };

  if (errorRate <= 0 || rng() >= errorRate) {
    return { cup, hadError: false };
  }

  const fields: readonly ErrorField[] = ['sugar', 'ice', 'topping'];
  const wrongField = fields[Math.min(fields.length - 1, Math.floor(rng() * fields.length))];

  if (wrongField === 'sugar') {
    cup.sugar = pickDifferent<LevelPercent>(LEVEL_PERCENT_LIST, order.sugar, rng);
  } else if (wrongField === 'ice') {
    cup.ice = pickDifferent<LevelPercent>(LEVEL_PERCENT_LIST, order.ice, rng);
  } else {
    cup.topping = pickDifferent<ToppingType>(TOPPING_LIST, order.topping, rng);
  }

  return { cup, hadError: true, wrongField };
}

// Quản lý tuyển dụng, sa thải nhân viên (tối đa 2 người, chỉ khi đóng cửa) và tính tổng lương ca
export function createStaffStore(bus?: EventBus<GameEvents>) {
  const candidates: readonly StaffMember[] = STAFF_CANDIDATES.map((c) => ({ ...c }));
  let hired: StaffMember[] = [];

  return {
    getCandidates(): readonly StaffMember[] {
      return candidates;
    },

    getHired(): readonly StaffMember[] {
      return hired;
    },

    isHired(id: string): boolean {
      return hired.some((s) => s.id === id);
    },

    getTotalWage(): number {
      let sum = 0;
      for (const s of hired) sum += s.wage;
      return sum;
    },

    hire(id: string, shiftState: ShiftState): StaffActionResult {
      if (shiftState !== 'closed') {
        return { ok: false, message: 'Chỉ thuê nhân viên được khi quán đang đóng cửa!' };
      }
      if (hired.length >= MAX_STAFF) {
        return { ok: false, message: `Chỉ thuê tối đa ${MAX_STAFF} nhân viên cùng lúc!` };
      }
      if (hired.some((s) => s.id === id)) {
        return { ok: false, message: 'Nhân viên này đã được thuê rồi!' };
      }
      const candidate = candidates.find((c) => c.id === id);
      if (!candidate) {
        return { ok: false, message: 'Không tìm thấy ứng viên!' };
      }
      const member = { ...candidate };
      hired = [...hired, member];
      bus?.emit('staffHired', { staff: member });
      return { ok: true, message: `Đã thuê ${member.name}!`, staff: member };
    },

    fire(id: string, shiftState: ShiftState): StaffActionResult {
      if (shiftState !== 'closed') {
        return { ok: false, message: 'Chỉ sa thải nhân viên được khi quán đang đóng cửa!' };
      }
      const target = hired.find((s) => s.id === id);
      if (!target) {
        return { ok: false, message: 'Nhân viên này chưa được thuê!' };
      }
      hired = hired.filter((s) => s.id !== id);
      bus?.emit('staffFired', { staff: target });
      return { ok: true, message: `Đã sa thải ${target.name}.`, staff: target };
    },
  };
}

export type StaffStore = ReturnType<typeof createStaffStore>;
