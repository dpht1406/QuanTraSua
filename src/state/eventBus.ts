export type EventHandler<T> = (payload: T) => void;

export interface EventBus<TEvents extends Record<string, unknown>> {
  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): () => void;
  off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void;
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void;
}

// Tạo event bus đơn giản hỗ trợ đăng ký, hủy đăng ký và phát sự kiện
export function createEventBus<TEvents extends Record<string, unknown>>(): EventBus<TEvents> {
  const listeners = new Map<keyof TEvents, Set<EventHandler<never>>>();

  return {
    on(event, handler) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler as EventHandler<never>);
      return () => this.off(event, handler);
    },

    off(event, handler) {
      listeners.get(event)?.delete(handler as EventHandler<never>);
    },

    emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      for (const handler of set) {
        (handler as EventHandler<typeof payload>)(payload);
      }
    },
  };
}
