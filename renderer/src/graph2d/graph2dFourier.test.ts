import { describe, expect, it } from "vitest";
import { analyzeGraph2DFourier, applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createGraph2DDocument, graph2DFourierCsv, Graph2DPointTableStore, graph2DPointDomain,
  isGraph2DFourierCurrent, type Graph2DPointRow } from "@math3d/core";

const dataset = (values: readonly (number | null)[], xs = values.map((_, i) => i / 128)) => {
  const rows: Graph2DPointRow[] = values.map((y, i) => ({ id: `row_${i + 1}`, x: xs[i]!, y }));
  const table = new Graph2DPointTableStore().publish(rows);
  const source = applyGraph2DAuthoring(createEmptyGraph2DDocument("fourier-test"), { type: "create-point-series",
    draft: { label: "Signal", table, domain: graph2DPointDomain(rows), mode: "line",
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
  const document = createGraph2DDocument({ ...source, stableKey: "fourier-test" });
  return { document, rows, objectId: document.source.objects[0]!.id };
};
const options = { window: "rectangular" as const, normalization: "peak" as const,
  detrend: "mean" as const, xUnit: "s" };

describe("GRA-16 checked Fourier spectrum", () => {
  it("recovers a known tone with amplitude, phase, frequency units and source lineage", () => {
    const values = Array.from({ length: 128 }, (_, i) => 1.3 + 2.5 * Math.cos(2 * Math.PI * 8 * i / 128 + .4));
    const input = dataset(values), spectrum = analyzeGraph2DFourier({ ...input, options });
    expect(spectrum.sampleRate).toBeCloseTo(128, 10);
    expect(spectrum.nyquist).toBeCloseTo(64, 10);
    expect(spectrum.bins[8]!.frequency).toBeCloseTo(8, 10);
    expect(spectrum.bins[8]!.amplitude).toBeCloseTo(2.5, 10);
    expect(spectrum.bins[8]!.phaseRadians).toBeCloseTo(.4, 10);
    expect(spectrum.bins[0]!.amplitude).toBeLessThan(1e-10);
    expect(spectrum.frequencyUnit).toBe("cycles/s");
    expect(spectrum.publication.summary.datasetChecksum).toBe(spectrum.table.checksum);
    expect(isGraph2DFourierCurrent(spectrum, input.document)).toBe(true);
    expect(graph2DFourierCsv(spectrum)).toContain(`datasetChecksum=${spectrum.table.checksum}`);
  });

  it("handles Nyquist and RMS normalization without doubling the endpoint", () => {
    const values = Array.from({ length: 128 }, (_, i) => 1.7 * (i % 2 ? -1 : 1));
    const input = dataset(values), spectrum = analyzeGraph2DFourier({ ...input,
      options: { ...options, normalization: "rms", detrend: "none" } });
    expect(spectrum.bins[64]!.amplitude).toBeCloseTo(1.7, 10);
    expect(spectrum.bins[64]!.frequency).toBeCloseTo(spectrum.nyquist, 10);
    expect(spectrum.bins[63]!.amplitude).toBeLessThan(1e-10);
  });

  it("Hann suppresses distant leakage from an off-bin tone and reports zero padding", () => {
    const values = Array.from({ length: 100 }, (_, i) => Math.cos(2 * Math.PI * 8.25 * i / 128));
    const input = dataset(values);
    const rectangular = analyzeGraph2DFourier({ ...input, options });
    const hann = analyzeGraph2DFourier({ ...input, options: { ...options, window: "hann" } });
    expect(hann.fftLength).toBe(128);
    expect(hann.coherentGain).toBeCloseTo(.495, 10);
    expect(hann.bins[30]!.amplitude).toBeLessThan(rectangular.bins[30]!.amplitude);
    expect(hann.publication.warnings.join(" ")).toMatch(/zero padding/i);
  });

  it("rejects missing, irregular, duplicate and changed source rows", () => {
    const values = Array.from({ length: 16 }, (_, i) => Math.sin(i));
    const regular = dataset(values);
    expect(() => analyzeGraph2DFourier({ ...regular,
      rows: regular.rows.map((row, i) => i === 2 ? { ...row, y: null } : row), options })).toThrow(/checksum/i);
    const missing = dataset(values.map((value, i) => i === 2 ? null : value));
    expect(() => analyzeGraph2DFourier({ ...missing, options })).toThrow(/missing samples/i);
    const irregular = dataset(values, values.map((_, i) => i === 8 ? 8.1 / 128 : i / 128));
    expect(() => analyzeGraph2DFourier({ ...irregular, options })).toThrow(/irregular x spacing/i);
    const duplicate = dataset(values, values.map((_, i) => i === 8 ? 7 / 128 : i / 128));
    expect(() => analyzeGraph2DFourier({ ...duplicate, options })).toThrow(/irregular x spacing/i);
  });
});
