import { describe, expect, it } from "vitest";
import { startViewerAnimationLoop } from "./viewerAnimationLoop";

describe("viewer animation lifetime", () => {
  it("releases a scene even if a cancelled frame callback fires late", () => {
    const pending: FrameRequestCallback[] = [];
    const cancelled: number[] = [];
    const schedule = (callback: FrameRequestCallback) => {
      pending.push(callback);
      return pending.length;
    };
    let renders = 0;
    const stop = startViewerAnimationLoop(() => { renders++; }, schedule, id => cancelled.push(id));
    expect(renders).toBe(1);
    pending[0]!(0);
    expect(renders).toBe(2);
    stop();
    expect(cancelled).toEqual([2]);
    pending[1]!(16);
    expect(renders).toBe(2);
    expect(pending).toHaveLength(2);
  });
});
