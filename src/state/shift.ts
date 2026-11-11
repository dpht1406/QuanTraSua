import {
  CUSTOMER_GAP_NORMAL,
  CUSTOMER_GAP_PEAK,
  PEAK_HOURS,
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

// Tổng hợp số liệu ca thành bảng kết quả doanh thu, chi phí và lợi nhuận
export function buildShiftSummary(stats: ShiftStats): ShiftSummary {
  const avgStars =
    stats.servedCount > 0 ? Number((stats.totalStars / stats.servedCount).toFixed(1)) : 0;
  return {
    revenue: stats.revenue,
    servedCount: stats.servedCount,
    failedCount: stats.failedCount,
    avgStars,
    ingredientCost: stats.ingredientCost,
    staffWages: stats.staffWages,
    profit: stats.revenue - stats.ingredientCost - stats.staffWages,
  };
}

// Trừ tiền lương nhân viên khi kết ca, giữ tiền không xuống dưới 0
export function applyWageDeduction(money: number, staffWages: number): number {
  // shortcut: tiền không xuống dưới 0 khi không đủ trả lương nhân viên, chưa có cơ chế nợ ở GĐ4
  return Math.max(0, money - Math.max(0, staffWages));
}
