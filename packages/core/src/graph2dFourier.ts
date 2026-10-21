import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import type { Graph2DDocument, Graph2DPointTableReference } from "./graph2dDocument";
import { Graph2DPointTableStore, graph2DVerifiedPointTableReference, type Graph2DPointRow } from "./graph2dPointSeries";
import type { ScientificSourceGeneration } from "./scientificJobs";

export type Graph2DFourierOptions = Readonly<{ window: "rectangular" | "hann";
  normalization: "peak" | "rms"; detrend: "none" | "mean"; xUnit: string }>;
export type Graph2DFourierBin = Readonly<{ index: number; frequency: number; amplitude: number; phaseRadians: number }>;
export type Graph2DFourierResult = Readonly<{
  resultId: string; objectId: string; source: ScientificSourceGeneration; table: Graph2DPointTableReference;
  options: Graph2DFourierOptions; n: number; fftLength: number; sampleInterval: number;
  sampleRate: number; nyquist: number; frequencyUnit: string; amplitudeUnit: string;
  coherentGain: number; removedMean: number; bins: readonly Graph2DFourierBin[];
  publication: AnalysisResultEnvelope;
}>;

const MAX_SAMPLES = 10000;
const freeze = <T>(value: T): T => { if (value && typeof value === "object" && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

/** In-place radix-2 FFT; bounded to the next power of two at or above the checked row count. */
const fft = (real: Float64Array, imaginary: Float64Array) => {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [real[i], real[j]] = [real[j]!, real[i]!];
      [imaginary[i], imaginary[j]] = [imaginary[j]!, imaginary[i]!]; }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = -2 * Math.PI / length, stepRe = Math.cos(angle), stepIm = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let twiddleRe = 1, twiddleIm = 0;
      for (let k = 0; k < length / 2; k++) {
        const even = start + k, odd = even + length / 2;
        const oddRe = real[odd]! * twiddleRe - imaginary[odd]! * twiddleIm;
        const oddIm = real[odd]! * twiddleIm + imaginary[odd]! * twiddleRe;
        real[odd] = real[even]! - oddRe; imaginary[odd] = imaginary[even]! - oddIm;
        real[even] += oddRe; imaginary[even] += oddIm;
        const nextRe = twiddleRe * stepRe - twiddleIm * stepIm;
        twiddleIm = twiddleRe * stepIm + twiddleIm * stepRe; twiddleRe = nextRe;
      }
    }
  }
};

