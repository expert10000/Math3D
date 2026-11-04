import { describe, expect, it } from "vitest";
import { scientificFieldColor, scientificFieldRange } from "./scientificFieldTransfer";

describe("scientific field display transfer", () => {
  it("shows constant verified samples at the midpoint and does not alter them", () => {
    const values = Object.freeze([7, 7, 7]);
    const range = scientificFieldRange(values, { mode: "data" });
    expect(range).toMatchObject({ min: 7, max: 7, constant: true, below: 0, above: 0 });
    expect(scientificFieldColor(7, range)).toEqual([140, 215, 133]);
    expect(values).toEqual([7, 7, 7]);
  });

  it("clips extreme outliers only in the color mapping", () => {
    const values = Object.freeze([-1000, ...Array.from({ length: 98 }, (_, index) => index), 1000]);
    const range = scientificFieldRange(values, { mode: "percentile" });
    expect(range).toMatchObject({ dataMin: -1000, dataMax: 1000, min: 0, max: 97,
      below: 1, above: 1, constant: false });
    expect(scientificFieldColor(-1000, range)).toEqual(scientificFieldColor(0, range));
    expect(scientificFieldColor(1000, range)).toEqual(scientificFieldColor(97, range));
    expect(values[0]).toBe(-1000);
    expect(values.at(-1)).toBe(1000);
  });

  it("validates manual bounds and distinguishes a constant source from clipped values", () => {
    expect(() => scientificFieldRange([1, 2], { mode: "manual", min: 2, max: 2 })).toThrow(/maximum/);
    const range = scientificFieldRange([7, 7], { mode: "manual", min: 0, max: 5 });
    expect(range).toMatchObject({ constant: true, below: 0, above: 2 });
    expect(scientificFieldColor(7, range)).toEqual([250, 80, 30]);
  });

  it("summarizes finite samples and centers a symmetric range without changing the source", () => {
    const values = Object.freeze([-4, -2, 0, 1, 2]);
    const range = scientificFieldRange(values, { mode: "symmetric" });
    expect(range).toMatchObject({ min: -4, max: 4, dataMin: -4, dataMax: 2,
      percentiles: { p02: -4, p50: 0, p98: 2 } });
    expect(range.histogram).toHaveLength(32);
    expect(range.histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(values.length);
    expect(values).toEqual([-4, -2, 0, 1, 2]);
    expect(() => scientificFieldRange([0, Number.NaN], { mode: "data" })).toThrow(/verified/);
  });
});
