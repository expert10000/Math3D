# Geometry controls: visible desktop inventory and cleanup

Source audit: 2026-11-14, based on `main` at `35afd770` and the control corrections in this worktree. This inventory covers the controls visible in the supplied desktop screenshot (Geometry, Procedural mode, Analyze step, Selection inspector) and the choices immediately behind its Geometry navigation strips. Controls inside other panels, expanded menus, and scrolled-off inspector content need a separate inventory if they are changed.

The three columns have distinct jobs: the left pane configures a task, the center acts on the scene, and the right Inspector explains the selected object or result. The [professional workflow freeze](geometry-professional-workflow-freeze.md) preserves those responsibilities and the seven accepted journeys.

## Shared app header (visible above Geometry)

| Control | What it does |
| --- | --- |
| File, Mesh, Edit, View, Insert / Create, Analysis, Window, Help | Desktop application menus; their items depend on context. These are menus, not Geometry panel tabs. |
| Back / forward arrows | Navigate workspace history. |
| Projects, Graphs, Curves, Surfaces, Mesh, Geometry, CAS / Algebra, Number Theory, Volume, Topology, Complex Analysis | Switch the main module. `Geometry` is selected in the screenshot. |
| Workspace, Present, Inspect | Change the app's display mode. |
| Left, Right | Collapse or restore the respective dock. |
| Focus | Maximize or restore the center viewer. |
| Reset docks | Restore recommended dock widths and visibility for this workspace. |
| View | Open the global view menu. This differs from Geometry's `Panel → View` and `Analysis tools → View`. |
| Compute, Sage Console, Palette, Settings | Open Compute Center, Sage Console, command palette, and preferences. |

Shared header handlers: [`App.tsx`](../renderer/src/App.tsx) around lines 81190–81470. This table names the visible top-level controls; it does not enumerate the unopened menus.

## Geometry navigation

| Strip | Buttons and actual destination |
| --- | --- |
| Panel | `Scene` → scene tree; `Object` → selected object details; `View` → procedural view panel; `Analysis` → comparison panel; `Services` → debug/presets panel; `Theory` → theory/measurement panel. |
| Actions | `Gallery` opens Gallery choices and create panel; `New` **starts a fresh Geometry scene by clearing the current one**, then opens New workspace choices (the button tooltip states this); `Demo` enters demo mode; `Compare` opens the analysis panel and prepares comparison from selection; `More` opens Existing tools and Scene Script. |
| Tools | `Construct` → construction panel; `Modify` → transform panel; `Analyze` → comparison panel; `Navigate` → scene panel. These are shortcuts, not independent tool engines. |
| Gallery choices | `Object Gallery` → create panel; `Scene Gallery` → demonstrations. |
| New choices | `New object` → fresh object workspace; `Construction Lab` and `Scratch` → scratch editor; `Workbook` → workbook mode. |
| More choices | `Procedural`, `Demo preview`, `Scratch editor`, `Workbook scene`, `History`, `Scene Script`, `Topology / Euler`, `Presets / debug` open the named mode or procedural panel. |

Sources: [`professionalWorkflow.ts`](../renderer/src/geometry/professionalWorkflow.ts) and [`App.tsx`](../renderer/src/App.tsx) around lines 75395–75429 and 81997–82093. `New` deliberately starts a fresh scene. To add to the current scene, use `Gallery → Object Gallery → Add now` or `Add preset` in the create pane.

