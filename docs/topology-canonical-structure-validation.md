# Topology canonical structure validation

T04 adds a pure shared-core validation layer over the T03 canonical finite 2D
artifact.  It certifies prerequisites; it does not compute homology, construct the
T06 sparse-matrix artifact, submit a worker job, render a realization, or replace
the released Topology UI.

## Validation input and source guard

`validateCanonicalFinite2DStructure(result, sourceDocument)` accepts a strict T03
canonicalization result and its exact T02 `TopologyDocument`.  Before inspecting
incidence it verifies:

- both envelopes normalize under their declared schemas;
- document ID, source revision, and structural hash match;
- canonical and document source IDs match;
- every authoritative canonical/source reference resolves to a source cell of the
  same dimension.

Stale, malformed, or unsupported artifacts fail closed.  They retain structured
diagnostics suitable for a view-only inspector but cannot pass the formal-analysis
gate.

## Structural checks

The validator checks exact finite incidence without consulting a mesh or R³ view:

- every oriented edge endpoint resolves to a canonical vertex;
- every face attachment resolves to an edge and forms a closed contiguous walk;
- edge attachment multiplicity yields isolated, boundary-candidate,
  interior-candidate, or unsupported edge links;
- vertex-link multigraphs yield empty, circle-candidate, interval-candidate, or
  unsupported link summaries;
- connected components and boundary-candidate edges are reported explicitly;
- the cellular precondition `d1*d2 = 0` is evaluated directly with integer
  coefficients before algebra is authorized.

This direct composition check is a prerequisite only.  T06 remains responsible for
the canonical sparse `d1` and `d2` matrix artifacts and locate-back tables.

## Eligibility and diagnostics

The immutable report separates three decisions:

- `cellularAlgebra`: references/incidence are structurally valid and the chain
  condition is verified;
- `formalHomologyJob`: the exact same gate used by the future T08 submission path;
- `surfaceManifold`: cellular algebra passes and the connected edge/vertex links
  satisfy the supported closed-or-bordered surface model.

`gateCanonicalFinite2DFormalHomology` recomputes validation and returns either an
exact source-generation/canonical-hash authorization or a denial containing
diagnostic codes.  Callers cannot authorize a job merely from a UI flag or a
previous report.

Every cell-specific diagnostic carries the canonical cell locator and its available
source references.  Invalid legacy sources therefore remain inspectable and
locatable while formal algebra remains unavailable.

## Compatibility boundary

T04 adds no persistent field, format version, UI control, worker route, or renderer
dependency.  Existing Topology validation/homology/rendering remains unchanged.
Later migration commits may adapt the UI to this shared report only after parity
tests name the current behavior they replace.
