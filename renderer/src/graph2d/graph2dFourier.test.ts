import { describe, expect, it } from "vitest";
import { analyzeGraph2DFourier, analyzeGraph2DMultiChannelFourier, applyGraph2DAuthoring,
  createEmptyGraph2DDocument, createGraph2DDocument, graph2DFourierCsv, graph2DMultiChannelFourierCsv,
  Graph2DPointTableStore, graph2DPointDomain, isGraph2DFourierCurrent,
  isGraph2DMultiChannelFourierCurrent, type Graph2DPointRow,
  type Graph2DScientificDatasetOrigin } from "@math3d/core";

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
const origin = (component: string, xUnit = "s", yUnit = "V"): Graph2DScientificDatasetOrigin => ({
  schema: "scientific-scene/v1", sceneId: "signals", datasetId: "channels", component,
  sceneFingerprint: "a".repeat(64), resourceSha256: "b".repeat(64), sourceProducer: "tests",
  sourceId: "source", sourceSchema: "test/v1", sourceSha256: "c".repeat(64),
  xName: "time", xUnit, yName: component, yUnit,
});
const channelSet = (channels: readonly Readonly<{ label: string; values: readonly (number | null)[];
  xs?: readonly number[]; origin?: Graph2DScientificDatasetOrigin }>[]) => {
  let source = createEmptyGraph2DDocument("fourier-channels");
  const tables = channels.map(channel => {
    const rows: Graph2DPointRow[] = channel.values.map((y, index) => ({ id: `row_${index + 1}`,
      x: channel.xs?.[index] ?? index / 128, y }));
    const table = new Graph2DPointTableStore().publish(rows);
    source = applyGraph2DAuthoring(source, { type: "create-point-series", draft: {
      label: channel.label, table, domain: graph2DPointDomain(rows), mode: "line",
      ...(channel.origin ? { origin: channel.origin } : {}),
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true },
    } });
    return rows;
  });
  const document = createGraph2DDocument({ ...source, stableKey: "fourier-channels" });
  return { document, channels: tables.map((rows, index) => ({ objectId: document.source.objects[index]!.id, rows })) };
};

