import { calcCleanliness, DEFAULT_TABLE_SLOTS, type CleanlinessStore, type StainItem, type StainKind } from './cleanliness.ts';
import { MAX_STAFF, MAX_STAINS, SHIFT_START_HOUR, STAFF_CANDIDATES } from './constants.ts';
import type { EventBus } from './eventBus.ts';
import { DEFAULT_GAME_STATE, type GameEvents, type GameState } from './gameState.ts';
import { createInitialStock, INVENTORY_ITEMS, type InventoryStock } from './inventory.ts';
import { clampReputation } from './reputation.ts';
import { createEmptyShiftStats, formatGameTime, type ShiftState } from './shift.ts';
import type { StaffMember, StaffStore } from './staff.ts';

export const SAVE_KEY = 'quantrasua.save';
export const SAVE_VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveData {
  version: number;
  money: number;
  day: number;
  reputation: number;
  wageDebt: number;
  inventory: InventoryStock;
  staffIds: string[];
  stains: StainItem[];
  tutorialDone: boolean;
}

export interface SaveSnapshotInput {
  state: GameState;
  inventory: InventoryStock;
  staff: readonly StaffMember[];
  stains: readonly StainItem[];
  tutorialDone: boolean;
}

export interface LoadSaveResult {
  data: SaveData | null;
  storageError: boolean;
  invalidData: boolean;
}

const VALID_KINDS = new Set<StainKind>(['spill', 'trash', 'dirty_table', 'full_trash']);
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

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

// shortcut: chỉ lưu trạng thái giữa các ca (closed/summary) nên refresh giữa ca sẽ làm lại ca đó từ lần lưu cuối; nâng cấp sau bằng snapshot giữa ca nếu cần
export function canSaveForShift(shiftState: ShiftState): boolean {
  return shiftState === 'closed' || shiftState === 'summary';
}

// Tạo dữ liệu lưu từ trạng thái hiện tại (nếu vừa tổng kết xong thì lưu sẵn sang ngày kế)
export function buildSaveData({ state, inventory, staff, stains, tutorialDone }: SaveSnapshotInput): SaveData {
  const nextDay = state.shiftState === 'summary' ? state.day + 1 : state.day;
  return {
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
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data);
}

function sanitizeStaffIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const result: string[] = [];
  const usedRoles = new Set<string>();
  for (const id of raw) {
    if (result.length >= MAX_STAFF) break;
    if (typeof id !== 'string') continue;
    const candidate = STAFF_CANDIDATES.find((c) => c.id === id);
    if (!candidate || result.includes(candidate.id) || usedRoles.has(candidate.role)) continue;
    usedRoles.add(candidate.role);
    result.push(candidate.id);
  }
  return result;
}

function sanitizeStains(raw: unknown): StainItem[] | null {
  if (!Array.isArray(raw)) return null;
  const result: StainItem[] = [];
  const usedIds = new Set<string>();
  const usedTables = new Set<number>();
  let hasFullTrash = false;

  for (let i = 0; i < raw.length && result.length < MAX_STAINS; i++) {
    const item = raw[i];
    if (!isObj(item) || typeof item.kind !== 'string' || !VALID_KINDS.has(item.kind as StainKind)) continue;
    if (!isNum(item.x) || !isNum(item.z) || !isNum(item.standX) || !isNum(item.standZ)) continue;

    const kind = item.kind as StainKind;
    let tableIndex: number | undefined;
    if (kind === 'dirty_table') {
      const ti = item.tableIndex;
      if (!isNum(ti) || !Number.isInteger(ti) || ti < 0 || ti >= DEFAULT_TABLE_SLOTS.length || usedTables.has(ti)) continue;
      tableIndex = ti;
      usedTables.add(ti);
    } else if (kind === 'full_trash') {
      if (hasFullTrash) continue;
      hasFullTrash = true;
    }

    let id = typeof item.id === 'string' && item.id.trim().length > 0 ? item.id : `stain_load_${i + 1}`;
    if (usedIds.has(id)) id = `stain_load_${i + 1}_${result.length}`;
    usedIds.add(id);

    const stain: StainItem = { id, kind, x: item.x, z: item.z, standX: item.standX, standZ: item.standZ };
    if (tableIndex !== undefined) stain.tableIndex = tableIndex;
    result.push(stain);
  }
  return result;
}

// Giải mã JSON save và kiểm tra hợp lệ: sai cấu trúc/version -> null, ngoài biên hợp lý -> kẹp biên
export function deserializeSave(rawJson: string): SaveData | null {
  if (typeof rawJson !== 'string' || rawJson.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return null;
  }

  if (!isObj(parsed) || parsed.version !== SAVE_VERSION) return null;
  if (!isNum(parsed.money) || !isNum(parsed.day) || !isNum(parsed.reputation) || !isNum(parsed.wageDebt)) return null;
  if (typeof parsed.tutorialDone !== 'boolean' || !isObj(parsed.inventory)) return null;

  const inventory = {} as InventoryStock;
  for (const key of INVENTORY_ITEMS) {
    const qty = parsed.inventory[key];
    if (!isNum(qty)) return null;
    inventory[key] = Math.max(0, Math.floor(qty));
  }

  const staffIds = sanitizeStaffIds(parsed.staffIds);
  const stains = sanitizeStains(parsed.stains);
  if (!staffIds || !stains) return null;

  return {
    version: SAVE_VERSION,
    money: Math.max(0, Math.round(parsed.money)),
    day: Math.max(1, Math.floor(parsed.day)),
    reputation: clampReputation(parsed.reputation),
    wageDebt: Math.max(0, Math.round(parsed.wageDebt)),
    inventory,
    staffIds,
    stains,
    tutorialDone: parsed.tutorialDone,
  };
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

// Khôi phục dữ liệu save vào GameState, cửa hàng vết bẩn và nhân viên
export function applyLoadedSave(
  save: SaveData,
  store: { updateState(patch: Partial<GameState>): GameState },
  cleanliness: CleanlinessStore,
  staffStore: StaffStore,
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
  });
  cleanliness.restoreStains(save.stains);
  staffStore.restoreHired(save.staffIds);
}

// Điều phối lưu tự động giữa các ca, giữ trạng thái tutorialDone và cảnh báo lỗi storage 1 lần
export function createSaveController(options: {
  storage: StorageLike | null | undefined;
  initialSave?: SaveData | null;
  getSnapshot: () => SaveSnapshotInput;
  onStorageError?: () => void;
}) {
  let lastSaved: SaveData = options.initialSave
    ? { ...options.initialSave, inventory: { ...options.initialSave.inventory }, staffIds: [...options.initialSave.staffIds], stains: options.initialSave.stains.map((s) => ({ ...s })) }
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

export function bindAutoSave(bus: EventBus<GameEvents>, saveCtrl: ReturnType<typeof createSaveController>): () => void {
  const unsubs = (['shiftClosed', 'staffHired', 'staffFired'] as const).map((ev) => bus.on(ev, () => saveCtrl.saveIfAllowed()));
  return () => unsubs.forEach((u) => u());
}
