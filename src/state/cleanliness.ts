import {
  CLEANLINESS_PENALTIES,
  CUSTOMERS_PER_DIRTY_TABLE,
  LOW_SCORE_SPILL_CHANCE,
  LOW_SCORE_THRESHOLD,
  MAX_STAINS,
  STAIN_SPAWN_INTERVAL_SEC,
  TRASH_FULL_CUPS,
  TRASH_SPILL_CHANCE,
} from './constants.ts';
import type { EventBus } from './eventBus.ts';
import type { GameEvents } from './gameState.ts';
import type { ShiftState } from './shift.ts';

export type StainKind = 'spill' | 'trash' | 'dirty_table' | 'full_trash';

export interface StainSlot {
  x: number;
  z: number;
  standX?: number;
  standZ?: number;
}

export interface StainItem {
  id: string;
  kind: StainKind;
  x: number;
  z: number;
  standX: number;
  standZ: number;
  tableIndex?: number;
}

export interface CleanlinessConfig {
  floorSlots: readonly StainSlot[];
  tableSlots: readonly StainSlot[];
  trashSlot: StainSlot;
  rng?: () => number;
  onSync?: (cleanliness: number, delta: number, stains: readonly StainItem[]) => void;
}

export const DEFAULT_FLOOR_SLOTS: readonly StainSlot[] = [
  { x: -1.6, z: 0.2 },
  { x: 1.3, z: -0.5 },
  { x: 1.3, z: 1.2 },
  { x: 1.3, z: 2.8 },
  { x: -1.5, z: 2.6 },
  { x: -3.7, z: 0.1 },
  { x: 0.62, z: -0.82 },
  { x: -0.35, z: -0.55 },
];

export const DEFAULT_TABLE_SLOTS: readonly StainSlot[] = [
  { x: 3.1, z: -1.7, standX: 1.82, standZ: -1.7 },
  { x: 3.1, z: 0.4, standX: 1.82, standZ: 0.4 },
  { x: 3.1, z: 2.5, standX: 1.82, standZ: 2.5 },
  { x: -3.1, z: 1.8, standX: -1.82, standZ: 1.8 },
];

export const DEFAULT_TRASH_SLOT: StainSlot = {
  x: 0.62,
  z: -1.5,
  standX: 1.18,
  standZ: -1.5,
};

// Tính điểm độ sạch (0..100) dựa trên danh sách vết bẩn hiện tại
export function calcCleanliness(stains: readonly Pick<StainItem, 'kind'>[]): number {
  let penalty = 0;
  for (const stain of stains) {
    penalty += CLEANLINESS_PENALTIES[stain.kind];
  }
  return Math.max(0, Math.min(100, 100 - penalty));
}

