import type * as THREE from 'three';
import type { Interactable } from '../interaction/interactionSystem.ts';
import type { EventBus } from '../state/eventBus.ts';
import type { GameEvents } from '../state/gameState.ts';
import {
  DRINK_BASE_LIST,
  DRINK_LABELS,
  LEVEL_PERCENT_LIST,
  TOPPING_LABELS,
  TOPPING_LIST,
} from '../state/menu.ts';
import { createEmptyCup, type Cup } from '../state/scoring.ts';
import type { HeldCupView } from '../ui/heldCup.ts';
import type { LevelPickerView } from '../ui/levelPicker.ts';
import type { ShopStations } from '../world/shopWorld.ts';
import type { OrderManager } from './orderManager.ts';

interface PickerSession {
  stationTarget: THREE.Object3D;
  onPick(digit: 1 | 2 | 3): void;
}

export interface DrinkStationController {
  interactables: Interactable[];
  pickDigit(digit: 1 | 2 | 3): void;
  syncTarget(currentTarget: THREE.Object3D | null): void;
  closePicker(): void;
}

// Gắn logic pha chế 7 bước và phím chọn 1/2/3 cho từng trạm trong quán
export function createDrinkStations(
  stations: ShopStations,
  orderManager: OrderManager,
  bus: EventBus<GameEvents>,
  heldCupUi: HeldCupView,
  levelPickerUi: LevelPickerView,
): DrinkStationController {
  let heldCup: Cup | null = null;
  let activePicker: PickerSession | null = null;

  const toast = (message: string) => bus.emit('toast:show', { message });

  const syncCupUi = () => heldCupUi.render(heldCup);

  const closePicker = () => {
    if (!activePicker) return;
    activePicker = null;
    levelPickerUi.hide();
  };

  const openPicker = (
    stationTarget: THREE.Object3D,
    title: string,
    options: [string, string, string],
    onPick: (digit: 1 | 2 | 3) => void,
  ) => {
    activePicker = { stationTarget, onPick };
    levelPickerUi.show(title, options);
  };

  const requireUnsealedCup = (): Cup | null => {
    if (!heldCup) {
      toast('Hãy lấy ly ở kệ ly trước!');
      return null;
    }
    if (heldCup.sealed) {
      toast('Ly đã đậy nắp, không thể thêm nguyên liệu!');
      return null;
    }
    return heldCup;
  };

  const interactables: Interactable[] = [
    {
      target: stations.cupRack,
      label: () => (heldCup ? 'Kệ ly (đang cầm ly)' : 'Lấy ly'),
      onInteract() {
        if (heldCup) {
          toast('Bạn đang cầm 1 ly rồi! Bỏ vào thùng rác nếu muốn làm lại.');
          return;
        }
        heldCup = createEmptyCup();
        syncCupUi();
        toast('Đã lấy ly! Hãy chọn trà, đá, đường, topping rồi ép nắp.');
      },
    },
    {
      target: stations.teaMachine,
      label: 'Chọn trà nền (1/2/3)',
      onInteract() {
        const cup = requireUnsealedCup();
        if (!cup) return;
        openPicker(
          stations.teaMachine,
          'Chọn trà nền',
          ['Trà sữa truyền thống (30k)', 'Trà đào (35k)', 'Matcha latte (40k)'],
          (digit) => {
            cup.base = DRINK_BASE_LIST[digit - 1];
            syncCupUi();
            toast(`Đã rót ${DRINK_LABELS[cup.base]}`);
          },
        );
      },
    },
    {
      target: stations.fridge,
      label: 'Cho đá (1/2/3)',
      onInteract() {
        const cup = requireUnsealedCup();
        if (!cup) return;
        openPicker(
          stations.fridge,
          'Chọn lượng đá',
          ['0% đá', '50% đá', '100% đá'],
          (digit) => {
            cup.ice = LEVEL_PERCENT_LIST[digit - 1];
            syncCupUi();
            toast(`Đã cho ${cup.ice}% đá`);
          },
        );
      },
    },
    {
      target: stations.sugar,
      label: 'Cho đường (1/2/3)',
      onInteract() {
        const cup = requireUnsealedCup();
        if (!cup) return;
        openPicker(
          stations.sugar,
          'Chọn lượng đường',
          ['0% đường', '50% đường', '100% đường'],
          (digit) => {
            cup.sugar = LEVEL_PERCENT_LIST[digit - 1];
            syncCupUi();
            toast(`Đã cho ${cup.sugar}% đường`);
          },
        );
      },
    },
    {
      target: stations.topping,
      label: 'Cho topping (1/2/3)',
      onInteract() {
        const cup = requireUnsealedCup();
        if (!cup) return;
        openPicker(
          stations.topping,
          'Chọn topping',
          ['Không topping', 'Trân châu (+5k)', 'Thạch (+5k)'],
          (digit) => {
            cup.topping = TOPPING_LIST[digit - 1];
            syncCupUi();
            toast(`Đã chọn: ${TOPPING_LABELS[cup.topping]}`);
          },
        );
      },
    },
    {
      target: stations.sealer,
      label: () => {
        if (!heldCup || !heldCup.base) return 'Máy ép ly (cần trà nền)';
        return heldCup.sealed ? 'Máy ép ly (đã đậy nắp)' : 'Đậy nắp ly';
      },
      onInteract() {
        if (!heldCup) {
          toast('Hãy lấy ly trước!');
          return;
        }
        if (!heldCup.base) {
          toast('Cần chọn trà nền ở máy pha trà trước khi đậy nắp!');
          return;
        }
        if (heldCup.sealed) {
          toast('Ly này đã được đậy nắp rồi!');
          return;
        }
        heldCup.sealed = true;
        syncCupUi();
        toast('Đã đậy nắp ly! Mang ra quầy giao cho khách.');
      },
    },
    {
      target: stations.counter,
      label: () => {
        if (!heldCup) return 'Quầy giao đồ (chưa cầm ly)';
        return heldCup.sealed ? 'Giao ly cho khách' : 'Quầy giao đồ (cần đậy nắp)';
      },
      onInteract() {
        if (!heldCup) {
          toast('Bạn chưa cầm ly nào!');
          return;
        }
        if (!heldCup.sealed) {
          toast('Ly chưa đậy nắp! Hãy qua máy ép ly trước.');
          return;
        }
        if (orderManager.deliverCup(heldCup)) {
          heldCup = null;
          closePicker();
          syncCupUi();
        }
      },
    },
    {
      target: stations.trashCan,
      label: () => (heldCup ? 'Bỏ ly đang cầm' : 'Thùng rác'),
      onInteract() {
        if (!heldCup) {
          toast('Bạn đang tay không!');
          return;
        }
        heldCup = null;
        closePicker();
        syncCupUi();
        toast('Đã bỏ ly vào thùng rác!');
      },
    },
  ];

  syncCupUi();

  return {
    interactables,

    pickDigit(digit) {
      if (!activePicker) return;
      const handler = activePicker.onPick;
      closePicker();
      handler(digit);
    },

    syncTarget(currentTarget) {
      if (activePicker && currentTarget !== activePicker.stationTarget) {
        closePicker();
      }
    },

    closePicker,
  };
}
