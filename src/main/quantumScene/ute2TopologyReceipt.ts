import type { ImportedQuantumScene } from "./importer";

export type Ute2TopologyRequest = { fingerprint: string };
export type Ute2TopologyReceipt = {
  fingerprint: string; runId: string; resultSha256: string; model: "square_lattice_class_d";
  parameters: { mu: number; delta: number; mesh: number };
  status: "defined" | "gap_closed" | "mesh_unresolved"; chern: -1 | 0 | 1 | null;
  orientation: "occupied band; kx then ky; x-major half-open torus";
  bulkMinimumEnergy: number; bulkGap: number; sampledMinimumEnergy: number;
  diagnostics: { coarseMesh: number; fineMesh: number; coarseLinkChern: number | null;
    fineLinkChern: number | null; coarseMinimumLink: number | null; fineMinimumLink: number | null;
    curvatureIntegralCoarse: number | null; curvatureIntegralFine: number | null };
  qualification: "producer-supplied continuous-gap and two-mesh toy receipt";
};
export type Ute2EdgeReceipt = {
  fingerprint: string; runId: string; resultSha256: string;
  source: { bulkRunId: string; bulkResultSha256: string; bulkChern: -1 | 0 | 1 };
  ky: number; status: "localized_in_gap" | "not_resolved";
  widths: readonly { width: number; centralPairDensity: number[] }[];
  qualification: "producer-supplied finite-strip density at one ky";
};

const sha = /^[a-f0-9]{64}$/;
const near = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) &&
  Math.abs(a - b) <= 2e-7 * (1 + Math.abs(b));
function requestFingerprint(request: Ute2TopologyRequest) {
  if (!request || typeof request.fingerprint !== "string" || !sha.test(request.fingerprint))
    throw new TypeError("Invalid class-D receipt request");
  return request.fingerprint;
}
function number(source: ImportedQuantumScene["source"], key: string): number {
  const value = source.provenance.parameters?.[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`Missing class-D ${key} receipt`);
  return value;
}
function optionalNumber(source: ImportedQuantumScene["source"], key: string): number | null {
  const value = source.provenance.parameters?.[key];
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`Invalid class-D ${key} receipt`);
  return value;
}
function objectArray(imported: ImportedQuantumScene, id: string, member: "positions" | "scalars", unit: string,
  kind: "point-cloud" | "polyline" = "point-cloud") {
  const object = imported.source.objects.find(item => item.id === id && item.kind === kind);
  const datasetId = object?.[member], dataset = imported.source.datasets.find(item => item.id === datasetId);
  const values = datasetId ? imported.arrays.get(datasetId) : undefined;
  if (!values || !dataset || dataset.unit !== unit) throw new TypeError(`Class-D ${id} ${member} or units are unavailable`);
  return values;
}
/** The producer minimized this toy's E² analytically; this checks its reported scalar, not a momentum grid. */
function exactMinimum(mu: number, delta: number) {
  let minimum = Infinity;
  for (const fixed of [-1, 1]) {
    const values = [-1, 1];
    if (delta < 2) values.push(Math.max(-1, Math.min(1, -2 * (2 * fixed + mu) / (4 - delta * delta))));
    for (const other of values)
      minimum = Math.min(minimum, delta * delta * (1 - other * other) + (2 * (fixed + other) + mu) ** 2);
  }
  return Math.sqrt(Math.max(0, minimum));
}
function sampledMinimum(mu: number, delta: number, size: number) {
  let minimum = Infinity;
  for (let ix = 0; ix < size; ix++) for (let iy = 0; iy < size; iy++) {
    const kx = -Math.PI + 2 * Math.PI * ix / size, ky = -Math.PI + 2 * Math.PI * iy / size;
    minimum = Math.min(minimum, Math.hypot(delta * Math.sin(kx), delta * Math.sin(ky),
      -2 * (Math.cos(kx) + Math.cos(ky)) - mu));
  }
  return minimum;
}

