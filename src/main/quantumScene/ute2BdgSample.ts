import type { ImportedQuantumScene } from "./importer";

export type Ute2BdgSampleRequest = { fingerprint: string; sampleIndex: number };
export type Ute2ReducedBdgSample = {
  fingerprint: string; runId: string; resultSha256: string; sampleIndex: number;
  model: "reduced_bdg_2x2"; coordinate: { xi: number; unit: "dimensionless"; meaning: "dispersion parameter, not momentum" };
  energies: { negative: number; positive: number; unit: "dimensionless" };
  gapMagnitude: number; pairingPhaseRad: number | null; sampledNode: boolean;
  electronWeight: number | null; holeWeight: number | null;
  qualification: "producer-supplied reduced Nambu sector sample";
};
export type Ute2LatticeBdgSample = {
  fingerprint: string; runId: string; resultSha256: string; sampleIndex: number;
  model: "square_lattice_px_py"; momentum: { kx: number; ky: number; unit: "rad/a" };
  energy: { xi: number; negative: number; positive: number; unit: "t=1" };
  pairing: { real: number; imaginary: number; magnitude: number; phaseRad: number | null; phaseDefined: boolean };
  coherence: { electronWeight: number | null; holeWeight: number | null; defined: boolean };
  sampledNode: boolean; grid: { size: number; order: "kx-major/ky-minor"; domain: "[-pi,pi)" };
  qualification: "producer-supplied finite-grid spinless lattice toy sample";
};

const near = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) &&
  Math.abs(a - b) <= 2e-7 * (1 + Math.abs(b));
const token = /^[a-f0-9]{64}$/;
function requestIndex(request: Ute2BdgSampleRequest): number {
  if (!request || !token.test(request.fingerprint) || !Number.isSafeInteger(request.sampleIndex) || request.sampleIndex < 0)
    throw new TypeError("Invalid BdG scene selection");
  return request.sampleIndex;
}
function parameter(source: ImportedQuantumScene["source"], name: string): number {
  const value = source.provenance.parameters?.[name];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`BdG ${name} parameter is unavailable`);
  return value;
}
function array(imported: ImportedQuantumScene, objectId: string, member: "positions" | "scalars",
  kind = "point-cloud", expectedUnit?: string) {
  const object = imported.source.objects.find(item => item.id === objectId && item.kind === kind);
  const datasetId = object?.[member];
  const values = datasetId ? imported.arrays.get(datasetId) : undefined;
  const dataset = imported.source.datasets.find(item => item.id === datasetId);
  if (!values || !dataset || expectedUnit && dataset.unit !== expectedUnit)
    throw new TypeError(`BdG ${objectId} ${member} or units are unavailable`);
  return values;
}
function point(values: Float64Array, index: number): [number, number, number] {
  return [values[3 * index]!, values[3 * index + 1]!, values[3 * index + 2]!];
}
function provenance(imported: ImportedQuantumScene, request: Ute2BdgSampleRequest) {
  return { fingerprint: request.fingerprint, runId: imported.source.provenance.runId,
    resultSha256: imported.source.provenance.resultSha256, sampleIndex: request.sampleIndex };
}

