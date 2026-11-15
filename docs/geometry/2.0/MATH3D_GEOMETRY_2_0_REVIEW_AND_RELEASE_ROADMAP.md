# Math3D 2.0 — Geometry Review, Corrections, and Release Roadmap

Date: 2026-11-14
Project: MATH3D-2026
Basis: supplied Geometry workspace screenshot and `Math3D_Geometry_Mesh_Unification_Plan.md`.

## Purpose and evidence boundary

For **Math3D 2.0, prioritize a clearer Geometry workflow, trustworthy analysis, and the Geometry–Mesh handoff**. The screenshot already contains substantial functionality; the biggest opportunity is to make its state and available actions easier to understand.

The attached unification plan supports that direction. Keep Geometry and Mesh as specialized workbenches, with shared identity, selection, history, and representations.

These observations are based on the screenshot and plan. Implementation details still need checking against the code. Proposed acceptance criteria below are requirements, not claims that the implementation already passes them.

## IMPORTANT — Flagship 2.0 demonstration and acceptance journey

> **The strongest 2.0 demonstration would be one complete journey:** create a parameterized box, measure it, open its mesh, edit a supported component, return to Geometry, inspect dependencies, undo across workbenches, and save/reopen with the relationships intact.

**Treat this journey as an important release acceptance scenario, not merely a presentation example.** It connects the visible Geometry experience with the architectural promises of shared identity, representations, selection, analysis, provenance, history, and persistence.

The journey is expanded into executable acceptance steps in Section 9. Passing isolated toolbar checks is insufficient if this complete workflow breaks.

## 1. First correction: the box topology report

The most significant issue visible is:

```text
V = 24
E = 30
F = 12
χ = V − E + F = 6
```

The arithmetic is correct, but **a closed box boundary should have Euler characteristic 2**.

Those counts are consistent with six separately indexed, triangulated face patches: each patch has four vertices, five edges, and two triangles. Rendering vertices are often duplicated at normal or UV seams, so this could be a representation issue rather than a broken box. Confirm the actual connectivity before diagnosing the implementation.

| Analysis basis | Expected result for a conventional box boundary |
| --- | --- |
| Render-buffer indices | May contain duplicated vertices and disconnected face patches |
| Connected surface topology | V = 8, E = 18, F = 12, χ = 2 for a triangulated box |
| Solid interpretation | Requires checking that the boundary is closed, manifold, and consistently oriented |

**Recommended change:** label the current result **Raw indexed mesh**, then offer **Analyze connected topology** when suitable connectivity information is available.

Show boundary edges, connected components, non-manifold edges, and the method used to identify shared vertices. Do not silently weld coincident positions: separate objects or sheets can legitimately occupy the same location.

Also clarify that **Valid triangles: 12** means triangle-level validity; it does not establish a valid closed solid.

### Acceptance criteria

- Every topology report identifies its input representation and revision.
- Raw render indexing is distinguishable from surface connectivity.
- Any position-based welding is explicit and records its tolerance and units.
- The canonical connected triangulated box reports V = 8, E = 18, F = 12, χ = 2.
- A deliberately disconnected six-patch example retains its actual disconnected topology unless the user explicitly requests reconstruction.
- Solid measurements explain their prerequisites and failure reasons.

## 2. Reduce the number of competing control layers

The screenshot has global navigation, panel selectors, actions, tool groups, mode selectors, workflow steps, analysis tabs, viewer controls, picking controls, and Inspector tabs.

Each is understandable individually, but together they make the active task difficult to identify.

| Visible area | Suggested 2.0 change |
| --- | --- |
| PANEL / ACTIONS / TOOLS | Establish one clear hierarchy: workbench → task → contextual tools |
| Construct / Modify / Analyze / Navigate | Keep Construct, Modify, Analyze as task groups; place navigation controls with the viewer |
| Five-step workflow | Make it an optional guided workflow; ordinary editing needs free movement between steps |
| Viewport control rows | Keep frequent controls visible; move secondary display settings into a View popover |
| Inspector tabs | Group around Properties, Selection, Analysis, Dependencies, History |
| Controls: Full | Offer a clearly named compact toolbar mode |

**Target outcome:** the user can immediately answer “What is selected?”, “What am I doing?”, and “What will Apply change?”

### Implementation guidance

