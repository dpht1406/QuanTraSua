import {
  EVENT_FIRST_DELAY_RANGE,
  EVENT_NEXT_DELAY_RANGE,
  MAX_EVENTS_PER_SHIFT,
  POWER_OUTAGE_DURATION_RANGE,
  RUSH_HOUR_DURATION_SEC,
} from './constants.ts';
import type { EventBus } from './eventBus.ts';
import type { GameEvents, RandomEventType } from './gameState.ts';
import type { ShiftState } from './shift.ts';

export interface ActiveEventView {
  type: RandomEventType;
  remainingSec: number | null;
}

const ALL_EVENT_TYPES: readonly RandomEventType[] = [
  'picky_customer',
  'power_outage',
  'rush_hour',
];

function randomBetween(min: number, max: number, rng: () => number): number {
  return min + rng() * (max - min);
}

// Quản lý sự kiện ngẫu nhiên (tối đa 2/ca, không chồng nhau): Khách khó tính, Hết điện, Đông bất thường
export function createRandomEventManager(
  bus: EventBus<GameEvents>,
  rng: () => number = Math.random,
) {
  let eventsUsed = 0;
  const usedTypes = new Set<RandomEventType>();
  let nextEventTimerSec = randomBetween(
    EVENT_FIRST_DELAY_RANGE.minSec,
    EVENT_FIRST_DELAY_RANGE.maxSec,
    rng,
  );
  let active: {
    type: RandomEventType;
    remainingSec: number | null;
    pickySpawned: boolean;
  } | null = null;

  const scheduleNext = (range: { readonly minSec: number; readonly maxSec: number }) => {
    nextEventTimerSec = randomBetween(range.minSec, range.maxSec, rng);
  };

  const endActive = () => {
    if (!active) return;
    const endedType = active.type;
    active = null;
    scheduleNext(EVENT_NEXT_DELAY_RANGE);
    bus.emit('randomEventEnded', { type: endedType });
  };

  const startRandomEvent = () => {
    const candidates = ALL_EVENT_TYPES.filter((t) => !usedTypes.has(t));
    const pool = candidates.length > 0 ? candidates : ALL_EVENT_TYPES;
    const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    const type = pool[idx];

    eventsUsed += 1;
    usedTypes.add(type);

    if (type === 'power_outage') {
      active = {
        type,
        remainingSec: randomBetween(
          POWER_OUTAGE_DURATION_RANGE.minSec,
          POWER_OUTAGE_DURATION_RANGE.maxSec,
          rng,
        ),
        pickySpawned: false,
      };
    } else if (type === 'rush_hour') {
      active = {
        type,
        remainingSec: RUSH_HOUR_DURATION_SEC,
        pickySpawned: false,
      };
    } else {
      active = {
        type,
        remainingSec: null,
        pickySpawned: false,
      };
    }

    bus.emit('randomEventStarted', { type });
  };

  return {
    resetForShift(): void {
      endActive();
      eventsUsed = 0;
      usedTypes.clear();
      scheduleNext(EVENT_FIRST_DELAY_RANGE);
    },

    endForClosedShift(): void {
      endActive();
    },

    getEventsUsedCount(): number {
      return eventsUsed;
    },

    getActiveEvent(): ActiveEventView | null {
      return active ? { type: active.type, remainingSec: active.remainingSec } : null;
    },

    isPowerOutage(): boolean {
      return active?.type === 'power_outage';
    },

    isRushHour(): boolean {
      return active?.type === 'rush_hour';
    },

    getCustomerCooldownSpeed(): number {
      return active?.type === 'rush_hour' ? 2 : 1;
    },

    consumePickyForNextCustomer(): boolean {
      if (active?.type === 'picky_customer' && !active.pickySpawned) {
        active.pickySpawned = true;
        return true;
      }
      return false;
    },

    isPickyOrderActive(): boolean {
      return active?.type === 'picky_customer' && active.pickySpawned;
    },

    finishPickyCustomer(): void {
      if (active?.type === 'picky_customer' && active.pickySpawned) {
        endActive();
      }
    },

    update(dt: number, shiftState: ShiftState): void {
      if (active) {
        if (
          shiftState === 'closed' ||
          shiftState === 'summary' ||
          (active.type === 'picky_customer' && !active.pickySpawned && shiftState !== 'open')
        ) {
          endActive();
          return;
        }
        if (active.remainingSec !== null) {
          active.remainingSec -= dt;
          if (active.remainingSec <= 0) {
            endActive();
          }
        }
        return;
      }

      if (shiftState !== 'open' || eventsUsed >= MAX_EVENTS_PER_SHIFT) return;

      nextEventTimerSec -= dt;
      if (nextEventTimerSec <= 0) {
        startRandomEvent();
      }
    },
  };
}

export type RandomEventManager = ReturnType<typeof createRandomEventManager>;