/** Recheck one exact producer scene. ξ is a parameter, so no k-space or topological claim follows. */
export function inspectVerifiedUte2ReducedBdgSample(imported: ImportedQuantumScene,
  request: Ute2BdgSampleRequest): Ute2ReducedBdgSample {
  const index = requestIndex(request), source = imported.source;
  if (source.schema !== "quantum-scene/v1" || source.provenance.model !== "reduced_bdg_2x2" ||
      source.coordinates.axes.join("|") !== "xi|energy|display z" ||
      source.coordinates.units.join("|") !== "dimensionless|dimensionless|dimensionless")
    throw new TypeError("Scene is not the declared dimensionless reduced BdG sector");
  const extent = parameter(source, "extent"), delta = parameter(source, "delta"),
    phaseRad = parameter(source, "phaseRad"), count = parameter(source, "points");
  if (!Number.isSafeInteger(count) || count < 3 || count > 2001 || count % 2 !== 1 || extent <= 0 || delta < 0 ||
      index >= count) throw new RangeError("Reduced BdG selection is outside the declared grid");
  const positionUnit = "xi, energy, display z";
  const positive = array(imported, "positive", "positions", "polyline", positionUnit),
    negative = array(imported, "negative", "positions", "polyline", positionUnit);
  if (positive.length !== 3 * count || negative.length !== 3 * count)
    throw new TypeError("Reduced BdG branches have different grid lengths");
  const electron = source.objects.some(item => item.id === "electron-weight") ?
    { positions: array(imported, "electron-weight", "positions", "point-cloud", positionUnit),
      values: array(imported, "electron-weight", "scalars", "point-cloud", "probability") } : null;
  const hole = source.objects.some(item => item.id === "hole-weight") ?
    { positions: array(imported, "hole-weight", "positions", "point-cloud", positionUnit),
      values: array(imported, "hole-weight", "scalars", "point-cloud", "probability") } : null;
  const nodes = source.objects.some(item => item.id === "nodes") ?
    array(imported, "nodes", "positions", "point-cloud", positionUnit) : new Float64Array();
  let weightIndex = 0, nodeIndex = 0;
  for (let i = 0; i < count; i++) {
    const [xi, ePlus, zPlus] = point(positive, i), [negativeXi, eMinus, zMinus] = point(negative, i);
    const expectedXi = extent * (2 * i / (count - 1) - 1), expectedEnergy = Math.hypot(expectedXi, delta);
    if (!near(xi, expectedXi) || !near(negativeXi, xi) || !near(ePlus, expectedEnergy) ||
        !near(eMinus, -expectedEnergy) || zPlus !== 0 || zMinus !== 0)
      throw new TypeError("Reduced BdG branch coordinates or energies disagree with declared parameters");
    if (expectedEnergy === 0) {
      if (nodes.length < 3 * (nodeIndex + 1) || !near(point(nodes, nodeIndex)[0], xi) ||
          point(nodes, nodeIndex)[1] !== 0 || point(nodes, nodeIndex)[2] !== 0)
        throw new TypeError("Reduced BdG sampled node mask disagrees with the branch");
      nodeIndex++;
    } else {
      if (!electron || !hole || electron.values.length <= weightIndex || hole.values.length <= weightIndex ||
          !near(point(electron.positions, weightIndex)[0], xi) ||
          !near(point(electron.positions, weightIndex)[1], ePlus) || point(electron.positions, weightIndex)[2] !== 0 ||
          !near(point(hole.positions, weightIndex)[0], xi) ||
          !near(point(hole.positions, weightIndex)[1], ePlus) || point(hole.positions, weightIndex)[2] !== 0 ||
          !near(electron.values[weightIndex]!, (1 + xi / expectedEnergy) / 2) ||
          !near(hole.values[weightIndex]!, (1 - xi / expectedEnergy) / 2))
        throw new TypeError("Reduced BdG coherence weights differ from the defined branch samples");
      weightIndex++;
    }
  }
  if (nodes.length !== 3 * nodeIndex || electron?.values.length !== weightIndex || hole?.values.length !== weightIndex ||
      electron.positions.length !== 3 * weightIndex || hole.positions.length !== 3 * weightIndex)
    throw new TypeError("Reduced BdG node or weight sample counts disagree");
  const [xi, ePlus] = point(positive, index), node = ePlus === 0;
  const weightOffset = index - (nodeIndex && index > (count - 1) / 2 ? 1 : 0);
  return { ...provenance(imported, request), model: "reduced_bdg_2x2",
    coordinate: { xi, unit: "dimensionless", meaning: "dispersion parameter, not momentum" },
    energies: { negative: point(negative, index)[1], positive: ePlus, unit: "dimensionless" },
    gapMagnitude: delta, pairingPhaseRad: delta === 0 ? null : phaseRad, sampledNode: node,
    electronWeight: node ? null : electron!.values[weightOffset]!,
    holeWeight: node ? null : hole!.values[weightOffset]!,
    qualification: "producer-supplied reduced Nambu sector sample" };
}

