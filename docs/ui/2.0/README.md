# Math3D 2.0 UI cleanup drafts

Review source: `2cf4b6a4b096ff08f3e7c8e928c542d25acca065`; native source app reviewed on 2026-11-15. These drafts extend the review approach of Geometry #61 to five other workbenches. They are not release approval or new mathematical specifications.

- [Mesh](MESH_UI_REVIEW_DRAFT.md)
- [Complex Analysis](COMPLEX_ANALYSIS_UI_REVIEW_DRAFT.md)
- [Topology](TOPOLOGY_UI_REVIEW_DRAFT.md)
- [Surfaces](SURFACES_UI_REVIEW_DRAFT.md)
- [Graphs](GRAPHS_UI_REVIEW_DRAFT.md)
- **[Shared draft state and thread coordination](DRAFT_STATE.md)** — read and claim work here first.

The first shared implementation is SHARED-01, a presentation-only correction for unrelated mesh state leaking into Graphs/Topology/analytic Complex footers. Keep module owners, identities, scientific contracts and existing execution evidence unchanged. The existing Integration Lab remains the execution-evidence owner; this Git state file coordinates work, not a parallel acceptance system. Windows signing remains separate and Cloudflare excluded.
