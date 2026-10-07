# Project master roadmap

Date: 2026-10-07

Status: proposed execution plan; the user-visible Catenoid correction remains unaccepted.

## Purpose and authority

Make a Project open its real selected document in the appropriate Math3D module,
inside the main application layout. The Project name, selected document, viewer,
source controls and Inspector must describe the same workspace.

This file owns the immediate Project lifecycle, layout and desktop delivery repair.
[Unified Projects](docs/unified-projects-roadmap.md) remains the record of PRJ01–PRJ50
delivery and scientific capabilities. The
[combined kernel roadmap](docs/math3d-application-kernel-combined-roadmap.md)
continues to own kernel architecture. PM01–PM10 below are new delivery slices;
they do not renumber or reopen completed PRJ or GK work.

## Verified starting point

- Source checkout: `C:\Math3D`.
- Branch: `main`. Last verified local and remote base: `731ded88`.
- Existing main provides Project Gallery, detail view, Workbooks, Notes, saved
  scientific documents, resources and Left/Middle/Right/All placement.
- The Catenoid Evidence starter contains a Graph profile, a constructed Surface
  of revolution, a sampled Mesh and numerical results, plus Workbook and Notes.
- Its constructed Surface currently uses `AdditionalProjectEditor`; selecting
  Surfaces does not by itself integrate that editor with the regular Surfaces
  workbench. The editor is a separate fixed layer using `GeometryViewer`.
- The supplied screenshot shows a saved Catenoid Project title, an empty viewer
  document selector and a ruled-plane preset in the canvas. That is a workspace
  mismatch, not evidence that the Catenoid was rendered correctly.
- A renderer-restart reproduction failed because the viewer document stayed
  empty. An uncommitted local Project-button change and regression test now pass
  that reproduction. The renderer build, typecheck and four placement journeys
  passed. This candidate does not establish complete module integration or
  acceptance in the user's visible desktop window.
- `MATH3D Electron.lnk` launches `C:\Math3D\start-electron.bat`, which runs the
  source checkout. The user Desktop `Math3D.lnk` points to installed 1.4.7;
  the public Desktop `Math3D.lnk` points to installed 1.4.6. Installed applications
  are separate executables and do not automatically receive source changes.

The current uncommitted source changes are in
`renderer/src/components/ProjectWorkspacePanel.tsx` and
`tests/e2e/project-placement.spec.ts`. Review them as candidates within this plan.

## Required user flow

1. Launch the agreed current desktop entry point. Its source/build identity is
   available in About or diagnostics.
2. Choose Projects to browse the Gallery, then Open the Catenoid Evidence starter
   or its saved copy. Open restores documents and checked resources atomically.
3. Surfaces becomes active, with the retained Catenoid Surface selected. The main
   viewer displays that exact Surface generation using its captured definition.
4. The existing left panel offers Project and module source/tools tabs. The
   Project tree selects documents; the middle viewer and right Inspector belong
   to the selected document. Moving or hiding Project content preserves edits
   and camera state within the shared three-panel layout.
5. The user can open its Graph profile, sampled Mesh, saved result, Workbook or
   Note. Each action selects the corresponding retained object and module.
6. Restart restores the last active Project and selected document when resume is
   enabled. If automatic resume is disabled, the startup screen explicitly shows
   a saved Project with a Resume action. An unrelated default surface cannot be
   presented as that Project's active document.

## Requirements

### R01 — One active workspace identity

- Track the loaded Project and selected document explicitly. A storage record is
  insufficient evidence that its editor adapters are loaded.
- Project title, viewer selector, active module, source identity and Inspector
  must agree after Open, Resume, import and document navigation.
- An opened Project with a selected document cannot have a blank viewer selector.
- If the selected document is unavailable, show its actual reason and recovery
  action. Do not silently substitute a plane, preset or unrelated document.

### R02 — One Project opening transaction

- Gallery Open, starter Open, saved-copy Open and Resume use the same operation.
- Load and validate document replay, required resources and compatibility before
  replacing the current workspace. Retain the existing recoverable backup.
- Commit loaded Project identity, selected document and module together.
- Failure, cancellation, missing resources or a concurrent workspace edit leave
  the previous workspace and unsaved data usable.
- Repeated Open is idempotent. Reusing an edited starter copy must not create a
  duplicate or restore an older snapshot over live edits.

### R03 — Explicit startup and resume behavior

- Persist the last selected document, module and Project placement as UI state
  separate from scientific document identity and hashes.
- Default desktop behavior resumes the last active Project and document once
  application startup is ready. Provide an explicit setting to disable resume.
- Validate persisted selection against the retained Project. When selection is
  missing, choose an available document deterministically and report the choice.
- Gallery browsing remains distinct from opening or resuming a Project.
- Loading has a bounded visible state followed by success or an actionable error;
  the message “editor documents load” cannot remain indefinitely.

### R04 — Catenoid in the Surfaces workbench

- Open the existing constructed `graph2d.revolution` Surface in Surfaces using
  its saved source, domain, orientation and captured variables.
- Preserve its document ID, generation, Graph relation and historical results.
- Supply a module adapter for this representation; do not replace the document
  with an unrelated built-in Catenoid preset to obtain the expected shape.
- Source changes, undo/redo, save and reopen must preserve the existing replay
  and dependency rules. Refresh from an edited Graph remains explicit.
- The regular Surfaces viewer and Inspector must expose the selected source.
  Any retained compatibility editor must have a documented parity/removal gate.

### R05 — One main layout

- Project content, module viewer and Inspector use the application's shared
  three-panel layout and docking state. Project occupies a tab in an existing
  dock; opening it does not automatically add a fourth panel. Avoid a second
  fixed workspace covering an unrelated scene.
- Left and Right reserve usable viewer space when the available width permits.
  Middle is a centered Project view. All is an explicit Project-only view.
- Narrow widths use a deliberate stacked or compact layout, with reachable
  Project, document, source and Inspector controls.
- Header and panel scroll do not hide the selected Project/document identity.
- Placement, hide/show, resize and module navigation preserve unsaved Notes,
  source drafts, applied data and camera state.
- Reset docks affects layout only. It cannot reset scientific sources.

### R06 — Predictable document navigation

- Opening a Surface selects Surfaces; a Mesh selects Mesh; a Graph selects Graphs;
  a Curve selects Curves. Each module shows the selected retained document.
