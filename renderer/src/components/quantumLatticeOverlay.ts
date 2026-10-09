import type { GeometryScene } from "../geometry/types";

export type LatticeGeometryDefinition = {
  dimensions: 2 | 3; basis: { label: string; position: [number, number, number] }[];
  translations: [number, number, number][]; repeats: [number, number, number]; boundary: "open";
  sites: string; cells: string; basisIndices: string;
};
export type LatticeSampleIdentity = { sampleIndex: number; cell: [number, number, number]; basisIndex: number };
export type DerivedLatticeInstance = LatticeSampleIdentity & {
  sourceSampleIndex: number | null; sourceObjectId: string | null; sourceDatasetId: string;
};
export type LatticeSupercell = {
  geometry: GeometryScene; instances: DerivedLatticeInstance[];
  siteObject: { id: string; label: string; kind: "point-cloud"; style: { color: string; opacity: number; size: number } };
  repeats: [number, number, number]; edgeCount: number; periodicWrapCount: 0;
};

export const MAX_LATTICE_INSTANCE_SITES = 512;
export const MAX_LATTICE_CELL_EDGES = 2500;
export const SUPERCELL_SITE_OBJECT_ID = "derived-lattice-supercell-sites";
type Vec3 = [number, number, number];

/** Deterministic geometric realization only: no chemical sites, Hamiltonian links or periodic bonds are inferred. */
export function buildQuantumLatticeSupercell(lattice: LatticeGeometryDefinition,
  repeats: readonly number[], sourceSamples: readonly LatticeSampleIdentity[], sourceObjectId: string | null): LatticeSupercell {
  if (lattice.boundary !== "open" || ![2, 3].includes(lattice.dimensions) || repeats.length !== 3 ||
      repeats.some(value => !Number.isSafeInteger(value) || value < 1 || value > 8) ||
      (lattice.dimensions === 2 && repeats[2] !== 1) ||
      lattice.translations.length !== lattice.dimensions || !lattice.basis.length ||
      lattice.basis.length * repeats[0] * repeats[1] * repeats[2] > MAX_LATTICE_INSTANCE_SITES)
    throw new RangeError("Lattice supercell exceeds the verified open-grid preview bounds");
  const size: [number, number, number] = [repeats[0], repeats[1], repeats[2]];
  const sourceByCell = new Map(sourceSamples.map(sample => [`${sample.cell.join(",")}:${sample.basisIndex}`, sample.sampleIndex]));
  const at = (cell: Vec3, basis: Vec3 = [0, 0, 0]): Vec3 => [0, 1, 2].map(axis =>
    basis[axis] + lattice.translations.reduce((sum, translation, index) => sum + cell[index] * translation[axis], 0)) as Vec3;
  const points: NonNullable<GeometryScene["points"]> = [];
  const instances: DerivedLatticeInstance[] = [];
  for (let x = 0; x < size[0]; x++) for (let y = 0; y < size[1]; y++) for (let z = 0; z < size[2]; z++)
    for (let basisIndex = 0; basisIndex < lattice.basis.length; basisIndex++) {
      const cell: Vec3 = [x, y, z], position = at(cell, lattice.basis[basisIndex].position);
      const sampleIndex = instances.length;
      points.push({ x: position[0], y: position[1], z: position[2],
        id: `${SUPERCELL_SITE_OBJECT_ID}:site:${sampleIndex}`, label: lattice.basis[basisIndex].label,
        color: 0x79d9c1, size: 0.15, opacity: 1 });
      instances.push({ sampleIndex, cell, basisIndex,
        sourceSampleIndex: sourceByCell.get(`${cell.join(",")}:${basisIndex}`) ?? null,
        sourceObjectId, sourceDatasetId: lattice.sites });
    }
  const segments: NonNullable<GeometryScene["segments"]> = [];
  for (let axis = 0; axis < lattice.dimensions; axis++)
    for (let x = 0; x <= size[0]; x++) for (let y = 0; y <= size[1]; y++)
      for (let z = 0; z <= (lattice.dimensions === 3 ? size[2] : 0); z++) {
        const cell: Vec3 = [x, y, z];
        if (cell[axis] >= size[axis]) continue;
        const next: Vec3 = [...cell]; next[axis]++;
        const a = at(cell), b = at(next);
        const id = `lattice:cell-edge:${axis}:${cell.join(",")}`;
        segments.push({ a: { x: a[0], y: a[1], z: a[2], id: `${id}:a` },
          b: { x: b[0], y: b[1], z: b[2], id: `${id}:b` }, color: 0x526875, opacity: 0.8 });
      }
  if (segments.length > MAX_LATTICE_CELL_EDGES) throw new RangeError("Lattice cell-edge preview exceeds budget");
  for (let axis = 0; axis < lattice.dimensions; axis++) {
    const vector = lattice.translations[axis];
    segments.push({ a: { x: 0, y: 0, z: 0, id: `lattice:translation:${axis}:origin` },
      b: { x: vector[0], y: vector[1], z: vector[2], id: `lattice:translation:${axis}:tip` },
      color: 0xf2b36f, opacity: 1 });
  }
  return { geometry: { points, segments, triangles: [] }, instances,
    siteObject: { id: SUPERCELL_SITE_OBJECT_ID, label: "Derived supercell sites", kind: "point-cloud",
      style: { color: "#79d9c1", opacity: 1, size: 0.15 } },
    repeats: [...size] as [number, number, number], edgeCount: segments.length - lattice.dimensions, periodicWrapCount: 0 };
}
