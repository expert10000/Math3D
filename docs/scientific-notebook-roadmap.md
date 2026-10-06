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

`NOTE01` (`e6996c4`) and `NOTE02` (`b3ee6d6`) are complete. NTS01 provides the shared Note contract. WB00 binds Workbooks to named Projects through a checksummed resource, while personal Workbook sessions retain their separate file format. Orders 1–8 form the first usable Notes + Workbook milestone. Later rows extend the existing `NOTE03`–`NOTE07` plan without renumbering those commits.

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

`NTS02` adds session Note drafts, quick capture and a searchable Notes sidebar. Saving a named Project binds drafts to it; later Note saves keep their captured workspace sources with the Project. `NTS03` attaches Notes to exact Geometry and Mesh object/subentity IDs, Graph objects and probes, chosen saved results, and saved Workbook blocks. The Notes sidebar checks current, stale, and missing targets and opens their source document or Workbook stage. Geometry, Mesh, and Surface study Workbook presets guide these checks.

`WB01` adds explicit dependencies to the existing Workbook: a block may depend on another block, a Project document/result, or a Note. Project sources retain their recorded generation; Note links retain ID, revision and hash. The block editor shows link status and rejects cycles, including a Note anchored to a downstream Workbook block. This is a provenance and ordering contract; `WB02` will propagate freshness through the graph, and reruns remain explicit.

`WB02` resolves current, stale, missing and failed states across those links and existing Project reference cells, with an affected path in the Workbook editor. New block links record a source fingerprint; older links report stale until explicitly refreshed. Compute input hashes include linked sources, so an edited block or refreshed Project/Note link invalidates the existing saved run without deleting it. Run controls skip unresolved sources and never start work automatically.

`WB03` adds Outline, Document and Block views over the same Workbook record. Document view reads stages in order and resolves Project documents, saved results and linked Notes by their IDs, showing their current status and the named Project that owns the Workbook. Text and formula edits in Document view update the existing blocks; Edit block returns to the full editor. Personal Workbooks remain drafts until explicitly saved from Projects. `NOTE03` extends this view with richer content.

`NTS04` lets a saved Project Note be sent to a block in a Workbook owned by that same Project. The existing dependency edge stores the Note ID and generation, and the Project saves the updated Workbook resource. Workbook views expose an Open Note action; later Note edits leave the recorded link stale until explicitly refreshed. Sending does not alter the Note's original anchor or copy its prose into the Workbook.

`NTS05` adds Off, Pins, Labels and All display modes to the Geometry viewer. Current object-local Note anchors in the active Project are placed with the live object's scale, rotation and translation. The viewer omits stale, missing, hidden and unsupported anchors; those Notes remain available in the Notes sidebar. Face, edge, vertex, Graph and Curve placement waits for precise coordinate contracts.

**NTS05 delivery, October 6:** Geometry object-local pins and display modes are implemented (`357721b`). The **Geometry Notes and Pins** starter Project supplies a box and sphere with two anchored Notes (`abdcaf3`); its card opens an independent saved Project directly from the Projects Gallery (`d31907f`). A Fast viewport correction keeps the pins and readable labels visible and redraws immediately when the display mode changes (`5e7b990`). The three Project Notes desktop journeys, including an Off/All viewport pixel comparison in Fast mode, pass. Face, edge, vertex, Graph and Curve pin placement remains planned until their coordinate contracts are defined.

## NOTE03 and NTS06 delivery — October 6

**NOTE03 delivery, October 6:** Existing text/formula/view blocks now render
bounded Markdown, inline math and display equations, literal tables and captured
figures with captions and accessible descriptions. Tables allow 1–12 named
columns and up to 100 rows; figures use existing Snapshot A with bounded inline
PNG/JPEG bytes. HTML and image syntax in prose remain literal, and math rendering
disables trusted HTML commands and bounds input, expansion and output. Invalid
equations preserve their source with an explicit fallback. Document and Block
views edit the same records. Project Workbook resources retain the new content;
Markdown and print/PDF reports include it. Shared Workbook definitions initialize
in their own production chunk to keep both editors usable on startup. The
Catenoid Investigation desktop journey verifies rendering, editing, literal
HTML, image labels, Markdown/HTML output and cold reopen of the bound Workbook.

**NTS06 delivery, October 6:** Saved Notes have an explicit typed value picker
and `{{value:id}}` tokens. Supported targets are controlled Graph variables,
numeric source parameters, Geometry object position coordinates and an
allowlist of saved length, curvature, count and topology scalars. Targets retain
document IDs/generations, object or parameter IDs, and exact result IDs/hashes;
labels never resolve a target. Live values display units, source and
current/stale/unavailable status. Source edits qualify values as stale, removed
targets become unavailable, and unknown tokens remain literal. Freeze values
records a checked snapshot against the workspace being saved. Export value
snapshot captures a separate immutable Note without changing the saved Project;
Project resource exports also retain frozen values. Old Notes preserve their
existing serialized fields and hashes. The parameter desktop journey verifies
live edits, units, freshness, unknown tokens, nonmutating snapshot export,
freeze, Project export and cold reopen, followed by a return to live values.

Verification for these deliveries: Project contract tests, Workbook/Notes unit
regressions, application and mobile typechecks, desktop/web builds, kernel
dependency checks, and `tests/e2e/project-next-three.spec.ts`. At that point, the
next integrated Notebook item was **WB04**. Other selection coordinate systems,
richer result types and provenance-aware publication bundles remain in later rows.

