# SAGE-D01 number-field objects — 2026-11-04

## Delivered

CAS → Algebra → Structures → New structure now has a **Quadratic number field over QQ** builder. A saved field pins a current `QQ` object revision and stores a versioned, declarative monic quadratic with canonical integer coefficients and a generator name. The D01 bound is `x² + bx + c`, with `b,c ∈ [-4096,4096]`; a nonsquare discriminant proves irreducibility over `QQ` before saving. Reducible, malformed, oversized and wrong-parent definitions are rejected. The Project registry and reconstruction envelope check the parent revision, dependencies and definition hash.

The builder preview and saved Structures dossier show the exact defining polynomial, degree, signature, polynomial and field discriminants, power and integral bases, ring of integers, and both symbolic generator embeddings. The Project Inspector shows the object ID, revision, definition hash and pinned base field. The constructor preview states when its Docker Sage route is unavailable. On an advertised route, the bounded worker reconstructs the field with Sage `NumberField`, verifies irreducibility again, and returns exact field metadata including the actual count of embeddings into `QQbar`. The saved operation Inspector can display this metadata. Structures, generic reconstruction and domain inspection share the existing Project algebra object model.

## Acceptance

- Core exact fixture: `K = QQ(a)`, `a² - 5 = 0` has polynomial discriminant `20`, squarefree radicand `5`, field discriminant `5`, signature `(2,0)`, power basis `(1,a)`, integral basis `(1,(1+a)/2)`, and embeddings `a ↦ ±√5`. Its exported `.math3d` Project independently imports the same `Q` and `K` IDs, definitions, revisions, dependencies and hashes.
- Rejection fixtures cover `x² - 4`, noncanonical and out-of-bound coefficients, an unsafe generator, forged hash, missing parent and a base that is not `QQ`. The reconstruction result parser rejects a changed field discriminant.
- Real local Sage 9.5 worker tests construct `QQ(√5)` with degree 2, signature `(2,0)`, discriminants `20` and `5`, power basis `[1,a]`, two embeddings, and a two-element integral basis; they reject a reducible polynomial and wrong parent. The Sage integral basis may use a different but equivalent basis than the locally presented canonical one.
- A desktop acceptance run creates `K` through the builder, rejects `x² - 4`, saves `K`, exports the Project, and independently opens the exported bytes in a fresh profile with the same object ID, revision, hash and dossier.

D01 deliberately limits definitions to bounded quadratic fields. General defining polynomials, field towers, norm and trace, prime decomposition and Galois analysis remain later Track D gates. The **B08 live Docker Sage 10.10 comparison remains open** because that runtime is unavailable here; the local Sage 9.5 and controlled desktop checks do not close it.

## Next

**SAGE-D02:** share pinned number-field and ideal object references across Algebra and Number Theory without duplicating serialization schemas. Complete B08's live Docker Sage 10.10 comparison when that runtime is available.
