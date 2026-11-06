# GF-56–58 reviewable gates

## GF-56 — verified bundled-source FTLE

The GF-53 2×2 → 4×4 refinement runs against the pinned, verified
21×21×17 vortex bundle at two GF-27 times. Both calculations use fresh
checked transfers; the temporal source enforces a 2 MiB frame and 4 MiB
aggregate transfer cap. The FTLE solver retains its 60,000-sample cap,
progress and cancellation. The physical slice rejects an edge coordinate;
incompatible coordinate/velocity units are refused by the existing GF-50
admission rule. The convergence tolerance is explicit in Explorer. The
vortex fixture needs a wider tolerance than the analytic expansion fixture;
cells outside it remain unavailable gaps.

The saved result and checked Graph table reopen with scientific values
withheld until the pinned bundle transfers verify. A changed frame keeps
the old Graph row withheld. A replacement temporal generation requires a
new saved GF-50 field and GF-53 profile; an explicit single Graph edit then
refreshes the existing row ID and its lineage.

## GF-57 — topology-event linkage

Saved GF-52 exact-frame events are a prerequisite. The linkage pass
extracts bounded connected component meshes, compares physical bounds
between adjacent frames, and applies GF-54's shared bidirectional remesh
gate only to a unique, topology-stable one-to-one candidate. Other edges
are labelled possible split/merge or ambiguous; unmatched components are
sampled-frame appearances or disappearances. The result pins source and
mesh signatures, the saved event result, links, and measured geometric
errors. It round-trips through Project and withholds after source or event
evidence changes. All linkage playback stays on exact frames; even a
geometric one-to-one match does not establish material identity.

## GF-58 — local manifold atlas

Two saved, current GF-55 patches of the same source and branch can form a
bounded atlas. The gate checks orientation, sampled bidirectional overlap
distance, transverse intersections, declared source domain, at most 192
vertices and 384 triangles, and a 1,000,000-evaluation cap. A projected
16×16 bounding-box grid records uncovered cells. The result and combined
unwelded Mesh pin both patch results and geometry hashes. Mesh bytes must
verify after Project reopen. The source guard withholds stale geometry and
the result always says `local-finite-time` and `globalClaim: withheld`.
Projected bounds and patch overlap do not establish global coverage.

## Evidence

- `tests/unit/gf56BundledFtleProfile.test.ts`: real transfer verification,
  edge and memory rules, cancellation, Project reopen, changed-frame
  withholding and explicit Graph row replacement.
- `tests/unit/gf57SurfaceLinkage.test.ts`: remeshed stable component,
  provisional merge and disappearance links, Project reopen and source
  withholding.
- `tests/unit/gf58ManifoldAtlas.test.ts`: overlap, coverage, work and
  cancellation checks, Mesh bytes, Project reopen and stale source.
- `tests/e2e/graph-field-gf56.spec.ts`, `graph-field-gf52.spec.ts` and
  `graph-field-gf58.spec.ts`: desktop saved-result workflows.
