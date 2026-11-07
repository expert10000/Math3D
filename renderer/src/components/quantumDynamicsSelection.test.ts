import { describe, expect, it } from "vitest";
import { nearestRecordedFrame } from "./quantumDynamicsSelection";

describe("recorded dynamics selection", () => {
  it("selects the nearest exact irregular time sample and clamps endpoints", () => {
    const frames = [{ frameId: "a", time: 0 }, { frameId: "b", time: 0.1 }, { frameId: "c", time: 1 }];
    expect(nearestRecordedFrame(frames, 0.08)).toBe(1);
    expect(nearestRecordedFrame(frames, 0.6)).toBe(2);
    expect(nearestRecordedFrame(frames, -2)).toBe(0);
    expect(nearestRecordedFrame(frames, 2)).toBe(2);
  });
  it("refuses an empty recording", () => expect(() => nearestRecordedFrame([], 0.5)).toThrow());
});
