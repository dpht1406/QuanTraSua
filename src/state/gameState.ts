import { createEventBus } from './eventBus.ts';

export interface GameState {
  money: number;
  day: number;
  time: string;
  reputation: number;
  cleanliness: number;
}

export type GameEvents = {
  'state:changed': GameState;
  'toast:show': { message: string };
};

export const DEFAULT_GAME_STATE: GameState = {
  money: 500000,
  day: 1,
  time: '08:00',
  reputation: 50,
  cleanliness: 100,
};

// Tạo store lưu GameState và tự động phát sự kiện khi cập nhật
export function createGameStore(initial: GameState = DEFAULT_GAME_STATE) {
  let state: GameState = { ...initial };
  const bus = createEventBus<GameEvents>();

  return {
    bus,

    // Lấy bản sao trạng thái hiện tại để tránh sửa trực tiếp từ bên ngoài
    getState(): GameState {
      return { ...state };
    },

    // Cập nhật một phần trạng thái và thông báo cho các listener
    updateState(patch: Partial<GameState>): GameState {
      state = { ...state, ...patch };
      const snapshot = { ...state };
      bus.emit('state:changed', snapshot);
      return snapshot;
    },

    // Đặt lại trạng thái về giá trị mặc định ban đầu
    resetState(): GameState {
      state = { ...DEFAULT_GAME_STATE };
      const snapshot = { ...state };
      bus.emit('state:changed', snapshot);
      return snapshot;
    },
  };
}

export const gameStore = createGameStore();
