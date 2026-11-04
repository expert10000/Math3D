# SAGE-C01 Project ideal objects — 2026-11-04

## Delivered

CAS → Algebra → Structures now offers **New ideal** and an ideal dossier and Inspector. The Project algebra registry stores the ideal as a versioned object with a stable ID, immutable revisions, a definition hash, a pinned ambient ring revision and 1–8 exact polynomial generators. The Inspector shows those values and the parent dependency. An ambient ring definition change makes the saved ideal stale while preserving its historical definition.

C01 accepts a current, fresh polynomial ring directly over `QQ`, with at most eight variables. The generator parser accepts bounded explicit polynomial syntax with integer or rational coefficients, the ambient variables, powers up to 16 and total degree up to 16. It rejects foreign variables, executable syntax, malformed fractions, duplicate generators, missing or wrong parent references and changed hashes. This is a local syntax and Project consistency gate. Sage ideal construction, Gröbner computation and membership begin in C02/C03; the UI labels that boundary and does not offer ring operations for an ideal.

The record uses the existing `math3d:algebra:` Project identity and schema-v1 object envelope, with `kind: "ideal"` and a pinned `ambientRing` reference. Project export/import validates the complete algebra registry before accepting an independent copy.

## Acceptance

- Core tests export a Project with `Q`, `R = QQ[x,y]` and `I = ⟨x²+y, xy−1⟩`, independently parse it, and verify the same ideal ID, definition, hash and revision. They also verify a second immutable ideal revision and stale status after the ambient ring advances.
- Negative cases reject a non-polynomial or missing ambient ring, a variable outside `R`, malformed or oversized generators, and a conflicting duplicate object revision.
- Desktop acceptance creates an ideal through Structures, checks the dossier and Inspector, saves its Project, and opens the exported bytes in a fresh app profile with the same ideal identity and definition.

The B08 live Docker Sage 10.10 comparison remains an open gate while that runtime is unavailable on this PC.

## Next

**SAGE-C02** adds bounded Gröbner and elimination recipes with exact verification fixtures for saved ideals.
