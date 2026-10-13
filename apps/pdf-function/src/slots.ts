// Fixed set of reusable resources (LibreOffice slots). No waiting queue:
// /render answers BUSY when none is free, and the queue consumer never takes
// more messages than there are free slots.
export interface SlotPool<T> {
  free(): number;
  tryAcquire(): T | undefined;
  release(slot: T): void;
}

export function createSlotPool<T>(slots: T[]): SlotPool<T> {
  const idle = [...slots];
  return {
    free: () => idle.length,
    tryAcquire: () => idle.pop(),
    release: (slot) => {
      idle.push(slot);
    },
  };
}
