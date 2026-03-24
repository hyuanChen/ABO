/** Lightweight typed event bus for cross-module communication. */

type EventMap = {
  "energy-change": { current: number; max: number };
  "xp-gain": { skill: string; xp: number };
  "vault-change": { changedPath: string };
};

type Listener<T> = (payload: T) => void;

class EventBus {
  private listeners = new Map<string, Set<Listener<unknown>>>();

  on<K extends keyof EventMap>(event: K, cb: Listener<EventMap[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb as Listener<unknown>);
    return () => this.listeners.get(event)?.delete(cb as Listener<unknown>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }
}

export const events = new EventBus();