- Preserve access to existing tools while reducing permanent toolbar density.
- Make the active workbench and active task visually distinct.
- Use contextual tools that respond to object/component selection.
- Keep camera navigation available during construction and analysis.
- Validate the layout in low-height windows as well as wide desktop windows.
- Avoid replacing crowded rows with an equally crowded collection of nested menus.

## 3. Correct the preview model

The screenshot shows:

- Preview: open selected Geometry object …
- Apply preview.
- A floating panel describing Operation: Move.
- Selection information repeated elsewhere.

Opening object details is navigation and should happen immediately. It should not appear as a pending geometry modification.

Use this behavior consistently:

| Action | Expected behavior |
| --- | --- |
| Open details, History, inspect source | Immediate navigation |
| Select object or component | Immediate selection |
| Move, Boolean, offset, bevel | Parameterized preview with Apply and Cancel |
| Expensive analysis | Run with progress and cancellation; retain result when completed |

For a real operation, show one compact transaction area:

**Move · Box**
ΔX, ΔY, ΔZ · Coordinate frame · **Cancel / Apply**

Keep the floating viewport notification transient. Persistent selection details belong in the Inspector.

### Acceptance criteria

- Navigation commands never create artificial pending edits.
- Cancel leaves the committed model unchanged.
- Apply creates one coherent undoable operation.
- Changing preview parameters does not flood committed history.
- Preview computation supports cancellation where it is expensive.
- Results from outdated preview generations cannot overwrite newer state.
- The target, operation, parameters, and commit controls agree across the viewport and Inspector.

## 4. Make selection visually obvious

In the supplied image, the box is large but its selected state is not immediately apparent. The floating message carries much of that responsibility.

For 2.0:

- Give selected objects a clear outline.
- Distinguish hover, committed selection, and operation preview visually.
- Highlight selected faces, edges, and vertices directly.
- Rename **Geometry Object** to **Object**, as the unification plan proposes.
- Keep one authoritative Object / Face / Edge / Vertex selector.
- Add frontmost selection and an explicit through-selection mode.
- Make **Frame selection** easy to find.

The Inspector should begin with something like:

**Box**
Solid · Parametric definition · Generated mesh available
**Edit definition · Edit mesh · Transform**

Technical IDs can remain available under details.

### Selection acceptance criteria

- Hover does not replace committed selection.
- Workbench switching preserves object selection.
- Component selection survives only when a valid mapping exists.
- Ambiguous mappings offer an explicit choice or mapped set.
- Missing mappings explain the loss of component selection and preserve the parent object when possible.
- Selection indicators remain legible without relying solely on color.

## 5. Strengthen Geometry’s identity

Geometry should make mathematical construction particularly useful. Prioritize these tools over a large collection of additional mesh operations:

| Priority | Capability | Practical value |
| --- | --- | --- |
| P0 | Numeric dimensions and transforms | Precise construction |
| P0 | Local/world coordinate frame and units | Reliable editing and measurement |
| P0 | Vertex, edge, grid, and plane snapping | Accurate placement |
| P0 | Distance, angle, area, bounds | Immediate verification |
| P1 | Construction points, axes, planes | Reusable references |
| P1 | Align, distribute, mirror, repeat | Efficient scene construction |
| P1 | Intersections and cross-sections | Strong mathematical exploration |
| P1 | Named parameters and expressions | Related dimensions and reusable models |
| Later | General constraint solving | Valuable, but a larger engineering commitment |

For measurements, distinguish **exact**, **numerically evaluated**, and **mesh approximation**. Volume should report why it is unavailable when the mesh does not support a reliable calculation.

### Measurement result requirements

Retained results should identify:

- Source object and representation.
- Source revision or generation.
- Coordinate frame and units.
- Method and parameters.
- Exactness or approximation status.
- Applicable validity checks.
- Current or stale status after source changes.

An analytical measurement from a primitive definition and an approximate measurement from an edited mesh may both be useful. Their labels must make the distinction clear.

## 6. Keep demonstrations accessible without crowding analysis

The polygon-identification visualizer is valuable, especially for Math3D’s educational purpose. However, placing it directly below the selected box’s topology report mixes two different activities:

- Analyzing the current object.
- Exploring an independent mathematical model.

Use the existing **Demonstrations** destination for the polygon tool, with an explicit **Create in scene** action where appropriate.

Likewise, organize analysis tools by meaningful questions:

- **Measurements:** lengths, angles, areas, volume.
- **Surface geometry:** normals, curvature, Gaussian curvature.
- **Topology:** connectivity, boundaries, manifoldness, Euler characteristic.
- **Reports:** saved results and their provenance.

