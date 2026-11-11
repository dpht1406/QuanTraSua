import { calcCleanliness, type CleanlinessStore, type StainItem } from './cleanliness.ts';
import { SHIFT_START_HOUR } from './constants.ts';
import type { EventBus } from './eventBus.ts';
import { DEFAULT_GAME_STATE, type GameEvents, type GameState } from './gameState.ts';
import { createHands } from './hands.ts';
import {
  createInitialContamination,
  createInitialStock,
  type InventoryContamination,
  type InventoryStock,
} from './inventory.ts';
import { clampReputation } from './reputation.ts';
import { deserializeSave, SAVE_VERSION, type SaveData } from './saveValidation.ts';
import { createEmptyShiftStats, formatGameTime, type ShiftState } from './shift.ts';
import type { StaffMember, StaffStore } from './staff.ts';
import { createToolLocations } from './toolLocations.ts';

export { deserializeSave, SAVE_VERSION, type SaveData };

export const SAVE_KEY = 'quantrasua.save';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveSnapshotInput {
  state: GameState;
  inventory: InventoryStock;
  contamination?: InventoryContamination;
  staff: readonly StaffMember[];
  stains: readonly StainItem[];
  tutorialDone: boolean;
}

export interface LoadSaveResult {
  data: SaveData | null;
  storageError: boolean;
  invalidData: boolean;
}

export function createDefaultSaveData(tutorialDone = false): SaveData {
  return {
    version: SAVE_VERSION,
    money: DEFAULT_GAME_STATE.money,
    day: DEFAULT_GAME_STATE.day,
    reputation: DEFAULT_GAME_STATE.reputation,
    wageDebt: DEFAULT_GAME_STATE.wageDebt,
    inventory: createInitialStock(),
    staffIds: [],
    stains: [],
    tutorialDone,
  };
}

// Trả về bảng độ nhiễm đầy đủ (0..100, thiếu thì mặc định 0) từ dữ liệu save
export function resolveSaveContamination(save: SaveData | null | undefined): InventoryContamination {
  return createInitialContamination(save?.contamination);
}

// shortcut: chỉ lưu trạng thái giữa các ca (closed/summary) nên refresh giữa ca sẽ làm lại ca đó từ lần lưu cuối; nâng cấp sau bằng snapshot giữa ca nếu cần
export function canSaveForShift(shiftState: ShiftState): boolean {
  return shiftState === 'closed' || shiftState === 'summary';
}

// Tạo dữ liệu lưu từ trạng thái hiện tại (nếu vừa tổng kết xong thì lưu sẵn sang ngày kế)
export function buildSaveData({ state, inventory, contamination, staff, stains, tutorialDone }: SaveSnapshotInput): SaveData {
  const nextDay = state.shiftState === 'summary' ? state.day + 1 : state.day;
  const data: SaveData = {
    version: SAVE_VERSION,
    money: Math.max(0, Math.round(state.money)),
    day: Math.max(1, Math.floor(nextDay)),
    reputation: clampReputation(state.reputation),
    wageDebt: Math.max(0, Math.round(state.wageDebt)),
    inventory: { ...inventory },
    staffIds: staff.map((s) => s.id),
    stains: stains.map((s) => ({ ...s })),
    tutorialDone,
  };
  if (contamination) data.contamination = createInitialContamination(contamination);
  return data;
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data);
}

export function loadSave(storage: StorageLike | null | undefined): LoadSaveResult {
  if (!storage) return { data: null, storageError: true, invalidData: false };
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return { data: null, storageError: true, invalidData: false };
  }
  if (raw === null || raw === '') return { data: null, storageError: false, invalidData: false };
  const data = deserializeSave(raw);
  return data ? { data, storageError: false, invalidData: false } : { data: null, storageError: false, invalidData: true };
}

export function writeSave(storage: StorageLike | null | undefined, data: SaveData): { ok: boolean; storageError: boolean } {
  if (!storage) return { ok: false, storageError: true };
  try {
    storage.setItem(SAVE_KEY, serializeSave(data));
    return { ok: true, storageError: false };
  } catch {
    return { ok: false, storageError: true };
  }
}

export function clearSave(storage: StorageLike | null | undefined): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

// Khôi phục dữ liệu save vào GameState, vết bẩn, nhân viên, đồng thời đặt tay rỗng và dụng cụ về giá
export function applyLoadedSave(
  save: SaveData,
  store: { updateState(patch: Partial<GameState>): GameState },
  cleanliness: CleanlinessStore,
  staffStore: StaffStore,
  inventory?: { restoreContamination(next?: Partial<InventoryContamination>): void },
): void {
  store.updateState({
    money: save.money,
    wageDebt: save.wageDebt,
    day: save.day,
    reputation: save.reputation,
    cleanliness: calcCleanliness(save.stains),
    time: formatGameTime(SHIFT_START_HOUR * 60),
    shiftState: 'closed',
    shiftStats: createEmptyShiftStats(),
    hands: createHands(),
    tools: createToolLocations(),
  });
  cleanliness.restoreStains(save.stains);
  staffStore.restoreHired(save.staffIds);
  inventory?.restoreContamination(save.contamination);
}

// Điều phối lưu tự động giữa các ca, giữ trạng thái tutorialDone và cảnh báo lỗi storage 1 lần
export function createSaveController(options: {
  storage: StorageLike | null | undefined;
  initialSave?: SaveData | null;
  getSnapshot: () => SaveSnapshotInput;
  onStorageError?: () => void;
}) {
  let lastSaved: SaveData = options.initialSave
    ? {
        ...options.initialSave,
        inventory: { ...options.initialSave.inventory },
        ...(options.initialSave.contamination ? { contamination: { ...options.initialSave.contamination } } : {}),
        staffIds: [...options.initialSave.staffIds],
        stains: options.initialSave.stains.map((s) => ({ ...s })),
      }
    : createDefaultSaveData(false);
  let warned = false;

  const warnOnce = () => {
    if (warned) return;
    warned = true;
    options.onStorageError?.();
  };

  const commit = (next: SaveData): boolean => {
    const res = writeSave(options.storage, next);
    if (res.storageError) {
      warnOnce();
      return false;
    }
    lastSaved = next;
    return true;
  };

  return {
    saveIfAllowed(): boolean {
      const snap = options.getSnapshot();
      if (!canSaveForShift(snap.state.shiftState)) return false;
      return commit(buildSaveData(snap));
    },

    saveTutorialDone(): boolean {
      const snap = options.getSnapshot();
      const next = canSaveForShift(snap.state.shiftState)
        ? buildSaveData({ ...snap, tutorialDone: true })
        : { ...lastSaved, tutorialDone: true };
      return commit(next);
    },

    clear(): boolean {
      const ok = clearSave(options.storage);
      if (!ok) warnOnce();
      return ok;
    },

    notifyUnavailable: warnOnce,
  };
}

export type SaveController = ReturnType<typeof createSaveController>;

export function bindAutoSave(bus: EventBus<GameEvents>, saveCtrl: SaveController): () => void {
  const unsubs = (['shiftClosed', 'staffHired', 'staffFired'] as const).map((ev) => bus.on(ev, () => saveCtrl.saveIfAllowed()));
  return () => unsubs.forEach((u) => u());
}
