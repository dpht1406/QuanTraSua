import type * as THREE from 'three';
import type { Interactable } from '../interaction/interactionSystem.ts';
import type { CleanlinessStore } from '../state/cleanliness.ts';
import { INVENTORY_CONFIG, TRASH_FULL_CUPS } from '../state/constants.ts';
import type { EventBus } from '../state/eventBus.ts';
import type { GameEvents } from '../state/gameState.ts';
import type { createInventoryStore, InventoryItem } from '../state/inventory.ts';
import {
  DRINK_BASE_LIST,
  DRINK_LABELS,
  LEVEL_PERCENT_LIST,
  TOPPING_LABELS,
  TOPPING_LIST,
} from '../state/menu.ts';
import {
  applyCupStep,
  createEmptyCup,
  type Cup,
  type CupStep,
  type CupStepValue,
} from '../state/scoring.ts';
import type { ShiftState } from '../state/shift.ts';
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
  clearHeldCup(): void;
  hasHeldCup(): boolean;
}

// Gắn logic pha chế 7 bước, sửa trừ nguyên liệu 1 lần/bước và kết nối thùng rác đầy
export function createDrinkStations(
  stations: ShopStations,
  orderManager: OrderManager,
  inventory: ReturnType<typeof createInventoryStore>,
  cleanliness: CleanlinessStore,
  onTrashChanged: () => void,
  getShiftState: () => ShiftState,
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

  const requireActiveShift = (): boolean => {
    const s = getShiftState();
    if (s === 'open' || s === 'closing') return true;
    toast('Quán đang đóng cửa! Ra cửa bấm E để mở ca.');
    return false;
  };

  const tryConsume = (item: InventoryItem): boolean => {
    if (inventory.consume(item)) return true;
    toast(`Hết ${INVENTORY_CONFIG[item].label}, cần nhập thêm`);
    return false;
  };

  const requireUnsealedCup = (): Cup | null => {
    if (!requireActiveShift()) return null;
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

  const pickStep = <K extends CupStep>(cup: Cup, step: K, val: CupStepValue[K], msg: string) => {
    const res = applyCupStep(cup, step, val, (item) => inventory.consume(item));
    if (!res.ok && res.missingItem) {
      toast(`Hết ${INVENTORY_CONFIG[res.missingItem].label}, cần nhập thêm`);
      return;
    }
    syncCupUi();
    toast(msg);
  };

  const interactables: Interactable[] = [
    {
      target: stations.cupRack,
      label: () => {
        if (orderManager.isOrderLocked()) return 'Kệ ly (nhân viên đang pha đơn)';
        return heldCup ? 'Kệ ly (đang cầm ly)' : `Lấy ly (còn ${inventory.getCount('cup')})`;
      },
      onInteract() {
        if (!requireActiveShift()) return;
        if (orderManager.isOrderLocked()) {
          toast('Nhân viên đang pha đơn hiện tại rồi!');
          return;
        }
        if (heldCup) {
          toast('Bạn đang cầm 1 ly rồi! Bỏ vào thùng rác nếu muốn làm lại.');
          return;
        }
        if (!tryConsume('cup')) return;
        heldCup = createEmptyCup();
        syncCupUi();
        toast('Đã lấy ly! Chọn trà, đá, đường, topping rồi ép nắp.');
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
          [
            `Trà sữa (${inventory.getCount('traditional')})`,
            `Trà đào (${inventory.getCount('peach')})`,
            `Matcha (${inventory.getCount('matcha')})`,
          ],
          (digit) => {
            const base = DRINK_BASE_LIST[digit - 1];
            pickStep(cup, 'base', base, `Đã rót ${DRINK_LABELS[base]}`);
          },
        );
      },
    },
    {
      target: stations.fridge,
      label: () => `Cho đá (còn ${inventory.getCount('ice')})`,
      onInteract() {
        const cup = requireUnsealedCup();
        if (!cup) return;
        openPicker(stations.fridge, 'Chọn lượng đá', ['0% đá', '50% đá', '100% đá'], (digit) => {
          const ice = LEVEL_PERCENT_LIST[digit - 1];
          pickStep(cup, 'ice', ice, `Đã cho ${ice}% đá`);
        });
      },
    },
    {
      target: stations.sugar,
      label: () => `Cho đường (còn ${inventory.getCount('sugar')})`,
      onInteract() {
        const cup = requireUnsealedCup();
        if (!cup) return;
        openPicker(stations.sugar, 'Chọn lượng đường', ['0% đường', '50% đường', '100% đường'], (digit) => {
          const sugar = LEVEL_PERCENT_LIST[digit - 1];
          pickStep(cup, 'sugar', sugar, `Đã cho ${sugar}% đường`);
        });
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
          [
            'Không topping',
            `Trân châu (${inventory.getCount('pearl')})`,
            `Thạch (${inventory.getCount('jelly')})`,
          ],
          (digit) => {
            const topping = TOPPING_LIST[digit - 1];
            pickStep(cup, 'topping', topping, `Đã chọn: ${TOPPING_LABELS[topping]}`);
          },
        );
      },
    },
    {
      target: stations.sealer,
      label: () => {
        if (!heldCup || !heldCup.base) return 'Máy ép ly (cần trà nền)';
        return heldCup.sealed ? 'Máy ép ly (đã đậy nắp)' : `Đậy nắp ly (còn ${inventory.getCount('lid')})`;
      },
      onInteract() {
        if (!requireActiveShift()) return;
        if (!heldCup) return toast('Hãy lấy ly trước!');
        if (!heldCup.base) return toast('Cần chọn trà nền trước khi đậy nắp!');
        if (heldCup.sealed) return toast('Ly này đã được đậy nắp rồi!');
        if (!tryConsume('lid')) return;
        heldCup.sealed = true;
        syncCupUi();
        toast('Đã đậy nắp ly! Mang ra quầy giao cho khách.');
      },
    },
    {
      target: stations.counter,
      label: () => {
        if (orderManager.isOrderLocked()) return 'Quầy giao đồ (nhân viên đang pha)';
        if (!heldCup) return 'Quầy giao đồ (chưa cầm ly)';
        return heldCup.sealed ? 'Giao ly cho khách' : 'Quầy giao đồ (cần đậy nắp)';
      },
      onInteract() {
        if (!requireActiveShift()) return;
        if (!heldCup) return toast('Bạn chưa cầm ly nào!');
        if (!heldCup.sealed) return toast('Ly chưa đậy nắp! Hãy qua máy ép ly trước.');
        if (orderManager.deliverCup(heldCup)) {
          heldCup = null;
          closePicker();
          syncCupUi();
        }
      },
    },
    {
      target: stations.trashCan,
      label: () => {
        if (cleanliness.isTrashFull()) return 'Đổ thùng rác đầy';
        return heldCup ? 'Bỏ ly đang cầm' : `Thùng rác (${cleanliness.getTrashCups()}/${TRASH_FULL_CUPS})`;
      },
      onInteract() {
        if (cleanliness.isTrashFull()) {
          cleanliness.emptyTrash();
          onTrashChanged();
          toast('Đã đổ thùng rác sạch sẽ!');
          return;
        }
        if (!heldCup) return toast('Bạn đang tay không!');
        heldCup = null;
        closePicker();
        syncCupUi();
        const res = cleanliness.recordTrashCup();
        onTrashChanged();
        if (res.becameFull) toast('Thùng rác đã đầy! Nhấn E để đổ rác.');
        else if (res.spilled) toast('Ối, làm đổ vết bẩn cạnh thùng rác!');
        else toast('Đã bỏ ly vào thùng rác!');
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
      if (activePicker && currentTarget !== activePicker.stationTarget) closePicker();
    },
    closePicker,
    clearHeldCup() {
      heldCup = null;
      closePicker();
      syncCupUi();
    },
    hasHeldCup: () => heldCup !== null,
  };
}
