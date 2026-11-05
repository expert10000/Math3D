# SAGE-E01 finite group object schemas — 2026-11-05

Project algebra records now support a versioned `finite-group` definition in two bounded forms. A **permutation group** stores degree 2–8, one to three named image permutations and up to eight checked relation words. Core validates that every image is a permutation, evaluates every relation as the identity, enumerates the generated group with a 64-element cap and derives exact generator orders. A relation is reported as a verified identity; it is not claimed to be a complete abstract presentation. A **finite abelian group** stores a divisibility-ordered invariant-factor list and matching generator names. Core derives its product order with a cap of 256 and its complete invariant-factor presentation.

CAS → Algebra → Structures includes a local **New group** builder with exact previews for `C4`, `V4`, `S3`, square-symmetry `D4` and the regular permutation action of `Q8`. The saved dossier and Inspector show representation, order, generators, images or invariant factors, checked relations, ID, definition hash and revision. The objects require no Sage runtime, retain stable identities through Project export and import, and do not acquire runtime operations until the E02 capability gate.

**Acceptance:** The five small fixtures have exact orders `4, 4, 6, 8, 8` and respectively `1, 3, 3, 5, 1` elements of order two, distinguishing `D4` from `Q8` and `C4` from `V4`. Core tests reject duplicate or non-bijective images, false relations, invalid invariant factors, oversized generated groups and duplicate revisions. The Project bundle independently reopens all five definitions with unchanged IDs, revisions and hashes. A desktop acceptance test saves the `D4` preset, exports the Project and reopens its definition and dossier in a fresh profile.

The B08 live Sage 9.5/10.10 matrix is [closed for its bounded fixtures](sage-b08-live-2026-11-05.md). Live Docker parity for D06 remains a separate gate.

**Next:** SAGE-E02 GAP capability operations for saved finite groups.
