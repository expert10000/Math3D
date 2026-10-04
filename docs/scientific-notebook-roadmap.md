# Notes and Scientific Workbook roadmap

Math3D has an existing Workbook with Define, Compute, Visualize and Explain stages, block ports, parameters, saved runs, stale status, snapshots, templates and exports. Unified Projects owns mathematical documents, relations, results and resources. `NOTE01` and `NOTE02` already add exact Project document/result references to Workbook cells.

## Distinct jobs

- **Notes** capture observations during exploration without changing workspaces. A Note can be plain text, a callout, a pinned annotation or a result annotation. It may point to a Project document, selection, subentity, result, Workbook block or snapshot. It does not execute computations or assert that an observation is proved.
- **Workbook** is the structured, reproducible investigation: inputs, operations, outputs, dependencies, evidence and explanation across the existing stages. It uses the current Workbook package, Project identities and scientific job broker.
- **Project** is the shared container and identity authority. Notes and Workbooks link to ordinary Project documents/results; neither creates a private copy of a Graph, Surface, Mesh or result. Gallery and Reports present selected Project/Workbook content.

The target user journey is **explore → capture a Note on a selection/result → add it to a Workbook → inspect affected blocks → publish a qualified report**. The existing Block editor remains available beside a sequential Document view.

## Contracts to settle first

1. Store Notes as versioned, project-scoped records with stable IDs and explicit anchors. A Note captured before the workspace has a saved Project remains a session draft until the user saves that Project; it does not acquire an invented persistent Project ID. Use shared core reference, source-generation and provenance contracts. Keep Workbook's existing schema in `packages/workbook`; do not move or duplicate it under `packages/core`.
2. Resolve anchors by ID and recorded generation. Object-local positions survive transforms; face/edge/vertex anchors also record topology generation. If an anchor can no longer be resolved, show it as detached/stale rather than guessing the nearest entity. Graph-point and curve-parameter anchors need their own coordinate rules.
3. Extend existing Workbook block ports, parameters and Project references with typed dependency edges. Reject cycles. Compute current/stale/missing/failed states transitively from source generations and saved outputs. `Run affected` uses existing operators and the scientific broker, with explicit user action and no second queue.
4. Keep Note text and live `{{value}}` references separate. Bind only allowlisted, typed values to stable IDs; never evaluate arbitrary text or infer a target from its display name. A frozen snapshot records values and source generations, while a live Note shows the current value and its freshness.
5. Treat a Claim as an evidence-bearing Workbook item, stronger than a Note. Numerical evidence may **support** or **contradict** a bounded claim; it cannot silently become a mathematical proof. Reserve **verified** for a declared checker or proof method. Preserve historical evidence when sources change.
6. Exports retain source revision, method, backend, warnings, result authority and artifact availability. A portable figure requires verified bytes. Existing Workbook session bundles and named Project files remain distinct formats with explicit import/migration.

## Integrated commit sequence

`NOTE01` (`e6996c4`) and `NOTE02` (`b3ee6d6`) are complete. NTS01 provides the shared Note contract; orders 1–8 form the first usable Notes + Workbook milestone. Later rows extend the existing `NOTE03`–`NOTE07` plan without renumbering those commits.