**Gaussian** and **Curvature** currently look overlapping; make their distinction explicit or combine them.

### Demonstration behavior

- Opening a demonstration should not silently change the selected scene object.
- Creating an object from a demonstration should be explicit and undoable.
- Distinguish the abstract identification model from any rendered realization.
- Where relevant, explain limitations of a realization, including self-intersections or singularities.

## 7. Refine the unification plan before implementing it

The plan’s direction is sound, but several architectural details need refinement.

### 7.1 Extend the existing contracts

Map the proposal onto **Project, ScientificSelection, SceneResource, AnalysisResult, Job, and runtime capabilities**. Avoid introducing a second authoritative selection or analysis system.

Use adapters or compatible extensions where existing contracts already cover the responsibility. Preserve project and object identities through migration.

### 7.2 Separate linkage from validity

A representation can be both **modified linked** and **stale**. Instead of one state enumeration, track separately:

| Dimension | Example values |
| --- | --- |
| Source relationship | Native, linked, detached |
| Evaluation status | Current, stale, computing, failed |
| Artifact availability | Available, unavailable |
| Modification status | Unmodified, modifier stack, baked |

Define valid combinations and transitions. Historical source metadata can remain present even when the source cannot currently be resolved.

### 7.3 Scope component identity to a representation revision

Stable IDs help, but remeshing and Booleans can destroy correspondence. Support exact, ambiguous, and unavailable mappings; never silently select an unrelated component.

Selection sets and operation targets should record the representation revision they refer to. Mapping after a topology change needs an explicit outcome.

### 7.4 Treat modifier replay as a staged feature

Start with a small set of supported operations. Preserve the last valid representation if replay fails, and expose the failed step.

For each supported modifier, document input requirements, target mapping behavior, parameter validation, and failure recovery. Do not imply arbitrary topology edits can always replay after a source change.

### 7.5 Clarify detach and restore

Relinking may discard independent edits. Describe the actual effect and provide an undoable operation.

Distinguish detaching a representation from duplicating the object. Retain historical lineage where possible, while making the absence of automatic regeneration explicit.

### 7.6 Preserve keyboard accessibility

Revise the suggested keyboard shortcuts: plain **Tab** should preserve normal keyboard focus navigation.

Choose a separate workbench-switch shortcut after checking existing bindings. Keep selection-mode shortcuts consistent across Geometry and Mesh, and avoid triggering editing shortcuts while typing in fields.

### 7.7 Preserve compatibility and runtime boundaries

The implementation must account for nullable legacy source information, unavailable artifact bytes, stale generations, missing resources, incompatible coordinate frames, legacy selections, and offline scientific runtimes.

Unavailable computation must not prevent inspection of a saved project. Preserve supported metadata and the last valid available representation, and explain which actions need a runtime or missing resource.

## 8. A realistic 2.0 release boundary

Make these release requirements:

| Release requirement | Acceptance check |
| --- | --- |
| Trustworthy topology reporting | Box example explains raw indexing and connected surface topology correctly |
| Clear selection | Object and component selection are visible and consistent |
| Real operation transactions | Cancel leaves the committed model unchanged; Apply creates one undoable operation |
| Geometry–Mesh handoff | Same object identity, camera, and visibility survive switching |
| Honest representation status | Stale, missing, and failed representations are explained |
| Useful Geometry tools | Numeric editing, coordinate frames, snapping, and basic measurements |
| Persistent analysis | Results record source revision, method, units, and approximation |
| Recoverable project | Save/reopen preserves identity, relationships, and supported history |

Leave unrestricted modifier replay, automatic semantic reconstruction from arbitrary meshes, and a general constraint solver for later milestones.

The release should demonstrate supported behavior completely and expose unsupported cases clearly.

## 9. IMPORTANT — Complete Geometry–Mesh journey

> **Create a parameterized box, measure it, open its mesh, edit a supported component, return to Geometry, inspect dependencies, undo across workbenches, and save/reopen with the relationships intact.**

This is the flagship acceptance scenario for the proposed Geometry improvements. Run it as one continuous workflow, without manually repairing project state between steps.

### 9.1 Create a parameterized box

- Create a new Project and a parameterized box in Geometry.
- Use explicit dimensions, for example 2 × 3 × 4 in a declared length unit.
- Confirm that dimensions remain editable and that the object has a persistent identity.
- Record the source definition revision.

