# SAGE-D02 shared Algebra and Number Theory references — 2026-11-04

CAS / Algebra and Number Theory now mount the same Project Structures explorer, dossier, contextual Operations, Recipes and evidence Inspector. Both resolve the same `math3d:algebra` object IDs, immutable revisions, definition hashes, pinned parent references and Project serialization. A saved number field or polynomial ideal can be selected in either workspace; Number Theory no longer needs a parallel field or ideal storage model. The existing bounded freeform GCD and modular-inverse Services remain in the Number Theory Operations area.

**Acceptance:** A desktop Project containing `Q`, `K = QQ(√5)`, `R = QQ[x]` and `I = ⟨x²−5⟩` displayed the same `K` and `I` records in both workspaces. The `K` ID and hash were unchanged after export and fresh-profile import. The shared callbacks save new objects, recipes and evidence through the existing Project library path. The D02–D04 desktop workflow gate covers this cross-workspace lifecycle.

**Next:** SAGE-D03 typed norm, trace and embeddings. B08's live Docker Sage 10.10 comparison remains open.