// Quản lý danh sách vết bẩn, 4 nguồn sinh bẩn, thùng rác đầy và độ sạch 0..100
export function createCleanlinessStore(
  bus?: EventBus<GameEvents>,
  config: Partial<CleanlinessConfig> = {},
) {
  const floorSlots = config.floorSlots ?? DEFAULT_FLOOR_SLOTS;
  const tableSlots = config.tableSlots ?? DEFAULT_TABLE_SLOTS;
  const trashSlot = config.trashSlot ?? DEFAULT_TRASH_SLOT;
  const rng = config.rng ?? Math.random;

  let nextId = 1;
  let stains: StainItem[] = [];
  let cleanliness = 100;
  let spawnTimerSec = 0;
  let servedSinceDirtyTable = 0;
  let trashCups = 0;

  const notify = (prevValue: number) => {
    cleanliness = calcCleanliness(stains);
    const delta = cleanliness - prevValue;
    config.onSync?.(cleanliness, delta, stains);
    if (delta !== 0) {
      bus?.emit('cleanlinessChanged', { value: cleanliness, delta });
    }
  };

  const addStain = (stain: Omit<StainItem, 'id'>): StainItem | null => {
    if (stains.length >= MAX_STAINS) return null;
    const prev = cleanliness;
    const created: StainItem = { id: `stain_${nextId++}`, ...stain };
    stains = [...stains, created];
    notify(prev);
    return created;
  };

  const pickFreeFloorSlot = (): StainSlot | null => {
    const free = floorSlots.filter(
      (slot) =>
        !stains.some(
          (s) =>
            (s.kind === 'spill' || s.kind === 'trash') &&
            Math.hypot(s.x - slot.x, s.z - slot.z) < 0.25,
        ),
    );
    if (free.length === 0) return null;
    const idx = Math.min(free.length - 1, Math.floor(rng() * free.length));
    return free[idx];
  };

  const spawnFloorStain = (kind?: 'spill' | 'trash'): StainItem | null => {
    const slot = pickFreeFloorSlot();
    if (!slot) return null;
    const resolvedKind = kind ?? (rng() < 0.55 ? 'spill' : 'trash');
    return addStain({
      kind: resolvedKind,
      x: slot.x,
      z: slot.z,
      standX: slot.standX ?? slot.x,
      standZ: slot.standZ ?? slot.z,
    });
  };

  const dirtyRandomTable = (): StainItem | null => {
    const cleanIndices: number[] = [];
    for (let i = 0; i < tableSlots.length; i++) {
      if (!stains.some((s) => s.kind === 'dirty_table' && s.tableIndex === i)) {
        cleanIndices.push(i);
      }
    }
    if (cleanIndices.length === 0) return null;
    const pickIdx = cleanIndices[Math.min(cleanIndices.length - 1, Math.floor(rng() * cleanIndices.length))];
    const slot = tableSlots[pickIdx];
    return addStain({
      kind: 'dirty_table',
      tableIndex: pickIdx,
      x: slot.x,
      z: slot.z,
      standX: slot.standX ?? slot.x,
      standZ: slot.standZ ?? slot.z,
    });
  };

  const cleanStain = (id: string): boolean => {
    const target = stains.find((s) => s.id === id);
    if (!target) return false;
    if (target.kind === 'full_trash') trashCups = 0;
    const prev = cleanliness;
    stains = stains.filter((s) => s.id !== id);
    notify(prev);
    return true;
  };

  const emptyTrash = (): boolean => {
    const full = stains.find((s) => s.kind === 'full_trash');
    trashCups = 0;
    if (!full) return false;
    return cleanStain(full.id);
  };

  return {
    getStains(): readonly StainItem[] {
      return stains;
    },

    getCleanliness(): number {
      return cleanliness;
    },

    getTrashCups(): number {
      return trashCups;
    },

    isTrashFull(): boolean {
      return stains.some((s) => s.kind === 'full_trash');
    },

    getDirtyTableIndices(): number[] {
      return stains
        .filter((s): s is StainItem & { tableIndex: number } => s.kind === 'dirty_table' && s.tableIndex !== undefined)
        .map((s) => s.tableIndex);
    },

    spawnFloorStain,
    dirtyRandomTable,
    cleanStain,
    emptyTrash,

    restoreStains(items: readonly StainItem[]): void {
      const prev = cleanliness;
      stains = items.map((s) => ({ ...s }));
      let maxNum = 0;
      for (const s of stains) {
        const match = /^stain_(\d+)$/.exec(s.id);
        if (match) maxNum = Math.max(maxNum, Number(match[1]));
      }
      nextId = Math.max(nextId, maxNum + 1);
      trashCups = stains.some((s) => s.kind === 'full_trash') ? TRASH_FULL_CUPS : 0;
      spawnTimerSec = 0;
      servedSinceDirtyTable = 0;
      cleanliness = calcCleanliness(stains);
      config.onSync?.(cleanliness, cleanliness - prev, stains);
    },

    update(dt: number, shiftState: ShiftState): void {
      if (shiftState !== 'open') return;
      spawnTimerSec += dt;
      while (spawnTimerSec >= STAIN_SPAWN_INTERVAL_SEC) {
        spawnTimerSec -= STAIN_SPAWN_INTERVAL_SEC;
        spawnFloorStain();
      }
    },

    recordCustomerServed(scoreTotal: number): void {
      servedSinceDirtyTable += 1;
      if (servedSinceDirtyTable >= CUSTOMERS_PER_DIRTY_TABLE) {
        servedSinceDirtyTable = 0;
        dirtyRandomTable();
      }
      if (scoreTotal < LOW_SCORE_THRESHOLD && rng() < LOW_SCORE_SPILL_CHANCE) {
        spawnFloorStain('spill');
      }
    },

    recordTrashCup(): { becameFull: boolean; spilled: boolean } {
      trashCups += 1;
      let becameFull = false;
      if (trashCups >= TRASH_FULL_CUPS && !stains.some((s) => s.kind === 'full_trash')) {
        becameFull =
          addStain({
            kind: 'full_trash',
            x: trashSlot.x,
            z: trashSlot.z,
            standX: trashSlot.standX ?? trashSlot.x,
            standZ: trashSlot.standZ ?? trashSlot.z,
          }) !== null;
      }
      const spilled = rng() < TRASH_SPILL_CHANCE && spawnFloorStain('spill') !== null;
      return { becameFull, spilled };
    },
  };
}

export type CleanlinessStore = ReturnType<typeof createCleanlinessStore>;