/** Recheck a saved scalar receipt. A null invariant stays null at closure or unresolved convergence. */
export function inspectVerifiedUte2TopologyReceipt(imported: ImportedQuantumScene,
  request: Ute2TopologyRequest): Ute2TopologyReceipt {
  const fingerprint = requestFingerprint(request), source = imported.source;
  if (source.schema !== "quantum-scene/v1" || source.provenance.model !== "square_lattice_class_d" ||
      source.coordinates.axes.join("|") !== "mu/t|pairing amplitude delta/t|continuous bulk gap" ||
      source.coordinates.units.join("|") !== "t=1|t=1|t=1" ||
      source.objects.length !== 1 || source.objects[0]?.id !== "bulk-receipt")
    throw new TypeError("Scene is not a class-D bulk qualification receipt");
  const p = source.provenance.parameters ?? {}, mu = number(source, "mu"), delta = number(source, "delta"),
    mesh = number(source, "mesh"), bulkMinimumEnergy = number(source, "bulkMinimumEnergy"),
    bulkGap = number(source, "bulkGap"), sampledMinimumEnergy = number(source, "sampledMinimumEnergy"),
    coarseMesh = number(source, "coarseMesh"), fineMesh = number(source, "fineMesh");
  if (mu < -5 || mu > 5 || delta < 0 || delta > 2 || ![12, 16, 20].includes(mesh) ||
      coarseMesh !== mesh || fineMesh !== 2 * mesh ||
      !near(bulkMinimumEnergy, exactMinimum(mu, delta)) || !near(bulkGap, 2 * bulkMinimumEnergy) ||
      !near(sampledMinimumEnergy, sampledMinimum(mu, delta, fineMesh)))
    throw new TypeError("Class-D full-gap or mesh receipt disagrees with the declared toy");
  const positions = objectArray(imported, "bulk-receipt", "positions", "mu/t, delta/t, bulk gap"),
    scalars = objectArray(imported, "bulk-receipt", "scalars", "t=1");
  if (positions.length !== 3 || scalars.length !== 1 || !near(positions[0]!, mu) ||
      !near(positions[1]!, delta) || !near(positions[2]!, bulkGap) || !near(scalars[0]!, bulkGap))
    throw new TypeError("Class-D point differs from its scalar full-gap receipt");
  const status = p.invariantStatus;
  if (!["defined", "gap_closed", "mesh_unresolved"].includes(String(status)) ||
      p.orientation !== "occupied band; kx then ky; x-major half-open torus" ||
      p.gapClosed !== String(bulkMinimumEnergy <= 1e-10))
    throw new TypeError("Class-D status or orientation receipt is invalid");
  const invariant = source.topology?.invariants;
  if (!invariant || invariant.length !== 1 || invariant[0]?.id !== "occupied-chern")
    throw new TypeError("Conditional toy invariant receipt is unavailable");
  const coarseLinkChern = optionalNumber(source, "coarseLinkChern"),
    fineLinkChern = optionalNumber(source, "fineLinkChern"),
    coarseMinimumLink = optionalNumber(source, "coarseMinimumLink"),
    fineMinimumLink = optionalNumber(source, "fineMinimumLink"),
    curvatureIntegralCoarse = optionalNumber(source, "curvatureIntegralCoarse"),
    curvatureIntegralFine = optionalNumber(source, "curvatureIntegralFine"),
    analyticExpectedChern = optionalNumber(source, "analyticExpectedChern");
  const expected = delta > 0 && mu > -4 && mu < 0 ? -1 : delta > 0 && mu > 0 && mu < 4 ? 1 : 0;
  const defined = bulkMinimumEnergy > 1e-10 && coarseLinkChern !== null &&
    coarseLinkChern === fineLinkChern && fineLinkChern === expected &&
    analyticExpectedChern === expected && coarseMinimumLink !== null && coarseMinimumLink > 0.1 &&
    fineMinimumLink !== null && fineMinimumLink > 0.1 &&
    curvatureIntegralCoarse !== null && curvatureIntegralFine !== null &&
    Math.abs(curvatureIntegralFine - expected) < 0.03 &&
    Math.abs(curvatureIntegralFine - curvatureIntegralCoarse) < 0.03;
  if (bulkMinimumEnergy <= 1e-10 ? status !== "gap_closed" || invariant[0].value !== null ||
      invariant[0].status !== "undefined" :
      status === "defined" ? !defined || invariant[0].value !== expected || invariant[0].status !== "verified" :
      status !== "mesh_unresolved" || defined || invariant[0].value !== null || invariant[0].status !== "unresolved")
    throw new TypeError("Class-D invariant status disagrees with full-gap and convergence receipt");
  return { fingerprint, runId: source.provenance.runId, resultSha256: source.provenance.resultSha256,
    model: "square_lattice_class_d", parameters: { mu, delta, mesh },
    status: status as Ute2TopologyReceipt["status"], chern: status === "defined" ? expected : null,
    orientation: "occupied band; kx then ky; x-major half-open torus",
    bulkMinimumEnergy, bulkGap, sampledMinimumEnergy,
    diagnostics: { coarseMesh, fineMesh, coarseLinkChern, fineLinkChern, coarseMinimumLink,
      fineMinimumLink, curvatureIntegralCoarse, curvatureIntegralFine },
    qualification: "producer-supplied continuous-gap and two-mesh toy receipt" };
}