- Header navigation cannot leave the Project selector claiming a document that
  the canvas no longer displays.
- Back/forward, source navigation and View with Project retain loaded Project
  ownership and last document selection without duplicate restore operations.
- Define and test whether choosing a module selects its last Project document
  or an explicitly identified independent workspace.

### R07 — Clear Surface, Mesh and evidence appearance

- A Surface view displays the retained Surface. A curvature-colored Mesh view
  displays the retained Mesh and the selected saved field.
- Opening a result locates its exact target generation and shows method, units,
  current/historical state and relevant qualifications.
- Preserve saved appearance where supported, including field selection, legend
  and camera. Default blue material is not proof that a saved curvature map loaded.
- Discrete Mesh curvature remains labeled as numerical Mesh evidence.
- Notes and Workbook links resolve their retained anchors or explicitly report
  missing/stale targets. They must not redirect to an unrelated live selection.

### R08 — Unambiguous desktop launch

- Maintain one documented current-development launch entry point for `C:\Math3D`.
- Record each desktop shortcut's target and the exact running build identity.
- Identify legacy installed builds clearly in launcher documentation and any
  agreed shortcut cleanup. Preserve the user's installed applications and data.
- Verify both source launch and the chosen packaged launch before claiming each
  is updated. A source build does not imply an installed executable was replaced.

### R09 — Evidence that proves the actual document

- Tests must assert Project ID, document ID, module and generation, not only that
  a canvas exists or that Surfaces is highlighted.
- Catenoid fixtures must prove sampled geometry corresponds to the saved
  revolution. Visual QA must show a recognizable Catenoid rather than a plane.
- Exercise renderer reload and cold Electron restart, startup resume, the Project
  toggle, Gallery Open, starter-copy Open and saved-library Open.
- Include missing resources, malformed selection, unavailable representation,
  failed restore and unsaved-edit preservation.
- Capture layout at 1600×1000, a 1280-pixel desktop width, 390×844 and Windows
  display scaling. Check pointer reachability and panel/viewer/Inspector bounds.
- Finally launch through the agreed desktop shortcut and inspect the actual
  visible window. Save the screenshot with source/build identity and observed IDs.

### R10 — Honest delivery status

- Distinguish planned, locally implemented, tested, committed, merged, built,
  launched and visually accepted states.
- “Corrected” requires the user's reported opening path to show the correct
  selected document in the running application.
- Every commit reports its concrete behavior, relevant checks and remaining
  limitations. Documentation must not claim delivery from a passing generic
  canvas test or from an older build's evidence.

## Renderer and workspace design

Design decision: Projects owns document selection, restoration and workspace
composition. Rendering uses the existing module viewers through explicit
document adapters. A thin `DocumentViewport` chooses a prepared viewer binding;
it does not introduce another graphics engine or another scientific source model.
The same document host serves a Project document and an independent module
document, so both use the same source controls, viewport and Inspector.

### Existing rendering inventory

These are inspected repository components, not proposed replacement names.

| Document or view | Existing component | Intended Project integration |
| --- | --- | --- |
| Parametric, rotational, spline and Weierstrass Surface | `components/ParamSurfaceViewer.tsx` | Bind the exact saved definition, domain, orientation and represented capabilities through the Surface adapter. |
| Explicit/implicit Surface and sampled triangle Mesh | `components/SurfaceViewer.tsx` | Use the relevant source path; Mesh uses `surfaceId="surface_mesh"` and explicit buffer overrides. Reject unavailable data rather than selecting a default preset. |
| Procedural Geometry scene | `components/GeometryViewer.tsx`, which delegates to `SurfaceViewer` in Mesh mode | Bind its objects, constructions, overrides and committed selection; preserve the existing shared Mesh drawing path. |
| Curve | `components/CurveViewer.tsx` | Bind the saved Curve evaluator/samples, dimension, domain and overlays. |
| Scalar/vector Volume | `components/VolumeViewer.tsx` | Bind verified dataset bytes or supported recipe output, spatial metadata and display settings. |
| Graph2D | `graph2d/Graph2DPlot.tsx`, within `graph2d/GraphsWorkspace.tsx` | Retain the existing graph adapter, plot interactions and module tools. |
| Topology | `screens/TopologyScreen.tsx`, `topology/TopologyRealization3DView.tsx` | Keep domain diagrams, Algebra and optional 3D realization as distinct views of the same document. |
| Complex Analysis | `screens/MobiusScreen.tsx`, `components/RiemannSpherePlot.tsx`, `d3/MobiusRenderer.tsx`; Surface viewer paths for sampled complex maps | Select the qualified specialized view for the saved Complex document rather than forcing every view into a generic 3D canvas. |
| Workbook | `components/WorkbookDocumentView.tsx` and existing Workbook components | Use document content rendering, reference navigation and bound Notes; no 3D renderer is required. |
| Promoted Graph geometry preview | `graph2d/PromotionGeometryView.tsx` | Retain as a bounded preview while module adapters are qualified; it does not establish parity with full module editing or analysis. |
| Quantum scene preview | `components/QuantumScenePreview.tsx` | Keep its existing specialized path; integration is a later qualified document adapter if brought into this Project scope. |

There is currently no standalone `MeshViewer.tsx` component. The Mesh module uses
`SurfaceViewer` with Mesh inputs. A proposed `MeshViewport` wrapper may make this
binding explicit while keeping the current drawing, picking and field rendering.
Its introduction must not imply that a new Mesh engine is needed.

`GeometryViewer` already prepares scene meshes/overlays and renders
`SurfaceViewer` with `surfaceId="surface_mesh"`, `surfaceMeshOverride` and
`surfaceMeshOverrides` (see `GeometryViewer.tsx`, approximately lines 230–360).
The current sharing relationship is:

```text
Mesh module -----------------------------\
Geometry scene -> GeometryViewer ----------+-> SurfaceViewer (Mesh mode)
Saved-source compatibility editor --------/       |
                  via GeometryViewer          shared drawing/picking

Parametric/rotational Surface -> ParamSurfaceViewer
Explicit/implicit Surface ----> SurfaceViewer (Surface source path)
```

Preserve this sharing. The Project repair concerns correct document restoration,
source bindings, capabilities, appearance and workspace composition. Rendering
an evaluated Surface mesh through `GeometryViewer` can be valid; it does not by
itself provide the Surface source controls, domain semantics or analysis contract.

