# Scientific Notebook / Report workspace

Math3D already has Workbooks with Define, Compute, Visualize and Explain stages; text, formula, compute, view and assertion blocks; saved runs and stale status; templates; and Markdown, print/PDF, replay HTML and session-bundle export. Unified Projects owns mathematical documents, result provenance, relations and portable resources. The notebook should connect these existing systems. It is a presentation and investigation layer, not another document store or compute engine.

## Product contract

- A notebook is authored in the existing Workbook surface. Notebook cells reference ordinary Math3D Project documents or published results by stable ID and recorded source generation. They do not embed an independent editable copy of a Graph, Curve, Surface or Mesh.
- A reference remains bound to its original project identity. An edit to its source changes the displayed state to stale; missing or unsupported content remains visible as an unresolved reference with an explanation. No silent rebinding by title or display order.
- Live views may render a current document. Frozen figures retain the source generation, view settings and artifact references used to make them. A figure without verified resource bytes must not claim portability.
- Compute and rerun use the existing scientific job service/broker and project publication paths. A notebook cell never starts an independent queue or rewrites a saved result in place.
- Reports show status, method, engine, precision/tolerance where available, source revision, warnings and artifact availability. A printed or exported report must retain these qualifications.
- Existing Workbook `.math3d` session bundles and named Project JSON have different contracts despite similar filenames. Import must identify the envelope before mutation; migration of old Workbooks remains explicit and lossless.

## Commit sequence

| Commit | Scope | Acceptance |
| --- | --- | --- |
| NOTE01 `feat(notebook): define reproducible project reference contract` | Add a versioned Workbook reference to a Project document/result, with project ID, target ID, source generation and exact result hash; strict normalization and current/stale/missing resolution. Keep it in the existing Workbook package. | A project edit makes the reference stale, a missing or substituted target stays unresolved, a different project cannot satisfy the reference, and no copied source/result payload enters the cell. |
| NOTE02 `feat(notebook): add linked document and result cells to Workbook` | Add a reference picker and readable cards in the existing Workbook UI. Select from the active named project or a verified saved project; show the resolved document/result and navigation. | Graph, Curve, Surface, Mesh and Analysis references survive Workbook save/reopen; renamed display titles do not change targets; unsupported previews remain clearly disabled. |
| NOTE03 `feat(notebook): compose prose equations tables and figures` | Reuse text/formula/view blocks, add structured table and figure cells, and render Markdown and equations without executing document content. | A Catenoid Investigation can contain the requested narrative, formula, table and figure with accessible labels and bounded content. |
| NOTE04 `feat(notebook): display provenance and source freshness` | Inspect project relations, source generations, result authority and artifact availability for every linked cell. Keep historical evidence visible. | Source edits mark the right cells stale; missing sidecars cannot appear current; report views include revision, method, engine and warnings. |
| NOTE05 `feat(notebook): rerun stale analyses through existing execution` | Offer explicit rerun only for supported operations, routing through their existing commands and broker. Publish a new result and relink only after successful completion. | Cancellation, deadline, source changes and backend failure leave original evidence intact; no second scheduler is introduced. |
| NOTE06 `feat(notebook): export qualified publication artifacts` | Extend current Markdown, replay HTML, print/PDF and bundle exports with linked source manifests, verified figures, tables and provenance. | A fresh desktop/browser profile opens the portable bundle; exports show stale/missing qualifications and fail safely when required bytes are absent. |
| NOTE07 `feat(notebook): add scientific investigation starters` | Offer a Catenoid Investigation and other bounded investigations as Workbook templates that refer to normal Project documents/results. | Each instance gets fresh identities; no result or proof is invented; unsupported computation is an explicit next step. |

## Ownership and order

NOTE01 now provides the versioned reference and source-freshness inspection in `@math3d/workbook`, with a serialization and source-edit contract test. It does not yet add a reference picker or report cell to the UI; those are NOTE02–NOTE04.

NOTE01 is a small contract addition to `packages/workbook`. NOTE02–NOTE04 make that contract useful before adding rerun or export promises. Projects remains the authority for identity, provenance and resources; its separate workspace can continue without a parallel Project schema change here. The existing Workbook editor and exports remain the UI and migration base. A new top-level notebook mode is unnecessary until the linked-cell workflow is proven.

The first full acceptance journey should use the existing Minimal Surface Study: Graph `catenary-profile`, Curve `catenary-curve`, Surface `catenoid`, its recorded derivative, then a user-created linked Mesh and bounded curvature/shortest-edge-path results. The starter must not label a shortest edge path as a continuous geodesic or claim analytic minimality from numerical curvature.