/** One-sided amplitude/phase spectrum of a checked, uniformly spaced scalar point series. */
export const analyzeGraph2DFourier = (input: Readonly<{ document: Graph2DDocument; objectId: string;
  rows: readonly Graph2DPointRow[] | null; options: Graph2DFourierOptions }>): Graph2DFourierResult => {
  const started = Date.now(), { document, objectId, options } = input;
  const object = document.source.objects.find(item => item.id === objectId);
  if (object?.kind !== "point-series") throw new TypeError("Choose a point series for Fourier analysis.");
  if (!input.rows) throw new TypeError("Fourier analysis requires the original checked point-table sidecar.");
  if (!(["rectangular", "hann"] as string[]).includes(options.window) ||
      !(["peak", "rms"] as string[]).includes(options.normalization) ||
      !(["none", "mean"] as string[]).includes(options.detrend) ||
      typeof options.xUnit !== "string" || !options.xUnit.trim() || options.xUnit.length > 24 ||
      /[\r\n,]/.test(options.xUnit)) throw new TypeError("Choose a window, amplitude normalization, detrending and a short x unit.");
  const certified = graph2DVerifiedPointTableReference(input.rows);
  const store = certified ? null : new Graph2DPointTableStore();
  const ref = certified ?? store!.publish(input.rows);
  if (ref.id !== object.table.id || ref.checksum !== object.table.checksum || ref.rowCount !== object.table.rowCount)
    throw new TypeError("Fourier sidecar checksum does not match the dataset.");
  const rows = (certified ? input.rows : store!.resolve(ref)!).filter(row =>
    row.x >= object.domain.min && row.x <= object.domain.max &&
    (object.domain.includeMin || row.x !== object.domain.min) &&
    (object.domain.includeMax || row.x !== object.domain.max)).slice().sort((a, b) => a.x - b.x);
  if (rows.length < 8 || rows.length > MAX_SAMPLES)
    throw new TypeError(`Fourier analysis needs 8–${MAX_SAMPLES} in-domain samples.`);
  if (rows.some(row => row.y === null))
    throw new TypeError("Fourier analysis does not interpolate missing samples; provide a complete uniformly sampled series.");
  const n = rows.length, span = rows[n - 1]!.x - rows[0]!.x, sampleInterval = span / (n - 1);
  if (!(sampleInterval > 0) || !Number.isFinite(sampleInterval))
    throw new TypeError("Fourier analysis needs distinct, increasing finite x coordinates.");
  const spacingTolerance = Math.max(Math.abs(sampleInterval) * 1e-6,
    Number.EPSILON * Math.max(1, Math.abs(rows[0]!.x), Math.abs(rows[n - 1]!.x)) * 32);
  if (rows.slice(1).some((row, i) => Math.abs(row.x - rows[i]!.x - sampleInterval) > spacingTolerance))
    throw new TypeError("Irregular x spacing: Fourier analysis requires a uniform grid; resample explicitly before analysis.");
  const fftLength = 2 ** Math.ceil(Math.log2(n)), real = new Float64Array(fftLength), imaginary = new Float64Array(fftLength);
  const removedMean = options.detrend === "mean" ? rows.reduce((sum, row) => sum + row.y! / n, 0) : 0;
  let windowSum = 0;
  for (let i = 0; i < n; i++) {
    const weight = options.window === "hann" ? .5 * (1 - Math.cos(2 * Math.PI * i / (n - 1))) : 1;
    windowSum += weight; real[i] = (rows[i]!.y! - removedMean) * weight;
  }
  fft(real, imaginary);
  const sampleRate = 1 / sampleInterval, nyquist = sampleRate / 2;
  const bins: Graph2DFourierBin[] = [];
  for (let k = 0; k <= fftLength / 2; k++) {
    const endpoint = k === 0 || k === fftLength / 2;
    const amplitudePeak = Math.hypot(real[k]!, imaginary[k]!) * (endpoint ? 1 : 2) / windowSum;
    const amplitude = options.normalization === "rms" && !endpoint ? amplitudePeak / Math.SQRT2 : amplitudePeak;
    bins.push({ index: k, frequency: k * sampleRate / fftLength, amplitude,
      phaseRadians: Math.atan2(imaginary[k]!, real[k]!) });
  }
  const source = { documentId: document.identity.id, revision: document.identity.revision,
    structuralHash: document.identity.structuralHash, generation: document.identity.revision };
  const resultId = "graph2d.fourier." + structuralHash({ source, objectId, checksum: ref.checksum,
    options, algorithm: "radix2-windowed-v1" }).slice(7);
  const frequencyUnit = options.xUnit === "dimensionless" ? "cycles per x unit" : `cycles/${options.xUnit}`;
  const publication = createAnalysisResultEnvelope({ resultId, status: "numerical", provenance: { source,
    operation: { type: "graph2d.fourier", algorithm: "radix2-windowed-fft", algorithmVersion: "1",
      parameters: { objectId, table: { ...ref }, options, sampleCount: n, fftLength,
        spacingTolerance, amplitudeConvention: "one-sided coherent-gain corrected" } },
    numericContext: { precision: { binaryBits: 53 } }, engine: { name: "math3d-core", version: "1" },
    elapsedMs: Math.max(0, Date.now() - started) },
    summary: { n, fftLength, sampleInterval, sampleRate, nyquist, frequencyUnit,
      coherentGain: windowSum / n, removedMean, window: options.window,
      normalization: options.normalization, datasetChecksum: ref.checksum },
    warnings: ["Uniform x spacing is checked; x is treated as exact and input samples are not interpolated.",
      "Zero padding refines the displayed frequency grid but does not increase physical resolution or remove leakage.",
      "Peak/RMS amplitude uses coherent-gain correction; this is not a power spectral density or a confidence interval.",
      "Phase at near-zero amplitude is unstable and should not be interpreted as a reliable feature."],
    diagnostics: [], artifacts: [] });
  return freeze({ resultId, objectId, source, table: { ...ref }, options: { ...options }, n, fftLength,
    sampleInterval, sampleRate, nyquist, frequencyUnit, amplitudeUnit: "y unit", coherentGain: windowSum / n,
    removedMean, bins, publication });
};

export const graph2DFourierCsv = (result: Graph2DFourierResult): string => {
  const metadata = [
    `# resultId=${result.resultId}`, `# sourceDocument=${result.source.documentId}`,
    `# sourceRevision=${result.source.revision}`, `# datasetChecksum=${result.table.checksum}`,
    `# window=${result.options.window}; normalization=${result.options.normalization}; detrend=${result.options.detrend}`,
    `# sampleInterval=${result.sampleInterval}; xUnit=${result.options.xUnit}; frequencyUnit=${result.frequencyUnit}`,
  ];
  return [...metadata, "frequency,amplitude,phaseRadians",
    ...result.bins.map(bin => `${bin.frequency},${bin.amplitude},${bin.phaseRadians}`)].join("\n") + "\n";
};

export const isGraph2DFourierCurrent = (result: Graph2DFourierResult, document: Graph2DDocument): boolean => {
  const object = document.source.objects.find(item => item.id === result.objectId);
  return document.identity.id === result.source.documentId &&
    document.identity.revision === result.source.revision &&
    document.identity.structuralHash === result.source.structuralHash &&
    object?.kind === "point-series" && object.table.id === result.table.id &&
    object.table.checksum === result.table.checksum && object.table.rowCount === result.table.rowCount;
};