| Strip | Buttons and actual destination |
| --- | --- |
| Mode | `Procedural` opens the object/scene workflow; `Demo preview` changes to demo mode; `Scratch editor` opens the construction editor; `Workbook scene` opens the current/seed workbook in full UI. `Hide controls` hides the viewer controls strip; `Show controls` restores it. |
| Workflow | `1 Create` → create panel; `2 Place` → scene panel; `3 Transform` → transform panel; `4 Analyze` → analysis panel and prepares compare; `5 Export` → full workbook UI. The highlighted step is derived from current mode/panel, so it is navigation state rather than a completed-step indicator. |
| Analyze commands in screenshot | `Compare` → analysis panel and prepares compare; `Measurements` → analysis panel and measurement controls; `Demonstrations` → demonstrations panel; `Gaussian K` → sampled-field controls with quantity K; `Surface curvature` → exact surface differential-analysis controls; `Topology` → Euler/topology panel; `History` → history panel; `View` → view panel. These buttons open or focus controls; none runs a numerical analysis merely by being clicked. |
| Create commands | `Primitive`, `Construct`, `Curve`, `Surface`, `Mesh`, `Script`, `Presets`, `View` open the mapped panels. `Curve` shares Construct; `Surface` shares Primitive/Create. |
| Place commands | `Scene tree`, `Construct`, `Place by click`, `Grid`, `Face`, `Vertex`, `Edge`, `View`. Placement targets also arm placement mode; `Grid` enables snapping. |
| Transform commands | `Move`, `Rotate`, `Scale` open transform and toggle the corresponding gizmo. `Mirror`, `Align`, `Boolean` open the transform panel. `View` opens view panel. |
| Export commands | `Workbook` opens full workbook; `Selected` opens object panel; `GLB` exports all visible Geometry objects; `Snapshot` saves workbook; `Reports` opens history; `View` opens view panel. |

Sources: [`App.tsx`](../renderer/src/App.tsx) around lines 75430–75670 and 82578–82793. The analysis shortcuts focus existing controls; the user still explicitly runs the selected analysis.

## Left analysis pane in the screenshot

| Control or display | What it does |
| --- | --- |
| Quotient surface preview selector | Changes which available realization of the quotient surface is shown in the small 3D preview. The screenshot selects `Smooth torus realization`. |
| Edge / Label / Pairs with table | Read-only edge identifications and orientations for the current gluing diagram. |
| Standard-surface comparison table | Read-only reference rows for orientability, boundary components, Euler characteristic and polygon word. Highlighting identifies the current comparison; clicking a row has no handler here. |

Source: [`App.tsx`](../renderer/src/App.tsx) around lines 103565–103692. The current left pane is scrolled within the Topology/Euler analysis content.

## Center viewer

| Control | What it does |
| --- | --- |
| Transform: Move, Rotate, Scale | Toggle the object transform gizmo mode. When Scale is active, `Uniform` locks scaling across axes. |
| Display: Wireframe | Toggle wireframe rendering. |
| Coordinates | Toggle coordinate planes. When enabled, XY/XZ/YZ planes, grid, major/minor lines, labels and axes controls appear. |
| Badges | Toggle viewport badges. |
| Notes: Off / Pins / Labels / All | Choose whether project-note pins and labels appear; the adjacent number is the current object-local note count. |
| Dependencies | Toggle the construction dependency overlay. |
| Create overlay | Toggle creation actions overlay. |
| Command preview | Toggle preview badges/ghost overlays in the viewport; strip preview text remains. |
| Opacity | Set Geometry render opacity from 0.2 to 1. |
| Quality: Auto / Fast / Full | Set global viewport quality override; Auto can choose Fast for a heavy scene. |
| Camera: 3D / Planar | Apply 3D or planar camera preset. |
| Fit scene / Fit active stage / Fit claim | Frame all scene content, the active workbook stage, or the current claim. |
| Reset camera | Reset camera preset and viewer state. |
| Include helpers in fit | Include helper geometry when fitting the camera. |
| Controls: Full | Open a menu for Full, Compact or Hidden viewer-control density. |
| Pick: Geometry Object / Face / Edge / Vertex | Set which entity is selected by viewer clicks. The object mode exposes object actions; other modes expose entity-specific actions. |
| Preview and Apply preview | Show the prospective contextual operation, then run it when available. Preview text can remain visible while viewport overlay visibility is toggled. |
| Open Object Details / Transform / History | For selected whole object: open left object details, go to transform step, or open history in Inspector. |
| Overlays | Toggle command-preview overlays from the contextual strip. |
| Orientation compass | Reorient the camera by axis; its display is not a scene object. |

