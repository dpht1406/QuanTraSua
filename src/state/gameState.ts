import { createEventBus } from './eventBus.ts';
import { createHands, type HandsState } from './hands.ts';
import type { InventoryItem, InventoryStock } from './inventory.ts';
import type { ScoreResult } from './scoring.ts';
import {
  createEmptyShiftStats,
  type ShiftState,
  type ShiftStats,
  type ShiftSummary,
} from './shift.ts';
import type { StaffMember } from './staff.ts';
import { createToolLocations, type ToolLocations } from './toolLocations.ts';

export type ComplaintChoice = 'apologize' | 'refund' | 'ignore';
export type RandomEventType = 'picky_customer' | 'power_outage' | 'rush_hour';
export type ThrowObjectKind = 'cup' | 'broom' | 'mop';
export type ThrowHitTarget = 'customer' | 'staff' | 'bin' | 'floor' | 'wall' | 'table' | 'counter';
export type Phase6EventReason =
  | 'bi_nem'
  | 'nhan_vien_choang'
  | 'do_nguyen_lieu'
  | 'bi_nem_nhieu_lan';
export type GameEventReason = Phase6EventReason | (string & {});

export interface GameState {
  money: number;
  wageDebt: number;
  day: number;
  time: string;
  reputation: number;
  cleanliness: number;
  shiftState: ShiftState;
  shiftStats: ShiftStats;
  hands: HandsState;
  tools: ToolLocations;
}

export type GameEvents = {
  'state:changed': GameState;
  'toast:show': { message: string };
  orderServed: { score: ScoreResult; elapsed: number; payout: number };
  orderFailed: { reason: GameEventReason };
  shiftOpened: { day: number };
  shiftClosed: { summary: ShiftSummary };
  stockChanged: { stock: InventoryStock; spentCost: number };
  cleanlinessChanged: { value: number; delta: number };
  reputationChanged: { value: number; delta: number; reason: GameEventReason };
  customerComplained: { choice: ComplaintChoice };
  randomEventStarted: { type: RandomEventType };
  randomEventEnded: { type: RandomEventType };
  staffHired: { staff: StaffMember };
  staffFired: { staff: StaffMember; reason?: GameEventReason };
  objectThrown: { kind: ThrowObjectKind; hit: ThrowHitTarget };
  ingredientContaminated: { item: InventoryItem; level: number };
  ingredientSpoiled: { item: InventoryItem; lost: number };
};

export const DEFAULT_GAME_STATE: GameState = {
  money: 500000,
  wageDebt: 0,
  day: 1,
  time: '08:00',
  reputation: 50,
  cleanliness: 100,
  shiftState: 'closed',
  shiftStats: createEmptyShiftStats(),
  hands: createHands(),
  tools: createToolLocations(),
};

// Tạo store lưu GameState và tự động phát sự kiện khi cập nhật
export function createGameStore(initial: GameState = DEFAULT_GAME_STATE) {
  let state: GameState = {
    ...initial,
    shiftStats: { ...initial.shiftStats },
    hands: { ...initial.hands },
    tools: { ...initial.tools },
  };
  const bus = createEventBus<GameEvents>();

  const snapshot = (): GameState => ({
    ...state,
    shiftStats: { ...state.shiftStats },
  });

  return {
    bus,

    // Lấy bản sao trạng thái hiện tại để tránh sửa trực tiếp từ bên ngoài
    getState(): GameState {
      return snapshot();
    },

    // Cập nhật một phần trạng thái và thông báo cho các listener
    updateState(patch: Partial<GameState>): GameState {
      state = {
        ...state,
        ...patch,
        shiftStats: patch.shiftStats ? { ...patch.shiftStats } : { ...state.shiftStats },
      };
      const next = snapshot();
      bus.emit('state:changed', next);
      return next;
    },

    // Đặt lại trạng thái về giá trị mặc định ban đầu
    resetState(): GameState {
      state = {
        ...DEFAULT_GAME_STATE,
        shiftStats: createEmptyShiftStats(),
        hands: createHands(),
        tools: createToolLocations(),
      };
      const next = snapshot();
      bus.emit('state:changed', next);
      return next;
    },
  };
}

export type GameStore = ReturnType<typeof createGameStore>;

export const gameStore = createGameStore();
