# Topology exact sparse boundary matrices

T06 constructs exact cellular boundary operators from the T03 canonical finite 2D
complex after T04 structural validation succeeds.  It does not depend on T05 command
routing, compute homology, or change the released Algebra UI.

## Mathematical convention

Canonical cell arrays define the bases and their order:

- `d1: C1 -> C0` uses rows `canonical.vertices` and columns `canonical.edges`;
- `d2: C2 -> C1` uses rows `canonical.edges` and columns `canonical.faces`;
- an oriented edge contributes `-1` at its declared source endpoint and `+1` at its
  target endpoint;
- a face occurrence contributes its exact orientation sign to the corresponding
  edge/face coordinate.

All sums and matrix multiplication use `bigint`.  Stored coefficients are canonical
decimal strings.  The sparse encoding is row-major COO and omits zero entries.
Atomic `-1`/`+1` contributions are retained separately, so cancellations such as a
loop's zero `d1` column remain explainable.

T06 independently multiplies the constructed sparse matrices and publishes an exact
artifact only when `d1*d2` has no nonzero entry.  T04 validation is rerun for every
construction; a stale, malformed, or structurally invalid canonical artifact yields
an unsupported outcome and no matrix payload.

## Cell and source lookup

Each row and column basis entry contains its canonical cell locator and source
references.  Each atomic incidence contribution carries the relevant cell and
boundary-occurrence references.  `locateExactSparseMatrixCoordinate` therefore
returns:

- the exact aggregated coefficient, including `0`;
- row and column cell IDs/dimensions;
- all atomic contributions and their source references.

This is the T06 locate-back contract for the later Algebra view.  It does not use
display labels, mesh indices, or renderer selection state as mathematical identity.

## Artifact lifecycle

The encoded artifact format is `math3d.topology-boundary-matrices`, schema 1, with
media type `application/vnd.math3d.topology-boundary-matrices+json;version=1`.
It binds both matrices to the exact document ID/revision/hash/generation, canonical
hash, T04 validator version, and T06 algorithm version.

`publishCanonicalBoundaryMatrixArtifact` declares, computes, and publishes the
encoded bytes directly to the F07 `InMemoryArtifactRegistry`.  Its return value is
compact metadata, summary, and a `sparse-matrix` handle—never matrix entries or
bytes.  The T02 source document stores neither matrix.  F07 checksum, ownership,
source guard, resolution, and full invalidation rules apply unchanged.

Decoding is fail-closed: it validates schema/version/source guards, basis sizes,
coordinate bounds/order, nonzero integer encoding, exact aggregation of atomic
contributions, composable shapes, and zero chain composition.

## Compatibility boundary

The current renderer-side dense matrix/result implementation remains unchanged for
UI compatibility.  T06 is the shared artifact path for subsequent T07/T08/T09 work;
adapting the Algebra UI or persistent result references requires an explicit later
commit and parity tests.
