import { DEFAULT_TABLE_SLOTS, type StainItem, type StainKind } from './cleanliness.ts';
import { MAX_STAFF, MAX_STAINS, STAFF_CANDIDATES } from './constants.ts';
import {
  clampContamination,
  createInitialContamination,
  INVENTORY_ITEMS,
  type InventoryContamination,
  type InventoryStock,
} from './inventory.ts';
import { clampReputation } from './reputation.ts';

export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  money: number;
  day: number;
  reputation: number;
  wageDebt: number;
  inventory: InventoryStock;
  contamination?: InventoryContamination;
  staffIds: string[];
  stains: StainItem[];
  tutorialDone: boolean;
}

const VALID_KINDS = new Set<StainKind>(['spill', 'trash', 'dirty_table', 'full_trash']);
export const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

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

function sanitizeContamination(raw: unknown): InventoryContamination | undefined {
  if (raw === undefined) return undefined;
  if (!isObj(raw)) return createInitialContamination();
  const out = {} as InventoryContamination;
  for (const key of INVENTORY_ITEMS) {
    const val = raw[key];
    out[key] = isNum(val) ? clampContamination(val) : 0;
  }
  return out;
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

  const data: SaveData = {
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
  const contamination = sanitizeContamination(parsed.contamination);
  if (contamination !== undefined) data.contamination = contamination;
  return data;
}
