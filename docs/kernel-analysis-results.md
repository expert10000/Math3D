# Compact analysis results and provenance

F06 adds the durable analysis-result contract in `@math3d/core`.  It sits between
F05 scientific execution and future result consumers: an F05 job can produce a
large transient output, while an F06 record publishes only compact scientific
meaning, complete provenance, diagnostics, and opaque artifact handles.

Existing Topology, Complex, Surface, Curve, Mesh, and Volume result stores are not
migrated by F06.  Unversioned results remain readable as `legacy-limited`; the
compatibility path does not infer a source revision, algorithm, engine, tolerance,
or epistemic status that the old record did not provide.

## Versioned envelope

A schema-v1 envelope contains:

- a caller-owned stable `resultId`;
- one explicit status: `exact`, `certified`, `numerical`, `recognized`,
  `heuristic`, `unsupported`, `failed`, or `cancelled`;
- exact source identity: stable document ID, revision, structural hash, and
  generation;
- namespaced operation type, algorithm and version, canonical parameters,
  engine and version, elapsed milliseconds, and optional numeric context;
- a compact JSON summary, warnings, structured diagnostics, and artifact handles.

`numerical` results must declare precision or tolerance.  Other statuses may also
record numeric context when it is scientifically relevant.  Normalization rejects
unknown fields and non-canonical data, returns a detached recursively frozen value,
and preserves no transient UI state.

## Compactness boundary

The result record is metadata, not an artifact container.  F06 enforces a 64 KiB
maximum envelope, 16 KiB maximum summary and parameter blocks, bounded JSON depth,
node count and array length, and explicit rejection of common embedded grid, sparse
matrix, mesh, and binary payload fields.  Typed arrays and buffers are not canonical
JSON and are rejected as well.

Large values use an `AnalysisArtifactHandle` with only an opaque ID, a typed kind,
and a semantic role.  The accepted kinds include sampled grids, sparse matrices,
meshes, binary data, tables, images, and other artifacts.  F07 owns registry lookup,
artifact bytes, size/checksum verification, availability, invalidation, and cleanup;
F06 deliberately does not put those concerns into the result envelope.

Compact numerical summaries such as counts, extrema, norms, error estimates, and a
small list of invariant values remain inline.  Render geometry, sampled scalar
fields, matrix storage arrays, and full solver output do not.

## Publishing an F05 result

`createAnalysisResultFromScientificJob` accepts an F05 successful result only while
all four source-generation fields still match the caller's current source.  The
function derives the operation type and source from the job result, then requires
the caller to supply algorithm, parameters, engine, timing, status, and a compact
summary explicitly.

The bridge never copies `jobResult.output` implicitly.  A publisher must summarize
that output and register any large products as artifacts.  Stale publication throws
before an envelope exists, and the normal envelope validator still applies all
scientific metadata and compactness rules.

## Compatibility reads

`normalizeAnalysisResultRecord` handles two cases:

1. A value with `schemaVersion` is treated as a claimed versioned result and must
   pass the full strict validator.
2. A genuinely unversioned value becomes `legacy-limited` with a warning and, only
   when safe and compact, a display summary.

Legacy classification intentionally has no scientific result status.  A malformed
schema-v1 value is an error, not a legacy escape hatch.  This lets module UIs adapt
incrementally while keeping new durable results trustworthy.