/** Check all linked lattice arrays and masks before exposing one finite-grid sample. */
export function inspectVerifiedUte2LatticeBdgSample(imported: ImportedQuantumScene,
  request: Ute2BdgSampleRequest): Ute2LatticeBdgSample {
  const index = requestIndex(request), source = imported.source;
  if (source.schema !== "quantum-scene/v1" || source.provenance.model !== "square_lattice_px_py" ||
      source.coordinates.axes.join("|") !== "kx|ky|energy or display plane" ||
      source.coordinates.units.join("|") !== "rad/a|rad/a|t=1")
    throw new TypeError("Scene is not the declared square-lattice pairing toy");
  const size = parameter(source, "gridSize"), mu = parameter(source, "mu"),
    ax = parameter(source, "amplitudeX"), ay = parameter(source, "amplitudeY"),
    relativePhase = parameter(source, "relativePhaseRad");
  if (!Number.isSafeInteger(size) || size < 4 || size > 128 || index >= size * size)
    throw new RangeError("Lattice BdG selection is outside the declared grid");
  if (!["dispersion-xi", "pairing-real", "pairing-imaginary", "phase-defined-mask", "node-mask",
    "coherence-defined-mask", "electron-weight", "hole-weight"].every(id =>
    source.objects.find(item => item.id === id)?.positions === "grid-plane-positions"))
    throw new TypeError("Lattice BdG scalar views do not share the declared momentum grid");
  const positions = array(imported, "positive-energy", "positions", "point-cloud", "kx, ky, energy"),
    negative = array(imported, "negative-energy", "positions", "point-cloud", "kx, ky, energy"),
    plane = array(imported, "gap-magnitude", "positions", "point-cloud", "kx, ky, display plane"),
    grid = array(imported, "dispersion-xi", "positions", "point-cloud", "kx, ky, display plane");
  const scalar = (id: string, unit: string) => array(imported, id, "scalars", "point-cloud", unit);
  const positiveValues = scalar("positive-energy", "t=1"), gap = scalar("gap-magnitude", "t=1"),
    xi = scalar("dispersion-xi", "t=1"), real = scalar("pairing-real", "t=1"),
    imaginary = scalar("pairing-imaginary", "t=1"), phaseMask = scalar("phase-defined-mask", "binary mask"),
    nodeMask = scalar("node-mask", "binary mask"), weightMask = scalar("coherence-defined-mask", "binary mask"),
    electron = scalar("electron-weight", "probability"), hole = scalar("hole-weight", "probability");
  const count = size * size;
  if ([positions, negative, plane, grid].some(values => values.length !== 3 * count) ||
      [positiveValues, gap, xi, real, imaginary, phaseMask, nodeMask, weightMask, electron, hole]
        .some(values => values.length !== count))
    throw new TypeError("Lattice BdG coordinate, scalar or mask counts disagree");
  const phase = source.objects.some(item => item.id === "pairing-phase") ?
    { positions: array(imported, "pairing-phase", "positions", "point-cloud", "kx, ky, display plane"),
      values: scalar("pairing-phase", "rad") } : null;
  const nodes = source.objects.some(item => item.id === "nodes") ?
    array(imported, "nodes", "positions", "point-cloud", "kx, ky, display plane") : new Float64Array();
  let phaseIndex = 0, nodeIndex = 0;
  for (let i = 0; i < count; i++) {
    const expectedKx = -Math.PI + 2 * Math.PI * Math.floor(i / size) / size;
    const expectedKy = -Math.PI + 2 * Math.PI * (i % size) / size;
    const [kx, ky, energy] = point(positions, i);
    const expectedXi = -2 * (Math.cos(expectedKx) + Math.cos(expectedKy)) - mu;
    const sinX = Math.abs(Math.sin(expectedKx)) < 1e-12 ? 0 : Math.sin(expectedKx);
    const sinY = Math.abs(Math.sin(expectedKy)) < 1e-12 ? 0 : Math.sin(expectedKy);
    const expectedReal = ax * sinX + ay * Math.cos(relativePhase) * sinY;
    const expectedImaginary = ay * Math.sin(relativePhase) * sinY;
    const expectedGap = Math.hypot(expectedReal, expectedImaginary);
    const expectedEnergy = Math.hypot(expectedXi, expectedGap);
    const phaseDefined = expectedGap > 1e-12, node = expectedEnergy <= 1e-10;
    if (!near(kx, expectedKx) || !near(ky, expectedKy) || !near(xi[i]!, expectedXi) ||
        !near(real[i]!, expectedReal) || !near(imaginary[i]!, expectedImaginary) ||
        !near(gap[i]!, expectedGap) || !near(energy, expectedEnergy) ||
        !near(positiveValues[i]!, energy) || !near(point(negative, i)[0], kx) ||
        !near(point(negative, i)[1], ky) || !near(point(negative, i)[2], -energy) ||
        !near(point(plane, i)[0], kx) || !near(point(plane, i)[1], ky) || point(plane, i)[2] !== 0 ||
        !near(point(grid, i)[0], kx) || !near(point(grid, i)[1], ky) || point(grid, i)[2] !== 0 ||
        phaseMask[i] !== Number(phaseDefined) || nodeMask[i] !== Number(node) || weightMask[i] !== Number(!node))
      throw new TypeError("Lattice BdG coordinates, energy or masks disagree with declared model");
    if (phaseDefined) {
      if (!phase || !near(point(phase.positions, phaseIndex)[0], kx) ||
          !near(point(phase.positions, phaseIndex)[1], ky) || point(phase.positions, phaseIndex)[2] !== 0 ||
          !near(phase.values[phaseIndex]!, Math.atan2(expectedImaginary, expectedReal)))
        throw new TypeError("Lattice pairing phase differs from the defined samples");
      phaseIndex++;
    }
    if (node) {
      if (electron[i] !== 0 || hole[i] !== 0 || !near(point(nodes, nodeIndex)[0], kx) ||
          !near(point(nodes, nodeIndex)[1], ky) || point(nodes, nodeIndex)[2] !== 0)
        throw new TypeError("Lattice masked weight or node position disagrees");
      nodeIndex++;
    } else if (!near(electron[i]!, (1 + expectedXi / expectedEnergy) / 2) ||
        !near(hole[i]!, (1 - expectedXi / expectedEnergy) / 2))
      throw new TypeError("Lattice coherence weights disagree with the defined samples");
  }
  if ((phase?.values.length ?? 0) !== phaseIndex || (phase?.positions.length ?? 0) !== 3 * phaseIndex ||
      nodes.length !== 3 * nodeIndex)
    throw new TypeError("Lattice phase or node sample counts disagree");
  const [kx, ky, positive] = point(positions, index), phaseDefined = phaseMask[index] === 1,
    weightDefined = weightMask[index] === 1;
  const phaseOffset = phaseMask.slice(0, index).reduce((sum, value) => sum + value, 0);
  return { ...provenance(imported, request), model: "square_lattice_px_py",
    momentum: { kx, ky, unit: "rad/a" },
    energy: { xi: xi[index]!, negative: point(negative, index)[2], positive, unit: "t=1" },
    pairing: { real: real[index]!, imaginary: imaginary[index]!, magnitude: gap[index]!,
      phaseRad: phaseDefined ? phase!.values[phaseOffset]! : null, phaseDefined },
    coherence: { electronWeight: weightDefined ? electron[index]! : null,
      holeWeight: weightDefined ? hole[index]! : null, defined: weightDefined },
    sampledNode: nodeMask[index] === 1,
    grid: { size, order: "kx-major/ky-minor", domain: "[-pi,pi)" },
    qualification: "producer-supplied finite-grid spinless lattice toy sample" };
}
