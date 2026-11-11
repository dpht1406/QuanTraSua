import type * as THREE from 'three';
import type { InventoryItem } from '../state/inventory.ts';
import {
  DRINK_BASE_LIST,
  DRINK_LABELS,
  LEVEL_PERCENT_LIST,
  TOPPING_LABELS,
  TOPPING_LIST,
} from '../state/menu.ts';
import type { CupStep, CupStepValue } from '../state/scoring.ts';
import type { ShopStations } from '../world/shopWorld.ts';

export type MakingStationId = 'teaMachine' | 'fridge' | 'sugar' | 'topping';
export type MakingStep = 'tea' | 'ice' | 'sugar' | 'topping';

export interface FocusedStation {
  id: string;
  step: MakingStep;
}

export interface MakingStationSpec<K extends CupStep = CupStep> {
  id: MakingStationId;
  step: MakingStep;
  cupStep: K;
  title: string;
  label(getCount: (item: InventoryItem) => number): string;
  options(getCount: (item: InventoryItem) => number): [string, string, string];
  resolveDigit(digit: 1 | 2 | 3): { value: CupStepValue[K]; message: string };
}

export const MAKING_STATION_SPECS: readonly MakingStationSpec[] = [
  {
    id: 'teaMachine',
    step: 'tea',
    cupStep: 'base',
    title: 'Chọn trà nền',
    label: () => 'Chọn trà nền (1/2/3)',
    options: (c) => [`Trà sữa (${c('traditional')})`, `Trà đào (${c('peach')})`, `Matcha (${c('matcha')})`],
    resolveDigit: (digit) => {
      const value = DRINK_BASE_LIST[digit - 1];
      return { value, message: `Đã rót ${DRINK_LABELS[value]}` };
    },
  },
  {
    id: 'fridge',
    step: 'ice',
    cupStep: 'ice',
    title: 'Chọn lượng đá',
    label: (c) => `Cho đá (còn ${c('ice')})`,
    options: () => ['0% đá', '50% đá', '100% đá'],
    resolveDigit: (digit) => {
      const value = LEVEL_PERCENT_LIST[digit - 1];
      return { value, message: `Đã cho ${value}% đá` };
    },
  },
  {
    id: 'sugar',
    step: 'sugar',
    cupStep: 'sugar',
    title: 'Chọn lượng đường',
    label: (c) => `Cho đường (còn ${c('sugar')})`,
    options: () => ['0% đường', '50% đường', '100% đường'],
    resolveDigit: (digit) => {
      const value = LEVEL_PERCENT_LIST[digit - 1];
      return { value, message: `Đã cho ${value}% đường` };
    },
  },
  {
    id: 'topping',
    step: 'topping',
    cupStep: 'topping',
    title: 'Chọn topping',
    label: () => 'Cho topping (1/2/3)',
    options: (c) => ['Không topping', `Trân châu (${c('pearl')})`, `Thạch (${c('jelly')})`],
    resolveDigit: (digit) => {
      const value = TOPPING_LIST[digit - 1];
      return { value, message: `Đã chọn: ${TOPPING_LABELS[value]}` };
    },
  },
];

let boundStations: ShopStations | null = null;
let boundTargetGetter: (() => THREE.Object3D | null) | null = null;

// Tra cứu trạm pha chế ứng với một Object3D mục tiêu
export function resolveStationForTarget(
  stations: ShopStations,
  target: THREE.Object3D | null,
): FocusedStation | null {
  if (!target) return null;
  for (const spec of MAKING_STATION_SPECS) {
    if (stations[spec.id] === target) return { id: spec.id, step: spec.step };
  }
  return null;
}

// Gắn nguồn trạm và target đang ngắm cho getFocusedStation
export function initStationLookup(
  stations: ShopStations,
  getCurrentTarget: () => THREE.Object3D | null,
): void {
  boundStations = stations;
  boundTargetGetter = getCurrentTarget;
}

// Lấy trạm pha chế người chơi đang nhìn trong tầm tương tác
export function getFocusedStation(): FocusedStation | null {
  if (!boundStations || !boundTargetGetter) return null;
  return resolveStationForTarget(boundStations, boundTargetGetter());
}