`AdditionalProjectEditor` currently sends all its supported representations to
`GeometryViewer`, which in turn uses the shared Mesh mode of `SurfaceViewer`.
That compatibility path explains why a saved Surface may have a visible blue 3D
object but lack the full Surfaces workflow. Preserve it until
each replacement adapter passes its parity gate, then retire it for that source.

### Responsibilities and data flow

```text
Project library / import / startup resume
                 |
        existing opening transaction
        validates replay and resources
                 |
      loaded Project + selected document
                 |
        domain document adapter
        prepares a generation-bound view
                 |
       DocumentWorkspaceHost
       /          |           \
source tools   DocumentViewport   Inspector / evidence
                  |
        existing module viewer

Project content occupies a tab in an existing shared dock.
Commands and scientific jobs return through existing adapters/kernel services.
```

### Three-panel interaction design

Recommended layout for the next implementation slice:

| Left panel | Middle viewer | Right panel |
| --- | --- | --- |
| Persistent **Project** tab plus current module tabs such as Object/Source, Scene and Tools/Analysis | The selected retained document, drawn by its existing viewer | Inspector for the selected document/object/result; appearance, measurements and provenance |

The header's **Projects** button browses the library. The left panel's singular
**Project** tab opens the current Project tree and data. Distinguish these actions
with labels and accessible descriptions. The Project tab stays available in
Surfaces, Mesh, Geometry, Graphs and the other modules while a Project is loaded;
it uses the same Project state and component instance across module changes.
The contextual Project button/tab is hidden when no Project is loaded. A saved
storage record alone cannot make it appear as an opened Project.

### Project navigation and middle-area modes

- The main navigation always offers **Projects**, including with no open Project.
  It opens the Gallery/library workspace.
- The contextual singular **Project** button and dock tab are available only
  after a Project has successfully opened or resumed. They toggle its existing
  Project content. Loading/error states are explicit; they cannot pretend that
  the workspace is already open.
- Closing the Project removes its contextual button/tab and releases its view
  resources after the application's unsaved-work handling. Hiding the Project
  panel leaves the Project loaded and its contextual button available.

For the immediate implementation, keep the current layout and use a simple
middle-area flip between the document viewer and detailed Project content:

| Mode | Middle-area content | Viewer behavior |
| --- | --- | --- |
| **Work** (default) | Active document viewer; Project/source controls in existing docks | Visible and interactive. |
| **Project content** | The opened Project presents its selected detailed content in the middle workspace | Covered/hidden while retaining document, drafts and camera; Return to viewer restores Work. |

The opened Project component may use the middle area for deeper Project data,
such as an overview, document details, relations, reports or Workbook content.
It is not limited to the left tree. The always-visible Projects navigation still
opens the separate library/Gallery view.

Keep one active document selection while Project content is displayed. Return to
viewer restores that same document, camera and edits. The small default Note
editor remains in the right panel. A resizable horizontal split may be considered
later; it is deferred from the immediate scope. This first UI option requires no
larger layout redesign.

Left and Right Project placement refer to existing dock content. Middle and All
expand Project content in the middle workspace. Hiding or covering a viewer
pauses its rendering where supported, preserves its session state, and does not
mount a second copy. Return to viewer is always reachable. Preparation errors
show an explicit state rather than exposing a default preset underneath.

The first complete acceptance flow is: open Catenoid, see its retained Surface,
switch to its saved Mesh, return to the Surface, save, cold restart and restore
the same selected document. Qualify that flow before richer layout work, then
add the simple Viewer/Project-content flip.

Project content includes the Project name and save state, document tree, related
results, Workbooks and Notes, plus compact save/import/export and metadata
actions. Source formulas and mesh/object parameters belong to the module's
Source/Object tab; editing a Project title belongs to Project data. Tree search,
expanded nodes and drafts survive tab changes.

Clicking a Project document activates its owning module and middle viewer.
Clicking an object nested under a supported document additionally commits its
selection and updates the right Inspector. Preserve that module's other tabs and
tools; the Project tab is a peer rather than a replacement for them.

Example Catenoid Project tree:

```text
Catenoid Evidence Notebook
  Documents
    Graph: catenary profile
    Surface: catenoid                 <- active in Surfaces
    Mesh: sampled catenoid
      Saved results: curvature, quality, paths
  Workbooks
    Catenoid Evidence Notebook
  Notes
    Profile note, recorded derivative, measured evidence
```

A Project is a container for several documents. A Geometry document can contain
several scene objects, and a Project can retain several Geometry, Mesh, Surface
and other documents. Do not flatten document identity and object identity into
one undifferentiated list. Saved results retain their source generation and may
be historical even when their parent document has a newer revision.

The default middle view displays one selected document, including the objects
that belong to its scene. Merely opening a Project does not draw every document
on top of every other document. A later explicit comparison/composition action
must define view compatibility, coordinates/units, selection ownership and
resource limits before displaying multiple documents together.

Module header navigation remembers the last selected Project document in that
module. When the Project has none, show a clear module-empty state with Create,
Add existing or Return to active document actions. An independent module scene
can be opened explicitly and is labeled with its own ownership until added to
the Project.

Left and Right Project placement move the Project tab/content between existing
docks. Middle and All remain deliberate expanded Project views. Closing an
expanded view returns to the same active document and layout. None of these
actions opens another renderer, changes source identity or resets the camera.

Start with one Project tab, a compact document tree and correct selection. Add
resizing/search and richer tree grouping after the identity/navigation flow is
qualified; defer multi-document comparison to its own accepted slice.

### Left and right panel specification

The left panel chooses and creates work. The right panel inspects and adjusts the
current selection. The middle displays the active document. Keep these roles
consistent across modules while reusing their existing tools.

#### Left panel

Top-level tabs: **Project | Source/Object | Tools**. Use Source in Surfaces/Curves,
Object in Geometry/Mesh, and the existing equivalent name in other modules.
Scene/object visibility controls appear under the owning document or Object tab.
Project is present only while a Project is loaded; Source/Object and Tools remain
available for an independent module workspace.

**Project tab**, in order:

1. Compact Project header: name, saved/unsaved/error state, Save and an overflow
   menu for rename, duplicate, import/export and library navigation. Avoid putting
   transfer forms above the document tree.
2. Search and **Add document**. Add offers a new supported document or an existing
   document; adding is an explicit Project operation.
