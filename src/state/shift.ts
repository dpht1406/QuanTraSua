import {
  CUSTOMER_GAP_NORMAL,
  CUSTOMER_GAP_PEAK,
  PEAK_HOURS,
  REP_GAP_MAX_MULTIPLIER,
  REP_GAP_MIN_MULTIPLIER,
  REPUTATION_MAX,
  REPUTATION_MIN,
  SHIFT_END_HOUR,
  SHIFT_REAL_DURATION_SEC,
  SHIFT_START_HOUR,
} from './constants.ts';

export type ShiftState = 'closed' | 'open' | 'closing' | 'summary';

export interface ShiftStats {
  revenue: number;
  servedCount: number;
  failedCount: number;
  totalStars: number;
  ingredientCost: number;
  staffWages: number;
}

export interface ShiftSummary {
  revenue: number;
  servedCount: number;
  failedCount: number;
  avgStars: number;
  ingredientCost: number;
  staffWages: number;
  profit: number;
  shopRating: number;
  reputationEnd: number;
  reputationDelta: number;
  prevDebtPaid: number;
  wageDebt: number;
  quitStaffName?: string;
}

export interface ShiftSummaryExtras {
  reputationEnd?: number;
  cleanlinessEnd?: number;
  reputationDelta?: number;
  prevDebtPaid?: number;
  wageDebt?: number;
  quitStaffName?: string;
}

const ALLOWED_TRANSITIONS: Record<ShiftState, readonly ShiftState[]> = {
  closed: ['open'],
  open: ['closing'],
  closing: ['summary'],
  summary: ['closed'],
};

// Tạo thống kê rỗng cho một ca làm việc mới
export function createEmptyShiftStats(): ShiftStats {
  return {
    revenue: 0,
    servedCount: 0,
    failedCount: 0,
    totalStars: 0,
    ingredientCost: 0,
    staffWages: 0,
  };
}

// Kiểm tra và thực hiện chuyển trạng thái ca làm việc theo đúng vòng đời hợp lệ
export function transitionShift(current: ShiftState, next: ShiftState): ShiftState {
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    throw new Error(`Chuyển trạng thái ca không hợp lệ: ${current} -> ${next}`);
  }
  return next;
}

// Quy đổi số giây thực trong ca thành tổng số phút trong ngày (từ 08:00 đến 22:00)
export function realElapsedToGameMinutes(realSec: number): number {
  const startMin = SHIFT_START_HOUR * 60;
  const endMin = SHIFT_END_HOUR * 60;
  const ratio = Math.max(0, Math.min(1, realSec / SHIFT_REAL_DURATION_SEC));
  return Math.floor(startMin + ratio * (endMin - startMin));
}

// Định dạng tổng số phút trong ngày thành chuỗi HH:MM
export function formatGameTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// Kiểm tra thời điểm hiện tại có nằm trong khung giờ cao điểm không
export function isPeakHour(gameMinutes: number): boolean {
  const hour = gameMinutes / 60;
  return PEAK_HOURS.some((slot) => hour >= slot.startHour && hour < slot.endHour);
}

// Lấy khoảng thời gian chờ giữa 2 khách tùy theo giờ thường hay giờ cao điểm
export function getCustomerGapRange(gameMinutes: number): { minSec: number; maxSec: number } {
  return isPeakHour(gameMinutes) ? CUSTOMER_GAP_PEAK : CUSTOMER_GAP_NORMAL;
}

// Hệ số khoảng cách khách theo uy tín: uy tín cao -> khách dày hơn (hệ số nhỏ), thấp -> thưa hơn
export function getCustomerGapMultiplier(reputation: number): number {
  const rep = Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, reputation));
  const raw =
    rep >= 50
      ? 1 - ((rep - 50) / 50) * (1 - REP_GAP_MIN_MULTIPLIER)
      : 1 + ((50 - rep) / 50) * (REP_GAP_MAX_MULTIPLIER - 1);
  return Math.max(REP_GAP_MIN_MULTIPLIER, Math.min(REP_GAP_MAX_MULTIPLIER, Number(raw.toFixed(3))));
}

// Đánh giá cuối ca 1..5 sao dựa trên uy tín cuối ca và độ sạch
export function calcShopRating(reputation: number, cleanliness: number): number {
  const rep = Math.max(0, Math.min(100, reputation));
  const clean = Math.max(0, Math.min(100, cleanliness));
  const score = rep * 0.6 + clean * 0.4;
  if (score >= 85) return 5;
  if (score >= 70) return 4;
  if (score >= 50) return 3;
  if (score >= 30) return 2;
  return 1;
}

// Tổng hợp số liệu ca thành bảng kết quả doanh thu, chi phí, lợi nhuận và uy tín/nợ
export function buildShiftSummary(stats: ShiftStats, extras: ShiftSummaryExtras = {}): ShiftSummary {
  const avgStars =
    stats.servedCount > 0 ? Number((stats.totalStars / stats.servedCount).toFixed(1)) : 0;
  const reputationEnd = extras.reputationEnd ?? 50;
  const cleanlinessEnd = extras.cleanlinessEnd ?? 100;
  return {
    revenue: stats.revenue,
    servedCount: stats.servedCount,
    failedCount: stats.failedCount,
    avgStars,
    ingredientCost: stats.ingredientCost,
    staffWages: stats.staffWages,
    profit: stats.revenue - stats.ingredientCost - stats.staffWages,
    shopRating: calcShopRating(reputationEnd, cleanlinessEnd),
    reputationEnd,
    reputationDelta: extras.reputationDelta ?? 0,
    prevDebtPaid: extras.prevDebtPaid ?? 0,
    wageDebt: extras.wageDebt ?? 0,
    quitStaffName: extras.quitStaffName,
  };
}

// Trừ nợ cũ trước rồi trừ lương ca hiện tại; phần thiếu ghi thành nợ lương
export function settleWages(
  money: number,
  staffWages: number,
  prevDebt = 0,
): { money: number; debt: number; prevDebtPaid: number } {
  const safeMoney = Math.max(0, money);
  const safePrevDebt = Math.max(0, prevDebt);
  const safeWages = Math.max(0, staffWages);
  const prevDebtPaid = Math.min(safeMoney, safePrevDebt);
  const afterDebtMoney = safeMoney - prevDebtPaid;
  const wagesPaid = Math.min(afterDebtMoney, safeWages);
  const debt = safePrevDebt - prevDebtPaid + (safeWages - wagesPaid);
  return {
    money: afterDebtMoney - wagesPaid,
    debt,
    prevDebtPaid,
  };
}
