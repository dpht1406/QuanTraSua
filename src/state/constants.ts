export const DRINK_PRICES = {
  traditional: 30000,
  peach: 35000,
  matcha: 40000,
} as const;

export const TOPPING_PRICE = 5000;

export const ORDER_PATIENCE_SEC = 60;
export const NEXT_CUSTOMER_MIN_SEC = 3;
export const NEXT_CUSTOMER_MAX_SEC = 5;

// Giờ mở ca 08:00 -> 22:00 (14 giờ game = 8 phút thực)
export const SHIFT_START_HOUR = 8;
export const SHIFT_END_HOUR = 22;
export const SHIFT_REAL_DURATION_SEC = 8 * 60;

// Giờ cao điểm 11:00-13:00 và 17:00-19:00 có khoảng cách giữa khách ngắn hơn
export const PEAK_HOURS = [
  { startHour: 11, endHour: 13 },
  { startHour: 17, endHour: 19 },
] as const;

export const CUSTOMER_GAP_NORMAL = { minSec: 5, maxSec: 8 } as const;
export const CUSTOMER_GAP_PEAK = { minSec: 2, maxSec: 4 } as const;

export const SCORE_WEIGHTS = {
  base: 40,
  sugar: 20,
  ice: 20,
  topping: 20,
} as const;

export const TIME_PENALTY_START_RATIO = 0.7;
export const MAX_TIME_PENALTY = 20;
export const PAYOUT_ROUND_STEP = 1000;

// Cấu hình kho ban đầu, quy cách gói nhập và giá nhập từng nguyên liệu
export const INVENTORY_CONFIG = {
  cup: { label: 'Ly nhựa', initial: 25, packSize: 20, packCost: 40000 },
  lid: { label: 'Nắp ly', initial: 25, packSize: 20, packCost: 20000 },
  traditional: { label: 'Trà sữa truyền thống', initial: 15, packSize: 10, packCost: 80000 },
  peach: { label: 'Trà đào', initial: 12, packSize: 10, packCost: 90000 },
  matcha: { label: 'Matcha latte', initial: 10, packSize: 10, packCost: 110000 },
  sugar: { label: 'Đường', initial: 25, packSize: 20, packCost: 20000 },
  ice: { label: 'Đá viên', initial: 30, packSize: 20, packCost: 10000 },
  pearl: { label: 'Trân châu', initial: 15, packSize: 10, packCost: 20000 },
  jelly: { label: 'Thạch', initial: 15, packSize: 10, packCost: 20000 },
} as const;

// Cấu hình vệ sinh: mức trừ độ sạch, thời gian lau, ngưỡng sinh bẩn và thùng rác đầy
export const CLEANLINESS_PENALTIES = {
  spill: 15,
  trash: 10,
  dirty_table: 12,
  full_trash: 18,
} as const;

export const CLEAN_HOLD_SEC = {
  spill: 1.6,
  trash: 1.2,
  dirty_table: 1.8,
  full_trash: 0,
} as const;

export const MAX_STAINS = 10;
export const STAIN_SPAWN_INTERVAL_SEC = 35;
export const CUSTOMERS_PER_DIRTY_TABLE = 2;
export const TRASH_FULL_CUPS = 3;
export const TRASH_SPILL_CHANCE = 0.35;
export const LOW_SCORE_THRESHOLD = 60;
export const LOW_SCORE_SPILL_CHANCE = 0.5;

// Cấu hình nhân viên: giới hạn tuyển, độ trễ nhận đơn và danh sách ứng viên cố định
export const MAX_STAFF = 2;
export const BARISTA_TAKEOVER_DELAY_SEC = 8;

export const STAFF_CANDIDATES = [
  { id: 'na', name: 'Bé Na', role: 'cleaner', wage: 60000, speed: 1.5, errorRate: 0 },
  { id: 'minh', name: 'Anh Minh', role: 'cleaner', wage: 90000, speed: 2.3, errorRate: 0 },
  { id: 'linh', name: 'Chị Linh', role: 'barista', wage: 80000, speed: 1.4, errorRate: 0.25 },
  { id: 'chau', name: 'Bảo Châu', role: 'barista', wage: 120000, speed: 2.1, errorRate: 0.08 },
] as const;

// Cấu hình uy tín (0..100), thái độ, sự kiện ngẫu nhiên và nợ lương (GĐ5a)
export const REPUTATION_MIN = 0;
export const REPUTATION_MAX = 100;
export const REP_HIGH_SCORE_MIN = 80;
export const REP_SERVE_GOOD = 2;
export const REP_SERVE_LOW_SCORE = 3;
export const REP_SERVE_LATE = 2;
export const REP_ORDER_FAILED = 4;
export const REP_DIRTY_THRESHOLD = 60;
export const REP_DIRTY_CHECK_SEC = 20;
export const REP_DIRTY_PENALTY = 2;

export const GREET_WINDOW_SEC = 5;
export const REP_GREET_BONUS = 1;

export const COMPLAINT_SCORE_THRESHOLD = LOW_SCORE_THRESHOLD;
export const COMPLAINT_CHANCE = 0.6;
export const COMPLAINT_TIMEOUT_SEC = 10;
export const COMPLAINT_REP_DELTA = {
  apologize: 0,
  refund: 3,
  ignore: -4,
} as const;

export const REP_GAP_MIN_MULTIPLIER = 0.7;
export const REP_GAP_MAX_MULTIPLIER = 1.6;

export const MAX_EVENTS_PER_SHIFT = 2;
export const EVENT_FIRST_DELAY_RANGE = { minSec: 45, maxSec: 95 } as const;
export const EVENT_NEXT_DELAY_RANGE = { minSec: 55, maxSec: 110 } as const;
export const PICKY_PATIENCE_MULTIPLIER = 0.65;
export const PICKY_REP_MULTIPLIER = 2;
export const POWER_OUTAGE_DURATION_RANGE = { minSec: 20, maxSec: 30 } as const;
export const RUSH_HOUR_DURATION_SEC = 60;

export const MAX_WAGE_DEBT = 100000;
export const REP_DEBT_QUIT_PENALTY = 8;
