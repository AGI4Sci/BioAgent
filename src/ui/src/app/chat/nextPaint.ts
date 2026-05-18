export interface PaintScheduler {
  requestAnimationFrame?: (callback: (timestamp: number) => void) => unknown;
  cancelAnimationFrame?: (handle: unknown) => void;
  setTimeout?: (callback: () => void, timeoutMs: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export function waitForNextPaint(timeoutMs = 250, scheduler: PaintScheduler = globalThis as PaintScheduler): Promise<void> {
  return new Promise((resolve) => {
    const requestAnimationFrame = scheduler.requestAnimationFrame?.bind(scheduler);
    if (!requestAnimationFrame) {
      resolve();
      return;
    }

    const setTimer = scheduler.setTimeout?.bind(scheduler);
    const clearTimer = scheduler.clearTimeout?.bind(scheduler);
    const cancelFrame = scheduler.cancelAnimationFrame?.bind(scheduler);
    let settled = false;
    let frameHandle: unknown;
    let timerHandle: unknown;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timerHandle !== undefined) clearTimer?.(timerHandle);
      if (frameHandle !== undefined) cancelFrame?.(frameHandle);
      resolve();
    };

    if (timeoutMs > 0 && setTimer) {
      timerHandle = setTimer(finish, timeoutMs);
    }
    frameHandle = requestAnimationFrame(() => finish());
  });
}
