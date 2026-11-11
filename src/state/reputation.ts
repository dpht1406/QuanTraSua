import {
  COMPLAINT_CHANCE,
  COMPLAINT_REP_DELTA,
  COMPLAINT_SCORE_THRESHOLD,
  COMPLAINT_TIMEOUT_SEC,
  LOW_SCORE_THRESHOLD,
  REP_DIRTY_CHECK_SEC,
  REP_DIRTY_PENALTY,
  REP_DIRTY_THRESHOLD,
  REP_GREET_BONUS,
  REP_HIGH_SCORE_MIN,
  REP_ORDER_FAILED,
  REP_SERVE_GOOD,
  REP_SERVE_LATE,
  REP_SERVE_LOW_SCORE,
  REPUTATION_MAX,
  REPUTATION_MIN,
} from './constants.ts';
import type { EventBus } from './eventBus.ts';
import type { ComplaintChoice, GameEvents } from './gameState.ts';
import type { ShiftState } from './shift.ts';

export interface ReputationOptions {
  initialValue?: number;
  initialCleanliness?: number;
  onSync?: (value: number) => void;
  getOrderMultiplier?: () => number;
}

export interface ActiveComplaint {
  refundCost: number;
  remainingSec: number;
}

// Kẹp giá trị uy tín trong biên 0..100
export function clampReputation(value: number): number {
  return Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, Math.round(value)));
}

// Quản lý uy tín (0..100), lắng nghe kết quả phục vụ, khách bỏ đi và độ sạch kéo dài
export function createReputationStore(
  bus: EventBus<GameEvents>,
  options: ReputationOptions = {},
) {
  let value = clampReputation(options.initialValue ?? 50);
  let shiftStartValue = value;
  let latestCleanliness = options.initialCleanliness ?? 100;
  let dirtyTimerSec = 0;

  const adjust = (delta: number, reason: string): number => {
    if (delta === 0) return value;
    const prev = value;
    const next = clampReputation(prev + delta);
    const actualDelta = next - prev;
    value = next;
    if (actualDelta !== 0) {
      options.onSync?.(next);
      bus.emit('reputationChanged', { value: next, delta: actualDelta, reason });
    }
    return next;
  };

  bus.on('shiftOpened', () => {
    shiftStartValue = value;
    dirtyTimerSec = 0;
  });

  bus.on('cleanlinessChanged', ({ value: clean }) => {
    latestCleanliness = clean;
    if (latestCleanliness >= REP_DIRTY_THRESHOLD) {
      dirtyTimerSec = 0;
    }
  });

  bus.on('orderServed', ({ score }) => {
    const mult = options.getOrderMultiplier?.() ?? 1;
    const isLate = score.timeFactor < 1;
    const isLow = score.total < LOW_SCORE_THRESHOLD;

    if (score.total >= REP_HIGH_SCORE_MIN && !isLate) {
      adjust(Math.round(REP_SERVE_GOOD * mult), 'Phục vụ nhanh, đúng vị');
      return;
    }

    const lowPenalty = isLow ? REP_SERVE_LOW_SCORE : 0;
    const latePenalty = isLate ? REP_SERVE_LATE : 0;
    const totalPenalty = lowPenalty + latePenalty;
    if (totalPenalty > 0) {
      const reason =
        isLow && isLate
          ? 'Đồ uống kém & giao trễ'
          : isLow
            ? 'Đồ uống chưa đạt yêu cầu'
            : 'Giao đồ uống trễ';
      adjust(-Math.round(totalPenalty * mult), reason);
    }
  });

  bus.on('orderFailed', () => {
    const mult = options.getOrderMultiplier?.() ?? 1;
    adjust(-Math.round(REP_ORDER_FAILED * mult), 'Khách bỏ đi');
  });

  return {
    getValue(): number {
      return value;
    },

    getShiftDelta(): number {
      return value - shiftStartValue;
    },

    adjust,

    recordGreet(): number {
      return adjust(REP_GREET_BONUS, 'Chào đón khách');
    },

    update(dt: number, shiftState: ShiftState): void {
      if (shiftState !== 'open') return;
      if (latestCleanliness >= REP_DIRTY_THRESHOLD) {
        dirtyTimerSec = 0;
        return;
      }
      dirtyTimerSec += dt;
      while (dirtyTimerSec >= REP_DIRTY_CHECK_SEC) {
        dirtyTimerSec -= REP_DIRTY_CHECK_SEC;
        adjust(-REP_DIRTY_PENALTY, 'Quán bẩn kéo dài');
      }
    },
  };
}

export type ReputationStore = ReturnType<typeof createReputationStore>;

const COMPLAINT_CHOICE_REASONS: Record<ComplaintChoice, string> = {
  apologize: 'Xin lỗi khách hàng',
  refund: 'Tặng đền ly cho khách',
  ignore: 'Bỏ qua phàn nàn của khách',
};

// Quản lý logic phàn nàn (3 lựa chọn Xin lỗi / Tặng đền / Bỏ qua, hết giờ = Bỏ qua)
export function createComplaintController(
  bus: EventBus<GameEvents>,
  deps: {
    trySpendMoney: (amount: number) => boolean;
    adjustReputation: (delta: number, reason: string) => void;
    rng?: () => number;
  },
) {
  const rng = deps.rng ?? Math.random;
  let active: ActiveComplaint | null = null;

  const resolve = (choice: ComplaintChoice): { ok: boolean; message?: string } => {
    if (!active) return { ok: false };
    if (choice === 'refund' && !deps.trySpendMoney(active.refundCost)) {
      return { ok: false, message: 'Không đủ tiền để tặng đền! Hãy chọn 1 hoặc 3.' };
    }
    const delta = COMPLAINT_REP_DELTA[choice];
    if (delta !== 0) {
      deps.adjustReputation(delta, COMPLAINT_CHOICE_REASONS[choice]);
    }
    active = null;
    bus.emit('customerComplained', { choice });
    return { ok: true };
  };

  return {
    isOpen(): boolean {
      return active !== null;
    },

    getActive(): ActiveComplaint | null {
      return active ? { ...active } : null;
    },

    maybeTrigger(scoreTotal: number, payout: number, fallbackCost: number): boolean {
      if (active || scoreTotal >= COMPLAINT_SCORE_THRESHOLD) return false;
      if (rng() >= COMPLAINT_CHANCE) return false;
      active = {
        refundCost: payout > 0 ? payout : fallbackCost,
        remainingSec: COMPLAINT_TIMEOUT_SEC,
      };
      return true;
    },

    choose: resolve,

    pickDigit(digit: 1 | 2 | 3): { ok: boolean; message?: string } {
      const choice: ComplaintChoice =
        digit === 1 ? 'apologize' : digit === 2 ? 'refund' : 'ignore';
      return resolve(choice);
    },

    update(dt: number): boolean {
      if (!active) return false;
      active.remainingSec -= dt;
      if (active.remainingSec <= 0) {
        resolve('ignore');
        return true;
      }
      return false;
    },

    clear(): void {
      active = null;
    },
  };
}

export type ComplaintController = ReturnType<typeof createComplaintController>;
