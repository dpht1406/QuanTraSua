import {
  CONTAM_PER_POUR,
  CONTAM_THRESHOLD,
  MAX_COMPLAINT_BONUS,
  POUR_BACK_REFUND_RATIO,
  POUR_BACK_REP_PENALTY,
  SPOIL_RATIO,
  SPOIL_THRESHOLD,
} from './constantsContam.ts';
import type { EventBus } from './eventBus.ts';
import type { GameEvents } from './gameState.ts';
import {
  INVENTORY_ITEMS,
  type InventoryContamination,
  type InventoryItem,
  type InventoryStore,
} from './inventory.ts';
import { getCupRequiredItems, type Cup, type CupStep } from './scoring.ts';

export type PourStep = CupStep | 'tea';
export type PourBackFailReason = 'sealed' | 'not_done' | 'empty_step';

export type PourBackResult =
  | { ok: true; step: CupStep; item: InventoryItem; refunded: number; level: number }
  | { ok: false; reason: PourBackFailReason };

export interface PourBackOutcome {
  pour: PourBackResult;
  reputationDelta: number;
}

export interface SpoiledEntry {
  item: InventoryItem;
  lost: number;
}

export interface ContaminatedEntry {
  item: InventoryItem;
  level: number;
}

function toCupStep(step: PourStep): CupStep {
  return step === 'tea' ? 'base' : step;
}

function resolveCupStepItem(cup: Cup, cupStep: CupStep): InventoryItem | null {
  if (cupStep === 'base') return cup.base;
  if (cupStep === 'sugar') return cup.sugar && cup.sugar > 0 ? 'sugar' : null;
  if (cupStep === 'ice') return cup.ice && cup.ice > 0 ? 'ice' : null;
  return cup.topping && cup.topping !== 'none' ? cup.topping : null;
}

// Đổ ngược bước đã pha trên ly về trạm: gỡ bước, xóa cờ trừ lần đầu, hoàn một phần và tăng nhiễm
export function pourBack(
  cup: Cup,
  step: PourStep,
  inventory: InventoryStore,
  bus?: EventBus<GameEvents>,
): PourBackResult {
  if (cup.sealed) return { ok: false, reason: 'sealed' };
  const cupStep = toCupStep(step);
  if (cup[cupStep] === null) return { ok: false, reason: 'not_done' };

  const item = resolveCupStepItem(cup, cupStep);
  if (!item) return { ok: false, reason: 'empty_step' };

  cup[cupStep] = null;
  if (cup.charged) delete cup.charged[cupStep];

  const refunded = inventory.refund(item, POUR_BACK_REFUND_RATIO);
  const nextLevel = inventory.setContamination(item, inventory.getContaminationOf(item) + CONTAM_PER_POUR);
  bus?.emit('ingredientContaminated', { item, level: nextLevel });

  return { ok: true, step: cupStep, item, refunded, level: nextLevel };
}

// Đổ ngược và tính mức trừ uy tín nếu có khách đang chờ ở quầy
export function performPourBack(
  cup: Cup,
  step: PourStep,
  inventory: InventoryStore,
  hasCustomerAtCounter: boolean,
  bus?: EventBus<GameEvents>,
): PourBackOutcome {
  const pour = pourBack(cup, step, inventory, bus);
  if (!pour.ok) return { pour, reputationDelta: 0 };
  return { pour, reputationDelta: hasCustomerAtCounter ? -POUR_BACK_REP_PENALTY : 0 };
}

// Tính bonus xác suất phàn nàn theo mức nhiễm các nguyên liệu trong ly
// shortcut: tính theo mức nhiễm lúc giao chứ không lúc pha, nâng cấp khi Cup lưu snapshot độ nhiễm từng bước
export function calcCupComplaintBonus(
  cup: Cup,
  contamination: InventoryContamination,
): number {
  let maxContam = 0;
  for (const item of getCupRequiredItems(cup)) {
    const level = contamination[item] ?? 0;
    if (level > maxContam) maxContam = level;
  }
  if (maxContam <= CONTAM_THRESHOLD) return 0;
  const span = 100 - CONTAM_THRESHOLD;
  if (span <= 0) return MAX_COMPLAINT_BONUS;
  const ratio = Math.min(1, (maxContam - CONTAM_THRESHOLD) / span);
  return ratio * MAX_COMPLAINT_BONUS;
}

// Làm hỏng tồn kho các nguyên liệu nhiễm đạt ngưỡng cuối ca (không đặt lại độ nhiễm về 0)
export function spoilContaminatedStock(
  inventory: InventoryStore,
  bus?: EventBus<GameEvents>,
): SpoiledEntry[] {
  const spoiled: SpoiledEntry[] = [];
  for (const item of INVENTORY_ITEMS) {
    if (inventory.getContaminationOf(item) < SPOIL_THRESHOLD) continue;
    const lost = inventory.spoil(item, SPOIL_RATIO);
    if (lost <= 0) continue;
    spoiled.push({ item, lost });
    bus?.emit('ingredientSpoiled', { item, lost });
  }
  return spoiled;
}

// Lọc danh sách nguyên liệu có độ nhiễm vượt ngưỡng cảnh báo
export function getContaminatedOverThreshold(
  contamination: InventoryContamination,
  threshold = CONTAM_THRESHOLD,
): ContaminatedEntry[] {
  const list: ContaminatedEntry[] = [];
  for (const item of INVENTORY_ITEMS) {
    const level = contamination[item] ?? 0;
    if (level > threshold) list.push({ item, level });
  }
  return list;
}
