# Pinned local Weyl cone fixture

`run-f8bf5412469c49b7bb878b8001d341cf-weyl.qscene` and
`weyl-local-producer-result.json` were exported from the Theory Lab native
worker using `npx tsx scripts/export-weyl-fixture.ts <existing-folder>`.

Scope: Atlas `weyl_minimal`, `Hχ(q)=χv q·σ`, `χ=+1`, `v=1`, sphere radius 1,
two icosphere subdivisions (162 samples, 320 outward faces). The occupied
band has enclosing flux `-2π` and Chern `-1`; the local node chirality is
`+1`. This is a local continuum model, not a periodic lattice. There are no
surface states, Fermi arcs, or partner nodes in this bundle.

The bundle and original result have separate SHA-256 identities. Math3D
verifies bundle bytes on every open and exact sample selection. It displays
stored samples and does not recompute the Hamiltonian or topological charge.
