import { PICKY_REP_MULTIPLIER, REP_DEBT_QUIT_PENALTY } from '../state/constants.ts';
import { createRandomEventManager, type ActiveEventView } from '../state/events.ts';
import { gameStore, type RandomEventType } from '../state/gameState.ts';
import { getOrderPrice } from '../state/menu.ts';
import { createComplaintController, createReputationStore } from '../state/reputation.ts';
import type { ShiftState } from '../state/shift.ts';
import type { StaffStore } from '../state/staff.ts';
import { createComplaintPopup } from '../ui/complaintPopup.ts';
import type { HudController } from '../ui/hud.ts';
import type { OrderManagerHooks } from './orderManager.ts';
import type { ShiftManagerHooks } from './shiftManager.ts';

const EVENT_TOASTS: Record<RandomEventType, string> = {
  picky_customer: '🧐 Khách khó tính sắp tới! Thưởng/phạt uy tín x2.',
  power_outage: '⚡ Mất điện! Các trạm pha chế tạm ngưng.',
  rush_hour: '🔥 Đông bất thường! Khách đến dày gấp đôi.',
};

// Kết nối uy tín, phản hồi phàn nàn, sự kiện ngẫu nhiên và giao diện HUD liên quan
export function createShopEventsBridge(
  app: HTMLElement,
  hud: HudController,
  staffStore: StaffStore,
  setDimmed: (dimmed: boolean) => void,
  closeDrinkPicker: () => void,
) {
  const randomEvents = createRandomEventManager(gameStore.bus);
  const reputation = createReputationStore(gameStore.bus, {
    initialValue: gameStore.getState().reputation,
    initialCleanliness: gameStore.getState().cleanliness,
    onSync: (value) => gameStore.updateState({ reputation: value }),
    getOrderMultiplier: () => (randomEvents.isPickyOrderActive() ? PICKY_REP_MULTIPLIER : 1),
  });
  const complaint = createComplaintController(gameStore.bus, {
    trySpendMoney: (amount) => {
      const prev = gameStore.getState().money;
      if (prev < amount) return false;
      gameStore.updateState({ money: prev - amount });
      return true;
    },
    adjustReputation: (delta, reason) => reputation.adjust(delta, reason),
  });
  const complaintPopup = createComplaintPopup(app);

  const toast = (message: string) => gameStore.bus.emit('toast:show', { message });

  gameStore.bus.on('shiftOpened', () => randomEvents.resetForShift());
  gameStore.bus.on('randomEventStarted', ({ type }) => {
    if (type === 'power_outage') {
      setDimmed(true);
      closeDrinkPicker();
    }
    toast(EVENT_TOASTS[type]);
  });
  gameStore.bus.on('randomEventEnded', ({ type }) => {
    if (type === 'power_outage') {
      setDimmed(false);
      toast('💡 Đã có điện trở lại!');
    } else if (type === 'rush_hour') {
      toast('Giờ đông bất thường đã kết thúc.');
    }
    hud.setEventBanner(null);
  });

  const formatBanner = (
    ev: ActiveEventView | null,
    activeOrder: { remainingSec: number; isPicky: boolean } | null,
  ): string | null => {
    if (!ev) return null;
    if (ev.type === 'picky_customer') {
      return activeOrder?.isPicky
        ? `🧐 Khách khó tính (${Math.ceil(activeOrder.remainingSec)}s)`
        : '🧐 Khách khó tính sắp tới!';
    }
    const prefix = ev.type === 'power_outage' ? '⚡ Hết điện' : '🔥 Đông bất thường x2';
    return `${prefix} (${Math.max(1, Math.ceil(ev.remainingSec ?? 0))}s)`;
  };

  return {
    isPowerOutage: () => randomEvents.isPowerOutage(),

    getDrinkBlockReason(isMakingStation: boolean): string | null {
      if (complaint.isOpen()) return 'Hãy phản hồi phàn nàn của khách (1/2/3)!';
      if (isMakingStation && randomEvents.isPowerOutage()) {
        return 'Đang mất điện, trạm pha chế tạm ngưng!';
      }
      return null;
    },

    getOrderHooks(): OrderManagerHooks {
      return {
        getCooldownSpeed: () => randomEvents.getCustomerCooldownSpeed(),
        consumePicky: () => randomEvents.consumePickyForNextCustomer(),
        onPickyFinished: () => randomEvents.finishPickyCustomer(),
        onGreetWindow: (sec) => hud.setGreetHint(sec),
        onGreetSuccess: () => {
          reputation.recordGreet();
          toast('Đã chào khách! (+1 uy tín)');
        },
        onOrderDelivered: (order, score, payout, complaintBonus = 0) => {
          if (complaint.maybeTrigger(score.total, payout, getOrderPrice(order), complaintBonus)) {
            closeDrinkPicker();
            complaintPopup.sync(complaint.getActive());
          }
        },
      };
    },

    getShiftHooks(): ShiftManagerHooks {
      return {
        getReputationDelta: () => reputation.getShiftDelta(),
        onDebtExceeded: () => {
          const quit = staffStore.quitHighestPaid('Nợ lương vượt ngưỡng');
          if (!quit) return undefined;
          reputation.adjust(-REP_DEBT_QUIT_PENALTY, `${quit.name} nghỉ việc vì nợ lương`);
          toast(`${quit.name} tự nghỉ việc vì nợ lương!`);
          return quit.name;
        },
        onShiftEnded: () => {
          randomEvents.endForClosedShift();
          complaint.clear();
          complaintPopup.sync(null);
          hud.setEventBanner(null);
          hud.setGreetHint(null);
        },
      };
    },

    handleDigit(digit: 1 | 2 | 3): boolean {
      if (!complaint.isOpen()) return false;
      const res = complaint.pickDigit(digit);
      if (!res.ok && res.message) toast(res.message);
      complaintPopup.sync(complaint.getActive());
      return true;
    },

    update(
      dt: number,
      shiftState: ShiftState,
      activeOrder: { remainingSec: number; isPicky: boolean } | null,
    ) {
      reputation.update(dt, shiftState);
      randomEvents.update(dt, shiftState);
      if (complaint.update(dt)) {
        toast('Hết giờ phản hồi: coi như Bỏ qua!');
      }
      complaintPopup.sync(complaint.getActive());
      hud.setEventBanner(formatBanner(randomEvents.getActiveEvent(), activeOrder));
    },
  };
}
