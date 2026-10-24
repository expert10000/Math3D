import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import type { Graph2DDocument, Graph2DPointTableReference, Graph2DScientificDatasetOrigin } from "./graph2dDocument";
import { Graph2DPointTableStore, graph2DVerifiedPointTableReference, assertGraph2DAnalysisRowBudget,
  type Graph2DPointRow } from "./graph2dPointSeries";
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
  rows: readonly Graph2DPointRow[] | null; options: Graph2DFourierOptions; maxRows?: number }>): Graph2DFourierResult => {
  const started = Date.now(), { document, objectId, options } = input;
  const object = document.source.objects.find(item => item.id === objectId);
  if (object?.kind !== "point-series") throw new TypeError("Choose a point series for Fourier analysis.");
  if (!input.rows) throw new TypeError("Fourier analysis requires the original checked point-table sidecar.");
  assertGraph2DAnalysisRowBudget(input.rows.length, input.maxRows, "Fourier analysis");
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

export type Graph2DFourierChannelInput = Readonly<{ objectId: string; rows: readonly Graph2DPointRow[] | null }>;
export type Graph2DMultiChannelFourierResult = Readonly<{
  resultId: string; source: ScientificSourceGeneration; options: Graph2DFourierOptions;
  channels: readonly Readonly<{ objectId: string; label: string; xUnit: string; yUnit: string;
    origin?: Graph2DScientificDatasetOrigin; spectrum: Graph2DFourierResult }>[];
  n: number; fftLength: number; sampleInterval: number; nyquist: number; frequencyUnit: string;
  publication: AnalysisResultEnvelope;
}>;

const inDomainFourierRows = (rows: readonly Graph2DPointRow[], domain: Graph2DDocument["source"]["objects"][number] &
  { kind: "point-series" }) => rows.filter(row => row.x >= domain.domain.min && row.x <= domain.domain.max &&
    (domain.domain.includeMin || row.x !== domain.domain.min) &&
    (domain.domain.includeMax || row.x !== domain.domain.max)).slice().sort((a, b) => a.x - b.x);

/** Compare one to four complete checked channels on exactly the same coordinate lattice. */
export const analyzeGraph2DMultiChannelFourier = (input: Readonly<{ document: Graph2DDocument;
  channels: readonly Graph2DFourierChannelInput[]; options: Graph2DFourierOptions;
  maxRows?: number }>): Graph2DMultiChannelFourierResult => {
  const started = Date.now();
  if (input.channels.length < 1 || input.channels.length > 4 ||
      new Set(input.channels.map(channel => channel.objectId)).size !== input.channels.length)
    throw new TypeError("Choose one to four distinct Fourier channels.");
  const objects = input.channels.map(channel => {
    const object = input.document.source.objects.find(item => item.id === channel.objectId);
    if (object?.kind !== "point-series") throw new TypeError("Every Fourier channel must be a point series.");
    return object;
  });
  const declared = objects.map(object => object.origin);
  if (declared.some(Boolean) && declared.some(origin => !origin))
    throw new TypeError("Cannot compare channels with declared units to a channel with unknown units.");
  if (declared[0]) {
    const { xUnit, yUnit } = declared[0];
    if (input.options.xUnit !== xUnit || declared.some(origin => origin!.xUnit !== xUnit || origin!.yUnit !== yUnit))
      throw new TypeError("Fourier channels must have matching x and y units, including the selected x unit.");
  }
  const spectra = input.channels.map(channel => analyzeGraph2DFourier({ ...input,
    objectId: channel.objectId, rows: channel.rows }));
  const grids = input.channels.map((channel, index) => inDomainFourierRows(channel.rows!, objects[index]!));
  const first = grids[0]!;
  if (grids.slice(1).some(rows => rows.length !== first.length ||
      rows.some((row, index) => row.x !== first[index]!.x)))
    throw new TypeError("Fourier channels require identical checked x coordinates; resample explicitly before comparison.");
  const source = spectra[0]!.source;
  const channels = spectra.map((spectrum, index) => ({ objectId: spectrum.objectId,
    label: objects[index]!.label, xUnit: declared[index]?.xUnit ?? input.options.xUnit,
    yUnit: declared[index]?.yUnit ?? "y unit", ...(declared[index] ? { origin: declared[index] } : {}),
    spectrum }));
  const resultId = "graph2d.fourier-multichannel." + structuralHash({ source,
    channels: channels.map(channel => ({ objectId: channel.objectId, checksum: channel.spectrum.table.checksum,
      xUnit: channel.xUnit, yUnit: channel.yUnit })), options: input.options,
    algorithm: "aligned-radix2-windowed-v1" }).slice(7);
  const reference = spectra[0]!;
  const publication = createAnalysisResultEnvelope({ resultId, status: "numerical", provenance: { source,
    operation: { type: "graph2d.fourier-multichannel", algorithm: "aligned-radix2-windowed-fft",
      algorithmVersion: "1", parameters: { options: input.options,
        channels: channels.map(channel => ({ objectId: channel.objectId, table: channel.spectrum.table,
          xUnit: channel.xUnit, yUnit: channel.yUnit, origin: channel.origin ?? null })),
        sampleCount: reference.n, fftLength: reference.fftLength, alignment: "exact checked x coordinates" } },
    numericContext: { precision: { binaryBits: 53 } }, engine: { name: "math3d-core", version: "1" },
    elapsedMs: Math.max(0, Date.now() - started) },
    summary: { channelCount: channels.length, n: reference.n, fftLength: reference.fftLength,
      sampleInterval: reference.sampleInterval, nyquist: reference.nyquist,
      frequencyUnit: reference.frequencyUnit, checksums: channels.map(channel => channel.spectrum.table.checksum) },
    warnings: [...reference.publication.warnings,
      "Channels share exact checked x coordinates; no alignment or interpolation was inferred.",
      ...(!declared[0] ? ["Manually imported channels have no declared units; the chosen x unit and generic y unit are user assumptions."] : [])],
    diagnostics: [], artifacts: [] });
  return freeze({ resultId, source, options: { ...input.options }, channels,
    n: reference.n, fftLength: reference.fftLength, sampleInterval: reference.sampleInterval,
    nyquist: reference.nyquist, frequencyUnit: reference.frequencyUnit, publication });
};

export const isGraph2DMultiChannelFourierCurrent = (result: Graph2DMultiChannelFourierResult,
  document: Graph2DDocument) => result.channels.every(channel =>
    isGraph2DFourierCurrent(channel.spectrum, document));

const metadataText = (value: string) => JSON.stringify(value);
export const graph2DMultiChannelFourierCsv = (result: Graph2DMultiChannelFourierResult): string => [
  `# resultId=${result.resultId}`, `# sourceDocument=${result.source.documentId}`,
  `# sourceRevision=${result.source.revision}`,
  ...result.channels.flatMap((channel, index) => [
    `# channel${index + 1}.objectId=${channel.objectId}`,
    `# channel${index + 1}.datasetChecksum=${channel.spectrum.table.checksum}`,
    `# channel${index + 1}.xUnit=${metadataText(channel.xUnit)}; yUnit=${metadataText(channel.yUnit)}`,
    ...(channel.origin ? [`# channel${index + 1}.scene=${channel.origin.sceneId}; dataset=${channel.origin.datasetId}; component=${channel.origin.component ?? "scalar"}; manifest=${channel.origin.sceneFingerprint}; resource=${channel.origin.resourceSha256}; source=${channel.origin.sourceSha256}`] : []),
  ]),
  `# window=${result.options.window}; normalization=${result.options.normalization}; detrend=${result.options.detrend}`,
  `# sampleInterval=${result.sampleInterval}; frequencyUnit=${result.frequencyUnit}`,
  ["frequency", ...result.channels.flatMap((_, index) => [`channel_${index + 1}_amplitude`,
    `channel_${index + 1}_phaseRadians`])].join(","),
  ...result.channels[0]!.spectrum.bins.map((bin, index) => [bin.frequency,
    ...result.channels.flatMap(channel => [channel.spectrum.bins[index]!.amplitude,
      channel.spectrum.bins[index]!.phaseRadians])].join(",")),
].join("\n") + "\n";