describe("GRA-16 checked Fourier spectrum", () => {
  it("uses every checked sample within its independent row cap and refuses a smaller cap", () => {
    const values = Array.from({ length: 128 }, (_, i) => Math.cos(2 * Math.PI * 8 * i / 128));
    const input = dataset(values);
    expect(() => analyzeGraph2DFourier({ ...input, options, maxRows: 64 })).toThrow(/128 checked rows.*No rows were omitted/);
    expect(() => analyzeGraph2DFourier({ ...input, options, maxRows: 10001 })).toThrow(/row budget/);
    const capped = analyzeGraph2DFourier({ ...input, options, maxRows: 128 });
    const uncapped = analyzeGraph2DFourier({ ...input, options });
    expect(capped.resultId).toBe(uncapped.resultId);
    expect(capped.bins).toEqual(uncapped.bins);
  });
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

describe("GRA-16 aligned multi-channel Fourier", () => {
  it("keeps distinct known tones and checksums in separate spectra and one export", () => {
    const one = Array.from({ length: 128 }, (_, i) => 2 * Math.cos(2 * Math.PI * 8 * i / 128));
    const two = Array.from({ length: 128 }, (_, i) => 3 * Math.cos(2 * Math.PI * 12 * i / 128));
    const input = channelSet([{ label: "east", values: one, origin: origin("east") },
      { label: "north", values: two, origin: origin("north") }]);
    const result = analyzeGraph2DMultiChannelFourier({ ...input, options });
    expect(result.channels).toHaveLength(2);
    expect(result.channels[0]!.spectrum.bins[8]!.amplitude).toBeCloseTo(2, 10);
    expect(result.channels[1]!.spectrum.bins[12]!.amplitude).toBeCloseTo(3, 10);
    expect(result.channels[0]!.spectrum.table.checksum).not.toBe(result.channels[1]!.spectrum.table.checksum);
    expect(result.channels.map(channel => channel.origin?.component)).toEqual(["east", "north"]);
    expect(isGraph2DMultiChannelFourierCurrent(result, input.document)).toBe(true);
    const csv = graph2DMultiChannelFourierCsv(result);
    expect(csv).toContain("frequency,channel_1_amplitude,channel_1_phaseRadians,channel_2_amplitude,channel_2_phaseRadians");
    expect(csv).toContain(result.channels[0]!.spectrum.table.checksum);
    expect(csv).toContain(result.channels[1]!.spectrum.table.checksum);
    expect(csv).toContain(`resource=${origin("east").resourceSha256}`);
    const revisedRows = input.channels[1]!.rows.map((row, index) => index === 3 ? { ...row, y: row.y! + .25 } : row);
    const revisedSource = applyGraph2DAuthoring(input.document, { type: "edit-point-series",
      objectId: input.channels[1]!.objectId, draft: { label: "north",
        table: new Graph2DPointTableStore().publish(revisedRows), domain: graph2DPointDomain(revisedRows),
        mode: "line", origin: origin("north"),
        style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
    const revisedDocument = createGraph2DDocument({ ...revisedSource, stableKey: "fourier-channels" });
    expect(isGraph2DMultiChannelFourierCurrent(result, revisedDocument)).toBe(false);
  });

  it("rejects a missing row, shifted grid, changed sidecar and unverified source", () => {
    const tone = Array.from({ length: 32 }, (_, i) => Math.sin(2 * Math.PI * i / 32));
    const missing = channelSet([{ label: "one", values: tone },
      { label: "two", values: tone.map((value, index) => index === 7 ? null : value) }]);
    expect(() => analyzeGraph2DMultiChannelFourier({ ...missing, options })).toThrow(/missing samples/i);
    const short = channelSet([{ label: "one", values: tone }, { label: "two", values: tone.slice(0, -1) }]);
    expect(() => analyzeGraph2DMultiChannelFourier({ ...short, options })).toThrow(/identical checked x coordinates/i);
    const shifted = channelSet([{ label: "one", values: tone },
      { label: "two", values: tone, xs: tone.map((_, index) => (index + 1) / 128) }]);
    expect(() => analyzeGraph2DMultiChannelFourier({ ...shifted, options })).toThrow(/identical checked x coordinates/i);
    const changed = channelSet([{ label: "one", values: tone }, { label: "two", values: tone }]);
    const altered = changed.channels.map((channel, index) => index === 1 ? { ...channel,
      rows: channel.rows.map((row, rowIndex) => rowIndex === 4 ? { ...row, y: 0.99 } : row) } : channel);
    expect(() => analyzeGraph2DMultiChannelFourier({ document: changed.document,
      channels: altered, options })).toThrow(/checksum/i);
    expect(() => analyzeGraph2DMultiChannelFourier({ document: changed.document,
      channels: [{ ...changed.channels[0]!, rows: null }, changed.channels[1]!], options })).toThrow(/sidecar/i);
  });

  it("requires matching declared units and refuses undeclared companions", () => {
    const tone = Array.from({ length: 32 }, (_, i) => Math.sin(2 * Math.PI * i / 32));
    const differentUnits = channelSet([{ label: "one", values: tone, origin: origin("one") },
      { label: "two", values: tone, origin: origin("two", "ms") }]);
    expect(() => analyzeGraph2DMultiChannelFourier({ ...differentUnits, options })).toThrow(/matching x and y units/i);
    const differentY = channelSet([{ label: "one", values: tone, origin: origin("one") },
      { label: "two", values: tone, origin: origin("two", "s", "A") }]);
    expect(() => analyzeGraph2DMultiChannelFourier({ ...differentY, options })).toThrow(/matching x and y units/i);
    const unknown = channelSet([{ label: "one", values: tone, origin: origin("one") },
      { label: "two", values: tone }]);
    expect(() => analyzeGraph2DMultiChannelFourier({ ...unknown, options })).toThrow(/unknown units/i);
  });
});