**Pass:** one object exists with a parameterized definition and clearly identified representations. No duplicate object is created merely to show its mesh.

### 9.2 Measure the box

For side lengths 2, 3, and 4:

```text
Surface area = 2(ab + ac + bc) = 52 square units
Volume = abc = 24 cubic units
Space diagonal = sqrt(a² + b² + c²) = sqrt(29) length units
```

- Identify whether each result uses the analytical definition or a mesh approximation.
- Show units and source revision.
- Analyze connected surface topology separately from raw render-buffer indexing.

**Pass:** analytical results agree with the formulas; mesh results meet documented tolerances. A connected triangulated box boundary reports χ = 2. The report never presents duplicated render indices as an unexplained solid-topology result.

### 9.3 Open the same object in Mesh

- Generate or activate the editable mesh representation.
- Open Mesh through the selected object’s contextual action.
- Preserve camera, visibility, and object selection.
- Preserve a component selection only when mapping is valid.

**Pass:** Project identity and object identity remain unchanged. The active workbench changes, and the active representation is clearly stated.

### 9.4 Edit a supported component

- Choose one explicitly supported component operation, such as a vertex move or supported edge bevel.
- Enter numeric parameters.
- Preview the edit, cancel once, and confirm that committed geometry is unchanged.
- Preview again and apply.
- Use the implementation’s documented linked-modifier or detach workflow.

**Pass:** the edit is visible, produces one coherent undo entry, and reports its actual representation relationship. An unsupported replay path is not presented as a functioning linked modifier.

### 9.5 Return to Geometry

- Open Geometry for the same object.
- Preserve camera, visibility, and object selection.
- Show the definition and edited mesh relationship accurately.
- Make it explicit which representation is displayed and measured.

**Pass:** the edited mesh remains accessible. The original parameterized definition is retained according to the chosen workflow. Geometry does not silently replace the edited result with an older generated mesh.

### 9.6 Inspect dependencies

- Inspect the definition → generated mesh → supported edit relationship.
- Inspect the measurement’s source representation and revision.
- Navigate to source and result.
- Identify stale results where the measurement input has changed.

**Pass:** dependency links resolve correctly. Historical analytical measurements are not mislabeled as measurements of the edited mesh. Missing resources are explained without inventing a source relationship.

### 9.7 Undo and redo across workbenches

- Undo the component edit from Geometry.
- Confirm the previous mesh state is restored.
- Switch workbenches and redo through the same shared history.
- Verify that selection remains valid or is explicitly remapped/cleared.

**Pass:** Undo/Redo targets the correct object and representation, with no duplicate objects, orphan dependencies, or unrelated selections. Workbench navigation itself does not masquerade as a geometry edit.

### 9.8 Save and reopen

- Save the Project after the edited state is restored.
- Close and reopen through the supported project workflow.
- Verify persistent object and representation identities.
- Inspect definition parameters, edited geometry, analysis provenance, and dependency links.
- Check persisted history only to the extent declared by the format; distinguish session-only undo from durable operation history.

**Pass:** the relationships remain intact and supported state is recovered. Any missing artifact or unavailable runtime has an honest status and a usable recovery path.

### 9.9 Record evidence

Record the build/commit, fixture, chosen edit, representation relationship, analytical and topology results, save format version, and pass/fail result for each step. Capture failures at the step where they occur.

**Release importance:** do not mark this scenario complete because individual features exist. Completion means the whole journey passes continuously on the supported release configuration.

## 10. Suggested implementation order

| Stage | Scope | Completion evidence |
| --- | --- | --- |
| 1 | Topology labels and measurement correctness | Canonical box and disconnected-patch checks |
| 2 | Toolbar hierarchy and authoritative selection | Clear selection/operation state at desktop and compact sizes |
| 3 | Preview/Apply/Cancel semantics | Cancel invariance and one-operation Undo |
| 4 | Geometry–Mesh handoff on existing contracts | Persistent identity, camera, visibility, selection mapping |
| 5 | Representation state and dependency reporting | Current/stale/failed/unavailable cases explained |
| 6 | Supported component edit and cross-workbench history | Continuous edit → return → Undo/Redo journey |
| 7 | Persistence and compatibility | Save/reopen preserves declared state and relationships |
| 8 | Flagship demonstration and release evidence | Complete Section 9 journey passes |

Retain educational demonstrations, advanced modifiers, and further construction tools as planned extensions. The immediate release emphasis is a complete, understandable, recoverable Geometry–Mesh workflow.
