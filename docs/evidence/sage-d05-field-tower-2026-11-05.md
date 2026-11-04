# SAGE-D05 extension tower viewer — 2026-11-05

Structures now builds a bounded relative quadratic field extension from a saved quadratic number field. The Project record pins the base field revision, stores a squarefree rational radicand and a distinct generator, and validates that the new radicand is not already a square in the base. This gives an exact `Q → K=Q(√2) → L=K(√3)` fixture with basis `1, a, b, ab` and absolute degree four. Invalid bases, square or repeated radicands, and tampered reconstruction degree metadata are rejected.

The Field tower diagram uses saved object references and verified constructors for its edges. It shows each pinned inclusion, generator image in the absolute basis, both defining relations, the composed `Q ↪ K ↪ L` inclusion, and the tower law `[L:Q]=[L:K][K:Q]=2×2=4`. Selecting a node opens its Structure dossier in the Inspector, including after a saved result was selected. If a base advances, its historical pinned revision remains visible and its dependent extension is marked stale. The Sage reconstruction route checks the actual base coercion map, both defining relations and all three degrees before accepting worker evidence.

**Acceptance:** Exact core tests cover independent `.math3d` serialize/parse, stable IDs and revisions, both inclusion edges, the composed inclusion, degree products, stale historical parents, invalid definitions and forged Sage metadata. Real local Sage 9.5 reconstruction confirms `K.extension(t²−3)`, an available `K → L` coercion map, zero defining relations and absolute degree four. A controlled desktop Sage route creates the extension in the builder, saves reconstruction evidence, exports the Project and reopens the same object and evidence in a fresh profile. The desktop route's reported Sage 10.10 version is a test fixture; it is not a live Docker result.

The first tower builder deliberately covers a quadratic extension of a saved quadratic field with small squarefree rational radicands. The diagram does not claim arbitrary field embeddings or deeper towers. **B08's live Docker Sage 10.10 comparison remains open.**

**Next:** SAGE-D06 Galois analysis and subgroup views.