| Order | Commit | Scope and acceptance |
| --- | --- | --- |
| 1 | **NTS01** `feat(notes): define project note and anchor contracts` | Add versioned Note kinds, IDs, project membership, target references and anchor resolution in shared core. Serialization and validation tests cover missing targets, source edits, transforms and invalid topology generations. No new compute path. |
| 2 | **WB00** `feat(workbook): bind saved Workbooks to named Projects` | Give an existing Workbook stable Project membership and save/reopen through the Project without changing its block schema. Explicitly adopt a personal Workbook; preserve existing standalone sessions and distinguish their bundle format during import. A block anchor survives Project round-trip. |
| 3 | **NTS02** `feat(notes): add quick capture and Notes sidebar` | Create a Note from the current selection/result or a global action without changing modes. Add search and filters for all, scene, object, result and Workbook. Save/reopen in the named Project and show detached anchors. |
| 4 | **NTS03** `feat(notes): attach notes to selections results and blocks` | Attach/reopen Notes on a scene object or subentity, Graph selection, saved result and Workbook block using stable IDs. An edited or deleted target reports its exact state; titles and list order cannot silently rebind it. |
| 5 | **WB01** `feat(workbook): formalize block dependency edges` | Extend the existing input/output and Project-reference model with typed block/result/note dependencies and cycle checks. Old Workbooks migrate without losing blocks, saved runs or port data. |
| 6 | **WB02** `feat(workbook): propagate source freshness through blocks` | Mark downstream blocks current, stale, missing or failed after a source/parameter/result change. Show the cause and affected path; existing Run stage/Run all stale controls use that state. No automatic rerun. |
| 7 | **WB03** `feat(workbook): add sequential Document view` | Add Outline / Document / Block views over the same Workbook data. Stage order, linked documents, result cards and Notes render accessibly; edits in either view agree after save/reopen. |
| 8 | **NTS04** `feat(notes): link notes and workbook explanations` | Add Note → Workbook and Block → Note actions. Workbook stores a Note ID and recorded generation; promotion keeps the original Note and source context. An explicit copy-to-prose action may produce independent text. |
| 9 | **NTS05** `feat(notes): render anchored viewer pins` | Add Off / Pins / Labels / All display modes. Initially support verified world/object-local anchors; then face barycentric, Graph x and Curve parameter anchors when their transforms/revisions are defined. Detached pins stay in the sidebar. |
| 10 | **NOTE03** `feat(notebook): compose prose equations tables and figures` | Reuse text/formula/view blocks and add bounded table/figure cells. Render Markdown/math as content, not executable code. A Catenoid Investigation reads as a document with accessible labels. |
| 11 | **NTS06** `feat(notes): resolve typed live value tokens` | Add an allowlisted token picker/resolver for selection, parameter and saved result values. Display units, source and stale/unavailable state; freeze resolved values in snapshots and exports. Unknown tokens remain literal and never execute. |
| 12 | **WB04** `feat(workbook): bind named parameters to affected blocks` | Give parameters stable IDs, units, bounds and explicit edges to operations/views. A parameter edit marks only descendants stale; `Run affected` previews work and uses existing operators/broker. |
| 13 | **NOTE04** `feat(notebook): display provenance and source freshness` | Show Project relations, source generations, result authority, method/backend and verified artifact availability in linked cells and Document view. Historical results remain visible with stale qualifications. |
| 14 | **WB05** `feat(workbook): add claims with bounded evidence` | Add claim text, cited results/snapshots and unverified/supported/contradicted/stale status. A verified state requires an explicit checker. Integrate with existing Claims UI without conflating construction claims and free-text notes. |
| 15 | **NOTE05** `feat(notebook): rerun stale analyses through existing execution` | Offer rerun only for supported operations. Cancellation, source changes or backend failure preserve prior results; success publishes a new result before any relink. |
| 16 | **WB06** `feat(workbook): freeze provenance-aware snapshots` | Capture source generation, camera, visibility, coloring, selection, annotations, result IDs, hashes and time. Live scenes and immutable snapshots are visibly distinct; unavailable sidecars cannot appear portable. |
| 17 | **NOTE06** `feat(notebook): export qualified publication artifacts` | Select report blocks and extend Markdown, HTML, print/PDF and portable bundle exports with linked-source manifests and qualifications. Open a bundle in a fresh desktop/browser profile; fail safely when required bytes are absent. |
| 18 | **NOTE07** `feat(notebook): add scientific investigation starters` | Add Catenoid, curve, mesh and Graph investigations with fresh identities and normal Project references. Templates state missing computations instead of inventing results or proofs. |
| 19 | **WB07** `feat(workbook): publish workbook Gallery entries` | Gallery opens a prepared Project + Workbook/lesson through a compatibility preview. Edits create a normal user-owned instance; the published starter remains immutable. |

`WB00` is the integration point with the separate Projects work. Its Project format change should be based on the accepted Projects contract on `main`, rather than introducing a parallel container or changing the Workbook format in two places.

## First milestone acceptance

Use the existing Minimal Surface Study. Create a Note on its Graph or Surface, attach another to a saved numerical result, add one Note to a Workbook, and view Graph → Curve → Surface → Analysis in Document view. Edit the Graph: the Note anchor and affected Workbook path must show the correct freshness without changing unrelated blocks. Save/reopen on desktop and web, then inspect the same IDs and explanations. The test must not call a numerical shortest-edge path a continuous geodesic or present numerical curvature as a proof of minimality.

Mobile can read shared records only when its Project contract and UI support them; unsupported anchors and cells must remain explicit instead of being dropped during transfer.