3. **Documents** tree grouped by module. Rows show title, type, active state and
   availability; expand supported documents to their objects and saved studies.
   Single-click activates a document/object. Row overflow offers rename,
   duplicate, archive and source/dependency navigation with applicable guards.
4. **Workbooks** and **Notes**, with counts and Add actions. Opening a Workbook
   uses the middle document view. Selecting a Note keeps the current viewer and
   opens its editor in the right panel unless the user chooses Open target.
5. Collapsed **Results and relations** for Project-wide discovery, including
   historical/unavailable status. Show study results beneath their source in the
   document tree as shortcuts to the same records, not duplicate stored objects.

**Source/Object tab** provides the selected document's definition and creation
controls. For a constructed Catenoid, show profile, revolution axis/orientation,
angle/profile domains, Apply, Undo/Redo and Locate Graph. For Geometry, show the
object list and construct actions. For Mesh, show objects/resources and supported
edit operations. Preserve existing domain-specific capabilities.

**Tools tab** contains operations for the current document: construction,
analysis, mesh creation/processing and supported compute actions. Group them by
task, expose prerequisites and show job progress near the invoked operation.
Completed results are retained and discoverable through the Project tree and
right Results tab. Tools never silently change document ownership.

#### Right panel

Top-level tabs: **Inspector | Display | Results**. When a Note is opened, add a
contextual **Note** tab containing its editor; closing it returns to the previous
right tab. Project-wide metadata stays in the Project tab.

**Inspector tab**, in order:

1. Selection header: document/object/result title and type, current/historical
   status, and a compact breadcrumb to its owning document. Empty selection shows
   the active document summary; it does not show a previous object's properties.
2. Properties of the selection: supported object parameters, transform, units,
   visibility and source generation. Source formulas remain in the left Source
   tab; avoid independent editors for the same source value in both panels.
3. Measurements/probes and relevant selection actions. Source changes go through
   the domain adapter; transient probe/hover state stays separate.
4. Collapsed Provenance: source links, recorded revision, method/backend and
   current/stale/missing qualifications. Clicking a source explicitly navigates
   to it; it does not replace historical evidence with live data.

**Display tab** contains camera/view presets and Fit, material/opacity,
wireframe, axes/grids, overlays and supported color fields/palettes/legends.
Appearance controls share one authoritative UI state with viewer shortcuts.
Selecting a saved Mesh field validates its target generation. Unsupported
Surface-native fields are absent or qualified with their unavailable reason.

**Results tab** contains the active document's retained studies and measurements,
current/historical filter, selected result details, Locate source, and appropriate
export or explicit rerun actions. A rerun produces a qualified result through the
existing job/result lifecycle. It does not relabel old results as current.

**Note tab** contains title, body, anchor, anchor status, Save/Cancel and Open
target. Preserve an unsaved draft when changing panel tabs or moving Project
placement. A conflicting navigation or close uses the application's existing
unsaved-work handling. A Note can be global to the Project or attached to a
document, object, result or Workbook block supported by its existing contract.

#### Selection and navigation rules

- Selecting a document updates the middle viewer and right document summary;
  the left Project tree stays open and highlights the active row.
- Selecting an object updates the right Inspector without changing Project or
  document ownership. Selecting a result updates the right Results tab and, when
  a view exists, activates its exact target document/field.
- Selecting a Note opens the right Note editor; Open target is a distinct action.
  Selecting a Workbook opens its content in the middle and block properties in
  the right Inspector. Return to previous document remains reachable.
- Right-panel inspection does not navigate the middle merely because a section
  is expanded. Display changes do not mutate the scientific source.
- Module changes select that module's remembered Project document and retain
  Project tree expansion/search and panel drafts. Missing module documents show
  the explicit empty state described above.
- Left/Right placement moves the Project content into an existing dock tab.
  It does not duplicate the Project tree or remove access to source/tools or
  Inspector. Middle/All expand Project content and have a clear Return to viewer.

#### Catenoid acceptance example

```text
LEFT: Project                       MIDDLE: Surfaces       RIGHT: Inspector
Catenoid Evidence Notebook          retained Catenoid      Surface summary
  Documents                          camera/orbit           source and units
    Graph: catenary                                         Locate Graph
    Surface: catenoid [active]                              linked Mesh/results
    Mesh: catenoid samples
      Gaussian curvature
  Workbooks
  Notes
```

Clicking Gaussian curvature selects its saved Mesh in the middle, opens Results
on the right and shows the recorded field/legend. Clicking Source on the left
exposes the current Surface definition only when that Surface is active. The
Project title cannot remain above an unrelated ruled plane with an empty active
document selection.

- **Project selection/controller:** resolves the selected retained document and
  requests one opening/navigation transaction. It does not generate geometry.
- **Domain adapter:** resolves replay/resources, validates source support,
  prepares viewer inputs and exposes domain commands, selection and analysis
  capabilities. Reuse existing document adapters and kernel contracts.
- **DocumentWorkspaceHost:** composes the module's source tools, viewport,
  Inspector and shared docks. Its left dock includes the persistent Project tab;
  Project membership adds context and navigation.
- **DocumentViewport:** dispatches a discriminated binding to the existing
  viewer. It validates source identity and forwards camera, picking and capture
  events. It owns no separate document history or scientific persistence.
- **Viewer:** draws prepared data and reports interactions. Commands go back to
  the adapter; a viewer cannot silently change the active document or preset.

Proposed UI files, introduced only as their migration slice requires them:

```text
renderer/src/workspace/DocumentWorkspaceHost.tsx
renderer/src/workspace/DocumentViewport.tsx
renderer/src/workspace/documentViewBindings.ts
renderer/src/workspace/adapters/surfaceViewAdapter.ts
renderer/src/workspace/adapters/meshViewAdapter.ts
```

Start with Surface and Mesh. Other modules keep their existing workspaces and
gain bindings incrementally; this is not a rewrite of every viewer before the
Catenoid fix can ship.

### Binding contract

The following is a design sketch, not a currently implemented API. Use the
repository's existing identity, selection and result types in the implementation.

