import { createEventBus } from '../state/eventBus.ts';
import type { HandId } from '../state/hands.ts';

export type HandPhase = 'down' | 'up';

type HandInputEvents = {
  use: { hand: HandId; phase: HandPhase };
  throwKey: { hand: HandId; phase: HandPhase };
  pourBack: undefined;
};

const bus = createEventBus<HandInputEvents>();

export function emitHandUse(hand: HandId, phase: HandPhase): void {
  bus.emit('use', { hand, phase });
}

export function onHandUse(cb: (hand: HandId, phase: HandPhase) => void): () => void {
  return bus.on('use', ({ hand, phase }) => cb(hand, phase));
}

export function emitHandThrowKey(hand: HandId, phase: HandPhase): void {
  bus.emit('throwKey', { hand, phase });
}

export function onHandThrowKey(cb: (hand: HandId, phase: HandPhase) => void): () => void {
  return bus.on('throwKey', ({ hand, phase }) => cb(hand, phase));
}

export function emitPourBackKey(): void {
  bus.emit('pourBack', undefined);
}

export function onPourBackKey(cb: () => void): () => void {
  return bus.on('pourBack', () => cb());
}
