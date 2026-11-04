# GF-14–16 implementation checkpoint

**Date:** 2026-11-04
**Scope:** bounded scalar display and isosurfaces, orthogonal CPU LIC, typed analytic derived families.

## GF-14: scalar display and Mesh

- Displayed verified scalar samples produce a 32-bin histogram and 2nd, median, and 98th percentiles. Full, percentile, symmetric-around-zero, and manual color bounds affect display only. Nonfinite or oversized inputs are rejected. The transfer choice is saved in the existing scientific field document.
- The existing speed isosurface worker accepts up to eight ascending levels under one declared aggregate cap of 100,000 triangles and 30 seconds. Each level re-verifies the source; cancellation or a changed generation prevents late publication. Completed levels remain individually promotable through the existing source-linked Mesh path. Sampling is repeated per level, so multi-level performance should be optimized only after the correctness gate.
- A current saved three-dimensional scalar `DerivedFieldDocument` from analytic vector sources can be extracted at a signed level in a bounded box. Sampling is capped at 8,000 cells and 262,144 expression evaluations, with a separate 100,000 triangle and 30-second maximum. Mesh promotion stores the derived document generation and recipe hash, every root vector generation, sample hash, physical box, level, unit, grid shape, budget, and complete/limit state. The Project contains a generated-by relation; Mesh geometry is stored by the existing Mesh adapter. Reopen/status validation withholds a Mesh claim if its recipe or any root source changes or disappears.
- Scientific-bundle derived scalar extraction is not claimed here. It awaits the verified bundled-source sampler and the still-open foundation exit gate.

## GF-15: orthogonal LIC reference

- `computeVectorField3DLIC` consumes a source-pinned orthogonal vector slice with physical coordinates and equal plane-axis units. It uses deterministic noise, bilinear vector interpolation, and a midpoint streamline step. Missing vectors and boundaries stop a streamline; covered pixels are masked separately from gaps and stationary samples. Output records source generation, optional verified transfer coverage, seed, method, work, stop counts, elapsed time, and completion state.
- Resolution is capped at 192×192, 16 steps per direction, 1.5 million streamline steps, and 5 seconds. The Explorer preview uses 96×96, eight steps, 200,000 work units, and 300 ms; it shows measured interaction cost and stop counts. A local analytic fixture completed 9,216/9,216 pixels in **39.1 ms** on this development machine (Vitest, 2026-11-04). This is an observation, not a cross-device latency guarantee. Arbitrary planes and GPU LIC remain separate work.

## GF-16: typed operation families

- The GF-03 one-operation document now validates scalar, vector, and rank-two tensor outputs. Scalar gradient, Hessian, and directional derivative; vector Jacobian, symmetric and antisymmetric parts; dot, cross, difference, vorticity, helicity, and enstrophy have saved recipes. Binary operations pin both inputs. Source changes, missing parents, mismatched axes/frames or component units, and cycles are rejected or withheld by the Project review path. Existing unary GF-03 identities and cache keys remain readable.
- Analytic execution is bounded by 262,144 source evaluations. Finite differences use physical axis steps and one-sided boundary stencils. The tests cover exact linear-field Jacobians, rotational vorticity, scalar derivatives, binary values, stale secondary sources, save/reopen, and the work cap. Scientific-bundle execution and advanced tensor eigenvalue measures (Q-criterion, lambda-2, swirling strength) require their own numerical/verification gates.

## Review evidence and open gate

Focused tests: `scientificFieldTransfer.test.ts`, `vectorField3DLIC.test.ts`, `derivedScalarIsosurfaceMesh.test.ts`, `runBoundedMultiIsosurfaces.test.ts`, `derivedFieldFamilies.test.ts`, and the GF-03 `projectDerivedFields.test.ts`. These cover the Project and Mesh package round trip, generation withholding, numerical oracles, transfer behavior, missing data, budgets, and cancellation. The desktop `graph-field-gf14-gf16.spec.ts` gate saves and reopens the derived recipe, extracts its scalar isosurface, promotes it to Mesh, and saves the Project. The renderer and main builds and repository typecheck pass. Desktop reopening of a saved Mesh with its binary sidecars remains a separate resource-transfer gate.

The **GF-FOUNDATION verified bundled-source profile exit gate remains open**. A full second-delivery milestone cannot be claimed until that source can execute the saved magnitude → slice → profile chain with verification, reopen, resource-change withholding, and explicit refresh in both Explorer and Graphs.