```ts
type PreparedDocumentView = {
  projectId: string | null;
  source: ViewerSourceReference; // document ID, revision, structural hash
  module: KernelWorkspaceModule;
  view: SurfaceView | MeshView | CurveView | GeometryView |
        GraphView | VolumeView | TopologyView | ComplexView | WorkbookView;
  capabilities: DocumentViewCapabilities;
};

// Each variant has its own payload; no optional all-module prop bag.
type SurfaceView = {
  kind: "surface";
  renderer: "parametric" | "explicit" | "implicit";
  definition: PreparedSurfaceDefinition;
};
type MeshView = {
  kind: "mesh";
  buffers: VerifiedMeshBuffers;
  field: SavedMeshFieldBinding | null;
};
```

Capabilities distinguish viewing, source editing, picking, analysis, field
display and capture. An adapter must not advertise an operation merely because
the selected renderer has a similarly named feature. Mathematical qualification
and resource availability belong to the document adapter.

Prepare inputs before replacing the visible workspace. Every asynchronous output
is checked against the requested document generation and activation token.
Cancel/dispose replaced work and release viewer resources through the existing
resource/job infrastructure. A stale callback cannot overwrite a newly selected
document's view or Inspector.

### Catenoid binding

The starter's Surface is a captured `graph2d.revolution` source, not a reference
to a live preset. Its adapter reads the saved profile expressions, captured
variables, revolution axis/orientation and profile/angular domains.

For the existing starter, an equivalent transient viewer parameterization is:

```text
x(u,v) = v
y(u,v) = cosh(v) cos(u)
z(u,v) = cosh(v) sin(u)
u = saved angular domain; v = saved profile domain
```

Generate this mapping from the saved definition; do not hard-code it from the
Project title. It remains a view projection of the original constructed document.
The saved source, ID, revision, structural hash and Graph relation remain the
authoritative inputs.

Bind the projection to `ParamSurfaceViewer` through a prepared custom-source
path. Domain ranges, angular seam/wrapping and axis orientation must be explicit;
the current preset-based wrap flags are insufficient evidence of saved-domain
parity. Add a bounded evaluator input if the existing expression props cannot
represent a supported construction faithfully. Extend the viewer minimally and
reuse existing revolution evaluation/validation.

The Surfaces source panel edits the represented construction/profile and domains
through its adapter. Independent x/y/z editing is an explicit conversion/fork
operation if offered. Locate Graph opens the retained source; refreshing from its
new generation is an explicit action.

Opening the linked Mesh instead supplies its verified buffers to the Mesh
viewport and retains its own generation. Opening a saved Gaussian/mean curvature
map additionally binds the exact saved field, legend, units and qualification.
It cannot obtain the expected colors by recomputing against an unrelated preset.
Surface-native analytic/numerical tools are enabled only after the adapter's
capability and mathematical parity gates pass.

### Layout, appearance and renderer lifetime

- `DocumentWorkspaceHost` is mounted in the main workspace beneath the existing
  header. Project and source/tools tabs share the existing left dock; the viewer
  occupies the middle and Inspector the right. Modules with specialized layouts keep their
  layouts within that same host boundary.
- Camera, field choice, palette and panel placement are UI state keyed by
  Project/document/view role. Saved scientific fields also bind to their source
  generation. Source revisions invalidate prepared data without blindly resetting
  a compatible camera.
- Moving/hiding the Project dock must not remount the viewer. Avoid renderer keys
  based solely on panel position or every document revision. Remount only when
  the renderer family or another actual lifecycle requirement changes.
- One primary viewport is mounted by default. Gallery cards use bounded static
  previews. Future comparison views instantiate only the explicitly requested
  viewers, with independent camera bindings and resource cleanup.
- Capture targets the active host/view binding. It records which document view
  produced the image rather than searching for an arbitrary visible canvas.

### Renderer acceptance

1. Assert the binding's source identity equals the selected Project document and
   the Inspector source after each Open/Resume/navigation action.
2. Compare Catenoid adapter samples and bounds with the existing captured
   revolution evaluator, including axis/orientation, variable and domain cases.
3. Verify periodic angular seams, normal orientation and supported source edits;
   retain the saved source/lineage through save, export and cold reopen.
4. Verify the linked Mesh field's generation and expected vertex values/colors
   independently from the primary Surface view.
5. Change documents while preparation is pending: the old result cannot replace
   the new view. Missing buffers and evaluation failures show an explicit state.
6. Move, hide/show and resize docks: camera, drafts, selection and viewport resource
   count remain stable. Inspect the actual Catenoid in the chosen desktop build.

## Commit sequence

Commit titles below are planned titles, not existing Git commits. Execute in order;
advance only after the listed behavior is demonstrated.

| Slice | Planned commit title | Scope and completion gate |
| --- | --- | --- |
| PM01 | `test(projects): reproduce wrong document after restart and open` | Extend the existing restart reproduction to cold Electron restart and all opening entry points. Record the failing Project/document/module identities and ruled-plane mismatch. Status: partial local reproduction exists. |
| PM02 | `fix(projects): unify project restore and active workspace state` | Introduce one opening transaction and explicit loaded Project state. Review the current Project-button patch within that operation. Pass rollback, idempotence, resources and live-edit preservation checks. |
| PM03 | `feat(projects): resume selected document and persist placement` | Persist UI selection/placement separately; resume the last Project/document after startup, with a disable setting and explicit errors. Pass cold restart and stale-selection recovery. |
| PM04 | `feat(surfaces): open saved revolution sources in the workbench` | Introduce the typed Surface binding and adapter for captured Graph-derived revolution/extrusion sources, beginning with Catenoid. Reuse `ParamSurfaceViewer`; preserve generation/lineage and existing replay. Pass geometry, seam, source, save/reopen and historical-source checks. |
| PM05 | `refactor(projects): integrate project viewer and inspector with shared docks` | Introduce the shared document host/viewport dispatcher and explicit Mesh binding over existing `SurfaceViewer`. Place source tools and Inspector in the main module layout. Replace the separate fixed layer after parity. Pass docking, scrolling, narrow width, scaling, draft, camera and resource-lifetime checks. |
| PM06 | `fix(projects): keep module navigation and viewer selection consistent` | Align header navigation, document selector, Back/Forward, source links and View with Project. Pass all eight module mappings and stable Project ownership. |
| PM07 | `fix(projects): restore saved study appearance and evidence targets` | Restore saved Mesh fields/legends and route results, Notes and Workbook anchors to exact retained targets. Pass Catenoid Surface versus colored Mesh distinction and historical/missing-target cases. |
| PM08 | `fix(desktop): identify the current project launch target and build` | Provide a clear maintained source launcher and About/diagnostic build identity; document installed shortcut targets. Demonstrate which executable the agreed icon starts. |
| PM09 | `test(projects): qualify integrated desktop and browser opening flows` | Run the focused integration gate on the final implementation, including identity, resources, rollback, saved-copy reuse, drafts and responsive layout. Inspect actual Catenoid screenshots. |
| PM10 | `docs(projects): record verified desktop delivery and remaining gates` | Commit the repair, record final SHA and build identity, build and launch through the agreed icon, verify the visible Catenoid and capture evidence. Update this file and the Unified Projects record with precise delivery states. |