Sources: [`App.tsx`](../renderer/src/App.tsx) around lines 105375–105938 and [`ViewerControls.tsx`](../renderer/src/components/ViewerControls.tsx). Actual contextual actions depend on current pick and available selection.

## Right Inspector (visible portion)

| Control | What it does |
| --- | --- |
| Inspector / Workbook | Switch between the object/result Inspector and full workbook UI. |
| Summary | Show selected entity, result lifecycle, and dependency count. |
| Selection | Show active selection, its actions, selection history, and bookmarks. |
| Geometry | Show geometric properties. |
| Analysis | Show current/saved analysis results and result actions. |
| Diagnostics | Show current analysis revision and warnings; stale result cannot publish to viewport. |
| Provenance | Show input/dependency origin. |
| History | Show saved analysis results and shared result lifecycle entries. |
| Actions | Show actions related to the selected Geometry entity. |
| Object Details | Open full selected-object details in the left pane. |
| Clear selection | Clear the currently selected entity; does not clear the scene. |
| Preview legend / Open preview settings | Explain preview visibility and open preferences for preview accessibility. |
| Run: Open Object Details / Transform / History | Repeat the selected object's contextual actions. |
| Bookmark selection / Redo selection | Save a selection reference or restore a recent selection when available. Recent and bookmarked entries can be reopened. |
| Pick Mode: Object / Face / Edge / Vertex | Set the same pick-mode state as the center toolbar. All four Pick Mode entry points now use the same handler, which also opens Selection and updates the relevant operation input slot. |

Sources: [`App.tsx`](../renderer/src/App.tsx) around lines 107325–107495 and 107895–109061, and [`ActiveSelectionCard.tsx`](../renderer/src/components/ActiveSelectionCard.tsx). The right pane continues below the screenshot; its scrolled-off controls are outside this inventory.

## Footer and floating entry points

The bottom status line reports active Geometry viewer mode, selected object and geometry counts, camera, display and analysis readiness. `Notes` opens the shared project-note entry point. `Kernel workspace` opens the shared document/provenance and replay panel; it is not a Geometry operation. See [`KernelWorkspacePanel.tsx`](../renderer/src/components/KernelWorkspacePanel.tsx).

## Cleanup proposal, in order

1. **Completed in this worktree:** `Measurements`, `Gaussian K`, and `Surface curvature` now focus distinct controls; `Reports` is labeled `History`; all four Pick Mode entry points use one handler. The focused test is in [geometry-picking.spec.ts](../tests/e2e/geometry-picking.spec.ts).
2. **Clarify new versus add.** Keep `New` as the fresh-scene reset. Make the existing `Gallery → Object Gallery → Add now` path obvious for adding to the current scene; consider a direct `Add object` shortcut if usage shows it is needed. The current [scene-script E2E](../tests/e2e/geometry-scene-script-roundtrip.spec.ts) verifies the reset behavior.
3. **Reduce repeated navigation layers.** The shell's `Analysis`, `Compare`, `Analyze`, workflow `4 Analyze`, and Analyze command `Compare` converge on one panel. Keep one primary route in each relevant context and replace the others with task-specific actions or progressive menus. Distinguish global `View` from Geometry `View` with a more specific label.
4. **Preserve task feedback.** Keep source/revision, preview/apply, stale-result diagnostics, selection history, and camera/quality controls reachable when the layout becomes more compact. Test the seven journeys named in the workflow freeze.

The [workflow freeze](geometry-professional-workflow-freeze.md) explicitly keeps existing duplicate controls until a separately reviewed and accepted replacement. This document is the behavior map and proposed replacement sequence; it does not remove controls or claim the UI has already been cleaned up.

The box Euler count in the screenshot is addressed separately in the [2.0 topology reconciliation](geometry/2.0/TOPOLOGY_RECONCILIATION.md).
