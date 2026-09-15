# Topology Sage integer-homology boundary (T08)

T08 adds exact integral homology as a constrained scientific job. It does not add a
general Sage scripting surface to the Topology module.

## Trusted data path

1. T03/T04 produce and validate a canonical finite 2D complex for one exact source
   document revision, structural hash, and generation.
2. T06 produces exact sparse integer boundary operators `d1` and `d2`, verifies
   `d1*d2 = 0`, and stores the full artifact behind its F07 handle.
3. T08 copies only the compact matrix shapes and ordered nonzero integer entries into
   the versioned `math3d.topology-integer-homology-input` payload.
4. F05 applies request size, output size, memory, work, deadline, cancellation, and
   source-generation checks around the reviewed Sage adapter.
5. The Dockerized Sage worker accepts only
   `sage.topology.integer_homology`. It rejects unknown fields, expression/source/code
   fields, malformed dimensions, duplicate or unordered coordinates, oversized
   complexes, large coefficients, and a failed chain condition.
6. SageMath constructs a chain complex over `ZZ`, computes `H0` through `H2` with its
   integer Smith-normal-form path, and returns free rank, torsion invariant factors,
   compact boundary Smith diagonals, engine version, elapsed time, and diagnostics.
7. F06 publishes only a strict compact result after rechecking operation identity,
   source freshness, canonical hash, matrix handle, and chain dimensions.

The reviewed adapter passes Math3D's column-vector boundary matrices directly to the
degree-minus-one Sage chain complex, whose differential matrix left-multiplies a
column vector. Explicit zero differentials close nonempty `C0` and `C2` ends as
required by the Sage constructor.

## Limits and cancellation

The worker has reviewed hard ceilings of 4,096 total cells, 32,768 combined sparse
nonzeros, and 128 decimal digits per nonzero coefficient. F05 additionally applies
the caller's byte, memory, work, and deadline limits. Cancellation or deadline expiry
withholds late output; a result is also withheld if the source changes before
publication.

## Fallback semantics

When the Sage adapter is unavailable or times out, the T07 local result remains
available. That fallback is always labeled `Z/2Z`; it is never relabeled as integral
homology and never claims torsion. An explicit cancellation does not automatically
start fallback work.

## UI boundary

T08 establishes the computation and publication contracts. T09 is responsible for
showing integral groups, torsion, Smith data, job state, engine/version, source
revision/hash, diagnostics, and matrix/cell locate-back in the Algebra view.