PM04 begins after PM02; PM05 relies on the supported adapter from PM04. PM08 can
be prepared independently, but its final launch evidence must use PM09's source.
PM10 is the final acceptance step, not a substitute for unfinished implementation.

## Verification and evidence

Use the smallest affected gates during each commit. The final gate includes:

- `npm run test:projects:contracts`
- `npm run typecheck:noemit`
- `npm run build:core`
- `npm run build:web`
- Project placement, Gallery navigation, detail/Notes, saved Surface/Mesh and
  project transfer/restart Electron journeys affected by these changes.
- `npm run test:projects:web`
- `npm run check:kernel:boundaries`

Add tests for the user-visible failures and data-loss risks; avoid repeating broad
unrelated module suites once the affected gates pass.

Store final evidence under `docs/evidence/project-master-desktop-2026-10-07/`
(or the actual completion date): a compact acceptance report and representative
screenshots. Large logs, traces and bundles remain local in `output/` or
`test-results/`, with paths recorded in the report.

The report must include source SHA, build mode, executable and shortcut target,
Project ID, selected document ID/generation, active module, viewport/scaling,
opening path and result. Automated tests and the actual desktop-window check are
separate recorded observations.

## Final acceptance checklist

- [ ] Opening Catenoid from Gallery selects its retained Surface in Surfaces.
- [ ] The visible geometry is the Catenoid, and its document/generation agree
      with the Project selector and Inspector.
- [ ] Cold desktop restart resumes the same Project/document, or shows the
      explicit Resume state when automatic resume is disabled.
- [ ] Every opening entry point reaches the same verified workspace state.
- [ ] Left/Right docking and hide/show preserve source and Note drafts and camera.
- [ ] Middle/All and narrow layouts remain usable without hidden controls.
- [ ] Source Graph, sampled Mesh, colored fields, results, Workbooks and Notes
      open their exact retained targets with current/historical qualifications.
- [ ] Failed opening retains current work and explains the failure.
- [ ] The maintained desktop icon launches the verified current build.
- [ ] Changes are committed; merged/deployed states are reported only after
      their corresponding operations actually complete.
- [ ] The actual visible desktop window is inspected and captured successfully.

## Follow-up boundaries

Mobile keyboard, physical-device and internal-signing acceptance remain separate
delivery gates with their existing evidence. New Surface representations and
optional engines follow their representation/engine acceptance requirements.
Bundle optimization follows measured profiling after the opening and layout
repair is accepted. This plan changes no release version or signing identity by
itself.

## Foundation clarifications and the next Project phase

This extension consolidates the reviewed architecture suggestions without adding
another foundation program. PM01–PM10 retain their immediate purpose: make the
selected Project document trustworthy throughout opening, navigation, rendering,
saving and restart. First qualify the complete Catenoid flow; then add the simple
middle-area flip. Richer navigation and multi-document work follow that gate.

### Project and contained-document terminology

Use `ProjectDocument` as an alias for the existing Project envelope, introduced
with PM02 if useful to the implementation:

```ts
export type ProjectDocument = Math3DProject;
```

This is a terminology refactor with no change to `math3d.project`, its version,
identity, hashing or saved files. A ProjectDocument contains domain documents
through the existing mixed-workspace envelope. Reuse `KernelWorkspaceDocument`
as the existing domain union; a public `KernelDocument` alias may be introduced
where it improves clarity rather than defining a second incompatible union.

### Explicit activation and one active Project context

PM02 formalizes the runtime lifecycle using the existing opening transaction:

```ts
type ProjectActivationState =
  | { kind: "closed" }
  | { kind: "preparing"; projectId: string; documentId: string; token: number }
  | { kind: "active"; context: ActiveProjectContext }
  | { kind: "error"; projectId: string; reason: ProjectOpenError };

type ActiveProjectContext = {
  projectId: string;
  projectRevision: number;
  activeDocumentId: string;
  activeModule: KernelWorkspaceModule;
  activationToken: number;
};
```

These are proposed UI runtime contracts, not additional kernel owners. Preparation
retains the previous committed context and workspace; failure/cancellation returns
to it with an error. An error must not destroy an already active Project. Publish
the new active context only after its document/resources are prepared and accepted.

Header, Project panel, document selector, module host and Inspector consume this
one context. They must not independently infer the active Project from local
storage. A saved Project record, a loaded Project, a prepared document and an
active viewport are distinct facts. Activation tokens reject late asynchronous
results. Selected objects/results belong to the existing domain selection and
evidence services; expose them through the context without creating competing
mutable copies.

### Selection levels

Preserve three separate selection scopes:

```text
Project selection:     GeometryDocument / MeshDocument / SurfaceDocument
Document selection:    Geometry object / supported Mesh object or dataset
Subentity selection:   face / edge / vertex / supported domain entity
```

The Project controller activates a document. A tree object shortcut then asks
its domain adapter to select the object or entity. Object IDs and entity IDs do
not replace document IDs. Add an invariant test proving that selecting a face or
changing an object does not change the owning Project/document unexpectedly.

### Adapter capabilities

Use one adapter capability contract, backed by the exact representation and
available resources. An illustrative shape is:

```ts
type DocumentCapabilities = {
  view: boolean;
  editSource: boolean;
  selectObject: boolean;
  selectSubentity: boolean;
  analyze: boolean;
  displayResults: boolean;
  capture: boolean;
  export: boolean;
  compose?: boolean; // later qualified composition
};
```

Capabilities also provide operation-specific limits and unavailable reasons;
`analyze` alone cannot authorize every analysis. Source, Tools, Results, Capture
and Export use these capabilities rather than broad module-name assumptions.
Viewing a tessellated Surface does not automatically grant analytic Surface tools.

### Stronger navigation after the first complete flow

- **Recent documents:** a bounded per-Project navigation list or document
  switcher complements the per-module last-document selection. It is UI state,
  not another document envelope or source generation.
