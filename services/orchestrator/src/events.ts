export type Listener<T> = (payload: T) => void

/** Tiny synchronous emitter. Listener errors are contained, never thrown at the poll loop. */
export class Emitter<Events extends Record<string, unknown>> {
  #listeners = new Map<keyof Events, Set<Listener<never>>>()

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.#listeners.get(event)
    if (!set) {
      set = new Set()
      this.#listeners.set(event, set)
    }
    set.add(listener as Listener<never>)
    return () => {
      set!.delete(listener as Listener<never>)
    }
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.#listeners.get(event)?.delete(listener as Listener<never>)
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.#listeners.get(event)
    if (!set) return
    for (const listener of [...set]) {
      try {
        ;(listener as Listener<Events[K]>)(payload)
      } catch {
        // A broken SSE client must never stop the daemon.
      }
    }
  }
}