## WB04, NOTE04 and WB05 delivery — October 6

**WB04:** Workbooks now retain up to 32 named numeric parameters with stable
IDs, explicit units, finite bounds and steps. Bindings connect these sources to
existing operation/view inputs. Edits update only explicit consumers and mark
their descendants stale; display renames preserve the generation hash. Missing
sources remain unavailable instead of resolving by label. `Run affected`
previews explicit and existing inferred input dependencies, executes existing
Workbook operators, and applies bound view values. Successful runs acknowledge
the captured parameter generation; failures retain prior outputs and stale
bindings. Local bound inputs are read-only. Named sources and bindings survive
checksummed Project Workbook export and cold reopen.

**NOTE04:** Linked cells, Document view, evidence citations and Geometry's full
Workbook editor expose recorded/current source generations, Project relations,
result authority, method/version, backend/version, parameters, numeric context,
warnings and saved summaries. Historical results remain visible as stale.
Artifact inspection resolves the exact source/handle through existing registries
and verifies bytes against the retained checksum and byte count. Missing bytes
are unavailable; metadata or an absent reader remains unverified. Checks run
when the provenance disclosure is opened. Saved results declaring no sidecars
are labeled explicitly.

**WB05:** Existing Check blocks can carry bounded claim text and up to eight
exact result or Snapshot A/B citations. Claims derive unverified, supported,
contradicted or stale status. The explicit scalar-range checker checks an
allowlisted finite saved summary field against inclusive bounds in reported
units, retaining result authority and method. It does not prove arbitrary prose;
there is no manually selectable verified state. Changed/missing evidence becomes
stale without relinking. Editing prose or citations clears the checker.
Geometry's compact and full Claims views display Workbook evidence separately
from construction checks, with a link to the same claim editor. Project resources
retain citations/checkers, and Markdown/print reports include the export-time
assessment, exact citations and bounded qualifications.

Validation includes the Project contracts, Workbook regressions, desktop/mobile
typechecks, desktop/web builds, dependency/license checks and desktop journeys in
`tests/e2e/workbook-evidence.spec.ts`. The next three integrated items are
**NOTE05**, **WB06** and **NOTE06**: supported reruns, provenance-aware snapshots
and qualified publication artifacts.

## First milestone acceptance

Use the existing Minimal Surface Study. Create a Note on its Graph or Surface, attach another to a saved numerical result, add one Note to a Workbook, and view Graph → Curve → Surface → Analysis in Document view. Edit the Graph: the Note anchor and affected Workbook path must show the correct freshness without changing unrelated blocks. Save/reopen on desktop and web, then inspect the same IDs and explanations. The test must not call a numerical shortest-edge path a continuous geodesic or present numerical curvature as a proof of minimality.

Mobile can read shared records only when its Project contract and UI support them; unsupported anchors and cells must remain explicit instead of being dropped during transfer.


## NOTE05, WB06 and NOTE06 delivery — October 6

**NOTE05:** Workbook result cells offer guarded local reruns for the recorded
Graph derivative and saved Mesh quality, curvature and edge-path methods.
Execution reuses the existing analysis functions. Cancellation, unavailable
source bytes, changed generations and failures preserve historical results.
Publication precedes an explicit cell relink; claim citations remain untouched.

**WB06:** Capture A/B freezes Project source generations, result IDs and hashes,
camera and view settings, committed selection, document presentation and rendered
Notes. The captured record survives Workbook resource reopen and is labelled
separately from the live scene. Its artifact availability describes capture time;
export must verify bytes again.

**NOTE06:** Selected-block Markdown, HTML, print/PDF and standalone portable HTML
reports include exact source manifests, authority, warnings, claim qualifications
and frozen capture records. Portable HTML embeds an ordinary Project resource
package and verified artifact bytes. Missing or corrupt required bytes fail
before export; the standalone browser verifies checksums before enabling download.
A fresh desktop profile imports the embedded package through existing Projects.

Two ready-to-open Gallery recipes bring part of NOTE07/WB07 forward:
**Catenoid Evidence Notebook** and **Edge Path Evidence Notebook** include real
numerical Mesh results, value-bound Notes, a bound chart-grid parameter and a
bounded evidence claim. See [the UI guide](notebook-examples-and-ui.md).

**NOTE07/WB07 desktop continuation, October 6:** **Graph Derivative
Investigation** and **Curve Construction Investigation** complete the initial
Graph, Curve, Surface and Mesh starter range. Each Gallery card opens or resumes
a normal saved Project with a Project-owned Workbook and Note; **New copy**
creates an independent identity. Graph citations use its actual saved numerical
derivative, while the Curve construction Workbook cites normal source documents
and supplies no invented analysis. Project package round trips preserve the
references. The Graph/Curve desktop Gallery journey and four starter model
checks pass. See [the UI guide](notebook-examples-and-ui.md).


Validation: focused Workbook/Note/export contracts and the Project/mobile
contracts pass. Desktop acceptance covers opening the Gallery Notebook, frozen
capture and selected export, offline fresh-browser checksum verification,
fresh-profile Project/Workbook import, and explicit stale-result rerun/relink.
Renderer, desktop/e2e and mobile type checks, desktop/browser builds and dependency
boundaries are checked alongside the existing reference/template journeys.
