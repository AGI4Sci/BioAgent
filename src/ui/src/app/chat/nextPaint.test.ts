import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForNextPaint, type PaintScheduler } from './nextPaint';

test('waitForNextPaint resolves on the next animation frame', async () => {
  let frameCallback: ((timestamp: number) => void) | undefined;
  const scheduler: PaintScheduler = {
    requestAnimationFrame(callback) {
      frameCallback = callback;
      return 'frame-1';
    },
    cancelAnimationFrame() {},
    setTimeout() {
      return 'timer-1';
    },
    clearTimeout() {},
  };

  const resolved = waitForNextPaint(1000, scheduler).then(() => true);
  frameCallback?.(12);

  assert.equal(await resolved, true);
});

test('waitForNextPaint resolves from the timeout when frames are suspended', async () => {
  let timerCallback: (() => void) | undefined;
  const scheduler: PaintScheduler = {
    requestAnimationFrame() {
      return 'frame-1';
    },
    cancelAnimationFrame() {},
    setTimeout(callback) {
      timerCallback = callback;
      return 'timer-1';
    },
    clearTimeout() {},
  };

  const resolved = waitForNextPaint(1000, scheduler).then(() => true);
  timerCallback?.();

  assert.equal(await resolved, true);
});

test('waitForNextPaint resolves immediately without an animation-frame scheduler', async () => {
  assert.equal(await waitForNextPaint(1000, {}).then(() => true), true);
});