/** Read one separately sourced finite strip; this cannot establish a zero mode or infinite-width edge. */
export function inspectVerifiedUte2EdgeReceipt(imported: ImportedQuantumScene,
  request: Ute2TopologyRequest): Ute2EdgeReceipt {
  const fingerprint = requestFingerprint(request), source = imported.source, p = source.provenance.parameters ?? {};
  if (source.schema !== "quantum-scene/v1" || source.provenance.model !== "square_lattice_class_d" ||
      source.coordinates.axes.join("|") !== "open-x cell index|display width row|central-pair density" ||
      source.coordinates.units.join("|") !== "cell index|categorical width|probability per x cell" ||
      typeof p.bulkRunId !== "string" || !/^run-[a-f0-9]{32}$/.test(p.bulkRunId) ||
      typeof p.bulkResultSha256 !== "string" || !sha.test(p.bulkResultSha256) ||
      ![-1, 0, 1].includes(Number(p.bulkChern)) || typeof p.bulkChern !== "number" ||
      typeof p.ky !== "number" || !Number.isFinite(p.ky) ||
      !["localized_in_gap", "not_resolved"].includes(String(p.edgeStatus)))
    throw new TypeError("Scene is not a source-bound finite strip receipt");
  const objects = source.objects.filter(item => /^density-\d+$/.test(item.id));
  if (objects.length !== 2 || source.objects.length !== 2)
    throw new TypeError("Finite strip must carry both exact width profiles");
  const widths = objects.map(item => {
    const width = Number(item.id.slice("density-".length));
    const positions = objectArray(imported, item.id, "positions", "cell index, categorical width, probability per x cell", "polyline");
    if (![12, 16, 20, 24, 32, 40].includes(width) || positions.length !== 3 * width)
      throw new TypeError("Finite strip width or density count disagrees");
    const density = Array.from({ length: width }, (_, i) => {
      const x = positions[3 * i]!, row = positions[3 * i + 1]!, value = positions[3 * i + 2]!;
      if (x !== i || row !== width || !Number.isFinite(value) || value < 0 || value > 2)
        throw new TypeError("Finite strip density coordinates disagree");
      return value;
    });
    if (!near(density.reduce((sum, value) => sum + value, 0), 1))
      throw new TypeError("Finite strip central-pair density is not normalized");
    return { width, centralPairDensity: density };
  }).sort((a, b) => a.width - b.width);
  if (widths[1]!.width !== 2 * widths[0]!.width || ![12, 16, 20].includes(widths[0]!.width))
    throw new TypeError("Finite strip width pair disagrees");
  return { fingerprint, runId: source.provenance.runId, resultSha256: source.provenance.resultSha256,
    source: { bulkRunId: p.bulkRunId, bulkResultSha256: p.bulkResultSha256,
      bulkChern: p.bulkChern as -1 | 0 | 1 }, ky: p.ky as number,
    status: p.edgeStatus as Ute2EdgeReceipt["status"], widths,
    qualification: "producer-supplied finite-strip density at one ky" };
}