- **Breadcrumbs:** use Project → module → document → object/result where
  applicable. Inspector/view headers show the same selected ownership. Example:
  Catenoid Evidence → Mesh → Sampled Catenoid → Gaussian curvature.
- **Related:** provide practical links grouped as Source, Derived, Evidence,
  Used in Workbooks and Notes. Resolve existing relations and anchors; qualify
  historical or missing targets instead of synthesizing new scientific lineage.
- **Overview:** a small view of the opened Project shows document/Workbook/Note/
  result counts, Continue with the selected document, Recent and an existing
  relation summary. It is distinct from the Projects library.

### Workbook and Project-content navigation

Keep the active mathematical document while a Workbook or Project-detail view
uses the middle area:

```ts
type ProjectMiddleContent =
  | { kind: "document" }
  | { kind: "workbook"; workbookId: string; blockId?: string }
  | { kind: "project-detail"; section: string };
```

For example, a Mesh remains the active domain document when the user opens its
Workbook. The middle shows the Workbook; Return to Mesh restores the same Mesh,
camera and selection. Only an explicit document reference action activates a
different mathematical document. Preserve the existing viewport session and
pause it while hidden where supported. Workbook resources remain governed by
their current Project contract, not added to the domain union merely for UI parity.

## One owning document, multiple views and document access

This is the agreed design for integrating the existing Surfaces workbench and
saved-document controls. It extends PM04–PM06; it is not a claim that the full
integration is already implemented. First prove that one retained Catenoid
session can drive the existing viewers correctly, then integrate the view
switcher and panels around that contract.

### Ownership and the meaning of a view

| Part | Responsibility |
| --- | --- |
| Project | Organizes documents, resources, Workbooks, Notes and their relationships. |
| Domain document session | Owns scientific source/buffers, identity, generation, edits and undo/redo. |
| Module workbench | Supplies source controls, tools, Inspector and operation-specific capabilities. |
| Viewer binding | Presents one exact document generation through an existing renderer. |

One owning document session may support one or more useful views. Do not require
two views for every document. A view is neither a duplicate document nor a second
owner of its source/history. The built-in Catenoid preset and a retained
Graph-derived Catenoid remain distinct documents unless explicitly related;
their name or similar shape cannot establish identity or justify replacing one
with the other.

| Document | Primary view | Optional second view | Scientific ownership |
| --- | --- | --- | --- |
| Surface | Parameterized Surface through the existing ParamSurfaceViewer where supported | Sampled preview through the existing SurfaceViewer | Both bind to the same Surface document/generation. |
| Saved Mesh | Existing Mesh workbench over SurfaceViewer | Study view for qualified curvature, quality or other numerical evidence | Both bind to the same Mesh document/generation/buffers. Start with one complete Mesh view. |

Surface / Sampled is a presentation switch within a Surface session. Open Mesh
activates a separately saved Mesh document. A sampled Surface preview becomes a
saved Mesh only through an explicit create/save-derived-document operation that
records its source generation and sampling. Switching views alone creates no
scientific document, source revision or saved analysis result.

A Mesh's Open source Surface action navigates to its linked Surface generation;
it does not reconstruct an analytic Surface from Mesh buffers. If only a
historical source reference is available, qualify and resolve that generation
through retained data. If it cannot be resolved, show an unavailable source
action with the reason rather than substituting the current Surface.

### View bindings and controls

- Both Surface views preserve the saved axis, coordinates, domain, periodic
  seams, orientation and exact source generation. The current built-in Catenoid
  and the saved Graph revolution use different default axes; a binding must
  preserve those definitions rather than select a named preset for convenience.
- Existing saved-document controls—undo/redo, structured source editing,
  advanced JSON, provenance and linked Mesh studies—become sections of the module
  workbench. The document session remains their command owner. A display
  projection must not rewrite a constructed source as an independent parametric
  source when opening, saving or changing views.
- Tool availability follows the selected document, representation, view and
  resources. Label analytic and numerical operations accurately. A general
  sampled rendering cannot enable a preset-specific analytic operation merely
  because the object looks like a Catenoid.
- Source edits invalidate/rebuild the sampled preview for the new generation.
  Existing saved Meshes and results remain attached to their recorded generations
  and acquire historical status when appropriate; they are not overwritten by
  changing a view or editing the Surface.
- Async preparations carry the activation token, document ID, source generation
  and sampling configuration. Late geometry/results cannot appear under a newer
  document selection or view.
- Camera transfers only between compatible frames. Store camera/display state
  per document and view. Share semantic selection only through a valid mapping;
  UV probes, sampled vertices and saved-Mesh face IDs are not interchangeable.
  Explain or clear an unmappable selection while retaining the owning document.
- Run one active viewport by default and retain view state when switching.
  Simultaneous rendering belongs to the later explicit Compare/Overlay phase.

The UI view key is scoped to the document, for example `surface`,
`sampled-surface`, `mesh` or `mesh-study`. Extend validated local resume state
with that view key and relevant display state; this does not enter scientific
source hashes. Restore the saved document first, then its supported view. If a
view is unavailable, explain that and offer a supported view of the same
document. Never resume an unrelated preset as a silent fallback.

### Access: one Catenoid Surface and two saved Mesh documents

For this example, “Mesh ×2” means two independently saved Mesh documents, such
as different sampling resolutions or an edited derivative. Their owning entries
appear once in the Project document tree:

```text
Catenoid Evidence · Project
  Documents
    Surfaces
      Catenoid
    Meshes
      Catenoid Mesh 1 · 65 × 65 samples
      Catenoid Mesh 2 · 97 × 97 samples
  Workbooks
  Notes
```

Sampling labels are illustrative; actual labels come from each Mesh's recorded
sampling and generation. If “Mesh ×2” instead means two presentations of one
Mesh, there is one Mesh entry with an optional Mesh / Study switch.

