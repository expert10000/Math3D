# Topology Algebra publication

T09 turns the existing Topology **Algebra View** into the publication surface for
the exact finite-complex pipeline delivered by T03 through T08. It keeps Diagram,
Complex, and Realization views intact and never treats an R3 rendering as formal
topological evidence.

## Authority and displayed provenance

The view derives its authority from the current kernel-owned Topology document. It
canonicalizes that document with T03, validates and constructs the T06 exact sparse
boundary artifact, and computes the T07 local finite-field result from that same
artifact. The Algebra provenance card displays:

- document ID;
- source revision, generation, and structural hash;
- canonical-complex hash;
- exact boundary-matrix artifact ID; and
- the explicit rule that formal answers do not come from the displayed R3
  realization.

Every formal result section repeats the current source stamp. Matrix and homology
controls retain canonical cell IDs and authored source references.

## Published integer homology

**Run exact Z homology (Sage)** submits the already-reviewed T08 allowlisted job. A
successful F06 publication displays `H0` through `H2`, free ranks, torsion invariant
factors, boundary Smith diagonals, coefficient ring `Z`, SageMath version, algorithm,
elapsed time, diagnostics, source generation/hash, and the T06 artifact ID.

The UI has distinct states for idle, running, exact, cancelled, timed out, stale,
unavailable, and failed work. Cancellation and source edits cannot publish late
results. If SageMath is absent or times out, the T07 result remains visible only as
`Z/2Z` feedback; it is never relabeled as an integral or torsion answer.

The pre-existing renderer integral calculation remains visible as a clearly labeled
compatibility preview. It does not replace the external publication state.

## Matrix and cycle locate-back

Every coefficient in `d1` and `d2` is selectable. The evidence panel reports its
exact integer value, row and column basis cells, atomic signed incidence
contributions (including cancellation to zero), and buttons that locate authored
vertices, edges, or faces in Diagram View. Homology representatives expose both
canonical-cell inspection and direct source-location controls.

This preserves the distinction between:

- editable authored cells;
- canonical quotient cells;
- exact algebra artifacts and results; and
- illustrative display realizations.

## Verification boundary

The T09 unit contract covers exact coefficient/source locate-back, integral group and
torsion publication, Smith data, engine/source/artifact provenance, stale rejection,
and coefficient-safe unavailable/timeout fallback. The semantic-safety E2E check
covers the provenance card, job controls, exact matrix selection, and authored-source
location affordance.

A live SageMath execution remains an environment-specific integration check on a
desktop or CI runner that has the optional Sage backend installed. The absence of
that backend does not weaken or silently change local `Z/2Z` semantics.
