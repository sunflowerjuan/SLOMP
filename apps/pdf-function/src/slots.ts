// Fixed set of reusable resources (LibreOffice slots). No waiting queue:
// /render answers BUSY when none is free, and the queue consumer never takes
// more messages than there are free slots.
export interface SlotPool<T> {
  readonly size: number;
  free(): number;
  tryAcquire(): T | undefined;
  release(slot: T): void;
  all(): readonly T[];
}

export function createSlotPool<T>(slots: T[]): SlotPool<T> {
  const idle = [...slots];
  return {
    size: slots.length,
    free: () => idle.length,
    tryAcquire: () => idle.pop(),
    release: (slot) => {
      idle.push(slot);
    },
    all: () => slots,
  };
}