| Access point | Action and resulting ownership |
| --- | --- |
| Main Projects navigation | Opens the Project library; this option remains available. |
| Contextual Project tab/button | Shows the opened Project's tree in the left panel. |
| Catenoid document row or document switcher | Activates that Surface in Surfaces, restores its last valid view and shows its matching Inspector. |
| Surface / Sampled switch above the viewport | Changes the view of Catenoid; document ID, source generation and command history remain the same. |
| Mesh 1 or Mesh 2 document row/switcher entry | Activates that exact saved Mesh in Mesh, with its own generation, selection, appearance and results. |
| Catenoid Inspector → Related → Derived Meshes | Lists both Meshes with name, sampling, source generation and current/historical status. Open activates the chosen Mesh; these are references to its existing tree entry. |
| Mesh Inspector → Related → Source Surface | Resolves the recorded source Surface generation. Open activates that exact target or reports its unavailable/historical state. |
| Mesh / Study switch, when supported | Changes the presentation of the selected Mesh without selecting Mesh 1/2 or its source Surface implicitly. |
| Main Surfaces / Mesh navigation | Resumes the last valid document selected in that module within the opened Project. With multiple candidates and no remembered selection, show a document chooser; with one candidate, activate it. |
| Back / Forward | Restores the previous document and view in the same Project, with the corresponding Inspector and compatible view state. |
| Project details → Return to document | Flips the middle content while retaining the active mathematical document and view. |

Two selectors have distinct purposes: the document switcher chooses Catenoid,
Mesh 1 or Mesh 2; the view switcher chooses a supported presentation of that
document. View choices do not appear as extra documents in the tree.

Example journey:

```text
Project → Catenoid [Surface ↔ Sampled]
        → Related / Mesh 1 [Mesh; optional Study]
        → Related / Mesh 2 [Mesh; optional Study]
        → Open source Surface → Catenoid
```

Mesh-to-Mesh navigation uses the document switcher/Project tree or an explicit
sibling link resolved through their shared Surface relation. The Inspector
always states which Mesh is selected and which Surface generation produced it.
Showing both Meshes at once is a later Compare action, not the ordinary meaning
of opening either Mesh.

### Acceptance before completing the shared workbench integration

1. Render the retained Catenoid through both qualified bindings and check
   source identity/hash, coordinates, axis, orientation, domains and periodic
   seams. No built-in preset substitution or source conversion is allowed.
2. Switch Surface / Sampled without changing source/history; preserve source
   drafts and compatible camera state. Qualify selection mappings explicitly.
3. Open Mesh 1 and Mesh 2 independently; prove that buffers, fields, generation
   and Inspector/results belong to the chosen Mesh. Return to their exact
   recorded source, including historical/missing-source cases.
4. Edit the Surface and prove that its preview updates while both retained
   Meshes/results preserve their recorded ownership and historical status.
5. Save/restart with each supported document/view selected. Restore the same
   document and supported presentation or provide an explicit unavailable-view
   explanation.
6. Verify module navigation, document/view switches, Related links and Back/
   Forward all use the active Project context and reject late async bindings.

## Later phase: Project comparison and composition

Begin this phase only after PM10 acceptance. It references existing documents
without transferring ownership or merging their scientific sources. Coordinate
systems, units, transforms, historical generations, capabilities and resource
budgets must be explicit before members can be combined.

| Slice | Planned commit title | Scope and acceptance |
| --- | --- | --- |
| PC01 | `feat(projects): define non-owning document composition references` | Define checked member references, source generations, coordinates/units and missing/historical status; preserve original documents and Projects. |
| PC02 | `feat(viewer): expose composable SurfaceViewer render bindings` | Reuse shared Mesh/Geometry rendering inputs with explicit member identity and independent selection/appearance; qualify resource cleanup. |
| PC03 | `feat(projects): overlay Geometry and Mesh documents` | Overlay only compatible, explicitly selected document members; retain ownership and reject incompatible frames/units. |
| PC04 | `feat(projects): add per-member visibility and appearance` | Maintain UI visibility/material/field choices independently of scientific sources; validate every field generation. |
| PC05 | `feat(projects): add synchronized side-by-side comparison` | Compare heterogeneous renderer families in separate panes; each shows its exact source and selection. |
| PC06 | `feat(projects): add compatible camera synchronization` | Offer explicit camera synchronization only for compatible dimensions/frames and retain independent camera mode. |
| PC07 | `feat(workbook): embed project comparisons in Visualize blocks` | Resolve checked comparison references from Workbook content without changing the active scientific sources. |
| PC08 | `feat(workbook): freeze comparison captures with both source generations` | Store provenance-qualified immutable captures with member generations, view settings and current/historical status. |
| PC09 | `feat(notes): allow observations spanning multiple source documents` | Extend checked Note references with compatibility/migration acceptance; do not silently broaden existing anchor semantics. |
| PC10 | `test(projects): qualify multi-document composition and comparison` | Prove ownership, generation, units, missing-data, selection, capture, restart and renderer-lifetime parity for the declared supported modes. |

Keep two distinct modes:

- **Overlay:** compatible Geometry and Mesh members share a SurfaceViewer scene
  with explicit member transforms and ownership.
- **Compare:** separate viewers can show Parametric Surface beside Mesh, or other
  qualified combinations. Synchronization is optional and capability-checked.

Generation comparison is a priority within PC05: current versus retained historic
Surface, Mesh before versus after remeshing, result versus result, or snapshot
versus live document. Resolve retained snapshots and missing resources explicitly;
never reconstruct unavailable history from a current source and call it historical.

The trajectory is: reliable active document first; stronger Related/Overview/
Workbook navigation next; explicit comparison/composition of multiple retained
documents last.

## First-flow implementation — 2026-10-07

The first implementation slice is `ba423d2`:

- Open Catenoid Evidence from Projects and display its retained constructed
  Surface through the existing GeometryViewer/SurfaceViewer rendering path.
- Open its retained sampled Mesh, return through Open source Surface, save and
  resume the same Project/document after a cold Electron restart. Mesh selection
  also survives save/restart; source identity and hash are checked.
- Show the contextual Project button after workspace activation; keep Projects
  available in the main navigation. Restore resources before publishing the
  opened Project and report resume failures explicitly.
- Use Project details to flip the middle area to deeper Project content, then
  Return to document. The renderer remains mounted and its source draft survives.
- Keep linked Mesh/source-return controls reachable beside a docked Project,
  open saved Meshes with viewport controls collapsed and keep the selected
  document/module consistent when returning to Surface or a promoted Curve.

This qualifies the first journey and the simple flip. The complete shared
DocumentWorkspaceHost, adapter capability UI, Workbook flip, camera persistence
across restart and launcher/installed-app acceptance remain in PM01–PM10.
Detailed evidence is kept in
`docs/evidence/project-master-desktop-2026-10-07/acceptance.md`.
