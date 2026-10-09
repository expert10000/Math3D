import { describe, expect, it } from "vitest";
import { buildQuantumPrimitiveMeshes } from "./quantumPrimitiveMeshes";
import { buildQuantumLatticeSupercell, MAX_LATTICE_INSTANCE_SITES, SUPERCELL_SITE_OBJECT_ID,
  type LatticeGeometryDefinition } from "./quantumLatticeOverlay";

const square: LatticeGeometryDefinition = { dimensions: 2, basis: [{ label: "A", position: [0, 0, 0] }],
  translations: [[1, 0, 0], [0, 1, 0]], repeats: [2, 2, 1], boundary: "open",
  sites: "sites", cells: "cells", basisIndices: "basis" };
const honeycomb: LatticeGeometryDefinition = { ...square,
  basis: [{ label: "A", position: [0, 0, 0] }, { label: "B", position: [0, 1, 0] }],
  translations: [[Math.sqrt(3), 0, 0], [Math.sqrt(3) / 2, 1.5, 0]] };
const cubic: LatticeGeometryDefinition = { ...square, dimensions: 3, repeats: [2, 2, 2],
  translations: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };

describe("verified open-lattice supercell preview", () => {
  it.each([["square", square, [3, 2, 1], 6, 17],
    ["honeycomb", honeycomb, [3, 2, 1], 12, 17],
    ["simple cubic", cubic, [2, 2, 2], 8, 54]] as const)("maps %s instances to exact cells and basis without inventing bonds",
    (_name, definition, repeats, sites, edges) => {
      const sourceSamples = [{ sampleIndex: 42, cell: [0, 0, 0] as [number, number, number], basisIndex: 0 }];
      const view = buildQuantumLatticeSupercell(definition, repeats, sourceSamples, "source-sites");
      expect(view.instances).toHaveLength(sites);
      expect(view.edgeCount).toBe(edges);
      expect(view.periodicWrapCount).toBe(0);
      expect(view.instances[0]).toMatchObject({ cell: [0, 0, 0], basisIndex: 0,
        sourceObjectId: "source-sites", sourceSampleIndex: 42 });
      expect(view.instances.at(-1)?.sourceSampleIndex).toBeNull();
      expect(view.geometry.points).toHaveLength(sites);
      expect(view.geometry.segments).toHaveLength(edges + definition.dimensions);
      expect(view.geometry.segments?.every(segment => segment.a.id?.startsWith("lattice:cell-edge:") ||
        segment.a.id?.startsWith("lattice:translation:"))).toBe(true);
      const [mesh] = buildQuantumPrimitiveMeshes(view.geometry, [view.siteObject], [SUPERCELL_SITE_OBJECT_ID]);
      expect(mesh.primitivesByFace[0]).toMatchObject({ objectId: SUPERCELL_SITE_OBJECT_ID,
        sampleId: `${SUPERCELL_SITE_OBJECT_ID}:site:0`, index: 0 });
    });

  it("refuses out-of-contract expansion and preserves the maximum bounded cubic grid", () => {
    expect(() => buildQuantumLatticeSupercell(square, [9, 1, 1], [], null)).toThrow(/bounds/);
    expect(() => buildQuantumLatticeSupercell(square, [2, 2, 2], [], null)).toThrow(/bounds/);
    expect(buildQuantumLatticeSupercell(cubic, [8, 8, 8], [], null).instances).toHaveLength(MAX_LATTICE_INSTANCE_SITES);
    expect(() => buildQuantumLatticeSupercell({ ...cubic, basis: [cubic.basis[0], cubic.basis[0]] }, [8, 8, 8], [], null)).toThrow(/bounds/);
  });
});
