import { describe, expect, it } from "vitest";
import { configureOrbitControlsForTouch, createViewerTouchGestureTracker } from "./viewerTouchGestures";

describe("viewerTouchGestures", () => {
  it("detects a touch double tap without firing for single taps", () => {
    let clock = 1000;
    const fired: string[] = [];
    const tracker = createViewerTouchGestureTracker({
      now: () => clock,
      setTimeout: () => 1,
      clearTimeout: () => undefined,
      onDoubleTap: () => fired.push("double"),
    });

    tracker.down({ pointerId: 1, pointerType: "touch", clientX: 10, clientY: 20 });
    clock += 80;
    tracker.up({ pointerId: 1, pointerType: "touch", clientX: 10, clientY: 20 });
    expect(fired).toEqual([]);

    clock += 160;
    tracker.down({ pointerId: 2, pointerType: "touch", clientX: 18, clientY: 25 });
    clock += 70;
    tracker.up({ pointerId: 2, pointerType: "touch", clientX: 18, clientY: 25 });
    expect(fired).toEqual(["double"]);
  });

  it("ignores double taps after movement or multi-touch", () => {
    let clock = 2000;
    const fired: string[] = [];
    const tracker = createViewerTouchGestureTracker({
      now: () => clock,
      setTimeout: () => 1,
      clearTimeout: () => undefined,
      onDoubleTap: () => fired.push("double"),
    });

    tracker.down({ pointerId: 1, pointerType: "touch", clientX: 10, clientY: 20 });
    tracker.move({ pointerId: 1, pointerType: "touch", clientX: 40, clientY: 20 });
    clock += 80;
    tracker.up({ pointerId: 1, pointerType: "touch", clientX: 40, clientY: 20 });

    clock += 120;
    tracker.down({ pointerId: 2, pointerType: "touch", clientX: 10, clientY: 20 });
    tracker.down({ pointerId: 3, pointerType: "touch", clientX: 40, clientY: 20 });
    clock += 80;
    tracker.up({ pointerId: 2, pointerType: "touch", clientX: 10, clientY: 20 });
    tracker.up({ pointerId: 3, pointerType: "touch", clientX: 40, clientY: 20 });

    expect(fired).toEqual([]);
  });

  it("fires long press only while the touch stays still", () => {
    let timeout: (() => void) | null = null;
    const fired: Array<[number, number]> = [];
    const tracker = createViewerTouchGestureTracker({
      now: () => 3000,
      setTimeout: (handler) => {
        timeout = handler;
        return 1;
      },
      clearTimeout: () => {
        timeout = null;
      },
      onLongPress: (event) => fired.push([event.clientX, event.clientY]),
    });

    tracker.down({ pointerId: 1, pointerType: "touch", clientX: 12, clientY: 24 });
    timeout?.();
    expect(fired).toEqual([[12, 24]]);

    tracker.cancel();
    tracker.down({ pointerId: 2, pointerType: "touch", clientX: 12, clientY: 24 });
    tracker.move({ pointerId: 2, pointerType: "touch", clientX: 80, clientY: 24 });
    timeout?.();
    expect(fired).toEqual([[12, 24]]);
  });

  it("sets explicit orbit touch controls", () => {
    const controls: { touches?: Record<string, unknown>; screenSpacePanning?: boolean } = {};
    configureOrbitControlsForTouch(controls);
    expect(controls.touches?.ONE).toBeDefined();
    expect(controls.touches?.TWO).toBeDefined();
    expect(controls.screenSpacePanning).toBe(true);
  });
});
