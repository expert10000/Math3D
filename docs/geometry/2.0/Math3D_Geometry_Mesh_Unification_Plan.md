# Geometry–Mesh Unification Plan

## Purpose

Math3D should treat **Geometry** and **Mesh** as two specialized workbenches operating on the same scene entities.

The user should not need to think:

> Is this object in Geometry or in Mesh?

Instead, the model should be:

> This scene object has a mathematical definition and one or more editable representations.

The final design should provide:

- one scene;
- one object identity;
- one scene tree;
- one selection system;
- one Inspector;
- one history timeline;
- multiple geometry, surface, mesh, and analysis representations;
- specialized Geometry and Mesh workbenches.

---

# 1. Current Foundation

The present UI already provides a strong base for Geometry–Mesh unification.

Existing capabilities visible in the current Geometry workspace include:

- a shared 3D viewer;
- object, face, edge, and vertex picking;
- hover and committed-selection states;
- a scene tree containing procedural and mesh-derived objects;
- Inspector tabs for Selection, Properties, Actions, and Dependencies;
- object details and vertex/face counts;
- preview and apply-preview controls;
- Transform and History actions;
- source and derived-object information;
- Geometry objects produced from Mesh operations;
- mesh-derived results displayed inside the Geometry scene.

This means the remaining work is mainly about:

1. shared object identity;
2. representation management;
3. cross-workbench selection;
4. operation ownership;
5. lineage and history;
6. consistent UI terminology.

---

# 2. Recommended Architecture

Geometry and Mesh should remain separate top-level workbenches, but they should operate on the same shared scene.

```text
Shared Scene
 ├─ Objects
 ├─ Selection
 ├─ Camera
 ├─ Visibility
 ├─ History
 ├─ Dependencies
 └─ Representations
        │
        ├─ Geometry Workbench
        │    semantic and parametric editing
        │
        └─ Mesh Workbench
             topology and component editing
```

## 2.1 Geometry workbench ownership

Geometry should own:

- definitions;
- parameters;
- primitive dimensions;
- construction inputs;
- constraints;
- derived geometry;
- Boolean operations;
- measurements;
- parametric recomputation;
- geometry-to-mesh conversion settings;
- mathematical and procedural relationships.

## 2.2 Mesh workbench ownership

Mesh should own:

- vertex movement;
- edge editing;
- face editing;
- extrude;
- inset;
- bevel;
- split;
- merge;
- dissolve;
- subdivide;
- remesh;
- normals;
- topology repair;
- component transforms;
- topology statistics;
- mesh validation.

The same object may be opened in either workbench. The active workbench changes the tools, not the object identity.

---

# 3. Core Design Principle

The final object model should be:

```text
One object
One selection
One scene tree
One Inspector
One history
Multiple representations
Different specialized workbenches
```

A Geometry object may contain:

```text
Parametric definition
        ↓
Evaluated geometry
        ↓
Generated mesh
        ↓
Mesh modifier stack
        ↓
Analysis representation
```

The UI should expose this as one entity with linked representations rather than several unrelated copies.

---

# 4. Shared Scene Entity

Introduce a shared entity model used by Geometry, Mesh, Analysis, and future workbenches.

```ts
interface SceneEntity {
  id: string;
  name: string;

  kind:
    | "solid"
    | "surface"
    | "curve"
    | "mesh"
    | "construction"
    | "analysis";

  representations: SceneRepresentation[];
  activeRepresentationId: string;

  visibility: boolean;
  locked: boolean;

  lineage: LineageReference[];
  metadata?: Record<string, unknown>;
}
```

A representation may be:

```ts
interface SceneRepresentation {
  id: string;
  entityId: string;

  kind:
    | "parametric"
    | "evaluated-geometry"
    | "surface"
    | "editable-mesh"
    | "analysis-mesh"
    | "render-proxy";

  state:
    | "linked"
    | "modified-linked"
    | "detached"
    | "stale"
    | "invalid";

  sourceRepresentationId?: string;
  revision: number;
}
```

---

# 5. Shared Selection System

## 5.1 Rename the pick mode

The current label:

```text
Geometry Object | Face | Edge | Vertex
```

should become:

```text
Object | Face | Edge | Vertex
```

“Geometry Object” incorrectly suggests that only Geometry-native objects can be selected.

Object type and representation should be shown separately.

Example:

```text
Tower B pyramid
[Parametric] [Mesh available]
```

or:

```text
Demo bevel edge
[Editable Mesh] [Derived from Geometry]
```

## 5.2 Shared selection contract

Use one selection object across Geometry and Mesh.

```ts
interface SceneSelection {
  objectId: string;
  representationId?: string;

  kind: "object" | "face" | "edge" | "vertex";

  faceId?: string;
  edgeId?: string;
  vertexId?: string;

  worldPoint?: Vector3;
  localPoint?: Vector3;

  normal?: Vector3;
  tangentU?: Vector3;
  tangentV?: Vector3;

  sourceWorkspace?: "geometry" | "mesh" | "analysis";
}
```

## 5.3 Stable component IDs

Do not rely only on array indices such as:

```ts
faceIndex: number;
vertexIndex: number;
```

Indices can change after:

- subdivision;
- bevel;
- edge split;
- deletion;
- remeshing;
- topology repair;
- Boolean operations.

Prefer stable identifiers:

```ts
faceId: string;
edgeId: string;
vertexId: string;
```

A topology-changing operation should also provide remapping information:

```ts
interface ComponentRemap {
  oldId: string;
  newIds: string[];
  status: "preserved" | "split" | "merged" | "deleted";
}
```

---

# 6. Preserve Selection Between Workbenches

Expected workflow:

1. Select an object, face, edge, or vertex in Geometry.
2. Open the Mesh workbench.
3. Keep the same scene object selected.
4. Preserve the selected component when a corresponding mesh component exists.
5. Activate Mesh-specific actions automatically.
6. Preserve camera, visibility, isolation, and viewport orientation.

Example:

```text
Geometry:
Tower B pyramid / Edge E-42 selected

Switch to Mesh

Mesh:
Tower B pyramid / Edge E-42 selected
Available actions:
Bevel, Split, Dissolve, Mark, Transform
```

If exact component preservation is impossible, the UI should explain why:

```text
The previous geometry edge maps to 3 mesh edges.
[Select all mapped edges] [Choose from list]
```

---

# 7. Representation Switch in the Inspector

Add a dedicated Representation section for the selected object.

```text
Representation

● Parametric Geometry
○ Evaluated Surface
○ Editable Mesh
○ Analysis Mesh
```

Available actions:

```text
Open Geometry Definition
Open Mesh Editing
Generate Mesh
Update Mesh from Geometry
Detach Mesh
Restore Linked Mesh
Return to Source
```

The representation area should also show state:

```text
State: Modified linked mesh
Source: Tower B parametric definition
Last update: revision 18
Mesh operations: 3
```

---

# 8. Representation States

Every mesh representation should explicitly use one of the following states.

## 8.1 Linked mesh

```text
Geometry definition
        ↓
Generated mesh
```

Characteristics:

- Geometry edits regenerate the mesh.
- The mesh remains associated with its source definition.
- Direct mesh edits are restricted, stored as modifiers, or require detachment.

## 8.2 Modified linked mesh

```text
Geometry definition
        ↓
Generated mesh
        ↓
Mesh operation stack
```

Example:

```text
Box definition
→ Tessellation
→ Subdivide
→ Bevel selected edges
```

Characteristics:

- Source geometry remains editable.
- Mesh operations are replayed after regeneration.
- Failed modifier replay is reported clearly.
- This should be the preferred state for most workflows.

## 8.3 Detached mesh

```text
Independent editable mesh
```

Characteristics:

- No automatic regeneration from Geometry.
- Full topology editing is allowed.
- The source relationship may remain visible as historical lineage.
- The user may optionally restore or relink.

## 8.4 Stale representation

A linked mesh becomes stale when its source changes but regeneration has not yet completed or has been deferred.

```text
State: Stale
Source revision: 21
Mesh revision: 19
```

Actions:

```text
Update now
Inspect changes
Keep old mesh temporarily
Detach
```

---

# 9. Shared Scene Tree

Geometry and Mesh should not maintain separate copies of the same object.

Recommended expanded row:

```text
▾ Tower B pyramid                         👁  🔒  ⋮
   Parametric definition                  G
   Evaluated geometry                     S
   Editable mesh                          M
   Derived analysis                       A
```

Compact row:

```text
Tower B pyramid                    [G] [M] [A]
```

Badge meanings:

- `G` — parametric or semantic geometry definition;
- `S` — evaluated surface or solid representation;
- `M` — editable mesh representation;
- `A` — analysis result exists;
- chain icon — linked representation;
- modified-chain icon — linked with mesh operations;
- broken-chain icon — detached mesh;
- warning icon — stale or invalid representation.

Suggested row context menu:

```text
Open Definition
Open Geometry
Open Mesh
Open Analysis
Regenerate Mesh
Update Representations
Detach Mesh
Duplicate
Rename
Hide
Isolate
Lock
Delete
```

---

# 10. Shared Inspector

The current Inspector is already close to the correct structure.

Recommended permanent tabs:

```text
Selection
Properties
Actions
Dependencies
History
```

## 10.1 Selection tab

Example object selection:

```text
Object: Tower B pyramid
Entity type: Solid
Active representation: Editable Mesh
Representation state: Modified linked
Vertices: 5
Faces: 6
Source: Tower B parametric object
```

Example edge selection:

```text
Object: Tower B pyramid
Entity: Edge E-42
Length: 1.824
Boundary: No
Manifold: Yes
Adjacent faces: F-16, F-17
Source mapping: Geometry edge GE-8
```

## 10.2 Properties tab

The content should depend on the selected entity.

Object:

- name;
- visibility;
- transform;
- representation;
- source;
- tessellation settings;
- metadata.

Face:

- area;
- normal;
- material;
- smoothing;
- boundary;
- source mapping.

Edge:

- length;
- tangent;
- crease;
- boundary/manifold state;
- source mapping.

Vertex:

- local coordinates;
- world coordinates;
- normal;
- valence;
- constraint or source relation.

## 10.3 Actions tab

Actions should be context-sensitive.

### Object actions

```text
Transform
Duplicate
Convert
Generate Mesh
Update Mesh
Detach Mesh
Open Definition
Open Mesh
Delete
```

### Face actions

```text
Extrude
Inset
Offset
Subdivide
Triangulate
Flip Normal
Delete
Create Surface
Measure Area
```

### Edge actions

```text
Bevel
Split
Dissolve
Collapse
Mark Sharp
Create Curve
Measure Length
```

### Vertex actions

```text
Move
Merge
Weld
Dissolve
Delete
Create Point
Inspect Valence
```

## 10.4 Dependencies tab

Show representation and object lineage.

```text
Tower B definition
      ↓
Evaluated solid
      ↓
Editable mesh
      ↓
Bevel operation
      ↓
Bounding box analysis
```

Dependencies should support:

- selecting source;
- selecting result;
- opening source workbench;
- opening result workbench;
- highlighting affected entities;
- showing stale or broken links.

## 10.5 History tab

History should become a permanent Inspector tab instead of only a small action button.

---

# 11. Shared Operation Bar

The current selection and preview bar contains several different concepts at once.

Example current state:

```text
Selected geometry object
Preview
Apply preview
Open Object Details
Transform
History
```

Separate:

1. selection state;
2. active operation;
3. preview state;
4. general actions.

## 11.1 No pending operation

```text
Selection: Tower B pyramid / Object

[Edit Definition] [Edit Mesh] [Transform] [History]
```

## 11.2 Pending operation

```text
Selection: Tower B pyramid / Edge E-42

Pending operation:
Bevel Edge
Width: 0.15
Segments: 3

[Cancel] [Apply] [Apply and Continue]
```

## 11.3 Shared operation transaction

Geometry and Mesh should use one preview/commit contract.

```ts
interface OperationTransaction {
  id: string;
  workspace: "geometry" | "mesh" | "analysis";

  operationType: string;
  targetEntityIds: string[];
  targetComponentIds?: string[];

  parameters: Record<string, unknown>;

  previewState: "none" | "building" | "ready" | "invalid";
  validationMessages?: string[];
}
```

Suggested API:

```ts
beginOperation();
updateOperationPreview();
validateOperation();
commitOperation();
cancelOperation();
```

This should be reused by:

- geometry Boolean operations;
- offsets;
- transformations;
- mesh bevel;
- split;
- extrude;
- subdivision;
- remeshing;
- analysis generation.

---

# 12. Shared History

Geometry and Mesh need one history timeline.

Example:

```text
1. Create Tower B
2. Change tower radius
3. Generate editable mesh
4. Select edge loop
5. Bevel edges
6. Move vertex
7. Compute bounding box
```

Suggested operation record:

```ts
interface SceneOperation {
  id: string;
  timestamp: number;

  workspace: "geometry" | "mesh" | "analysis";

  operationType: string;
  objectIds: string[];

  inputRepresentationIds?: string[];
  outputRepresentationIds?: string[];

  inputComponentIds?: string[];
  outputComponentIds?: string[];

  parameters: Record<string, unknown>;

  reversible: boolean;
  componentRemap?: ComponentRemap[];
}
```

History requirements:

- one Undo/Redo stack;
- cross-workbench Undo/Redo;
- operation preview before restore;
- source/result navigation;
- restore-before-operation;
- operation parameter inspection;
- affected-object highlighting;
- representation revision tracking.

---

# 13. Geometry-to-Mesh Handoff

Required commands:

```text
Edit Definition
Edit Geometry
Generate Mesh
Edit Mesh
Update Mesh
Detach Mesh
Return to Source
Restore Linked Mesh
```

## 13.1 Generate Mesh

The user should be able to choose:

```text
Purpose:
● Viewport mesh
○ Editable mesh
○ Analysis mesh
○ Export mesh

Quality:
○ Draft
● Standard
○ High
○ Custom

Preserve:
☑ Face groups
☑ Sharp edges
☑ Material groups
☑ Source component mapping
```

## 13.2 Edit Mesh

Opening Mesh should preserve:

- selected object;
- selected face/edge/vertex;
- camera;
- clipping;
- visibility;
- isolation;
- helper visibility;
- active transform mode.

## 13.3 Return to Geometry

The user should be able to return to:

- the source geometry definition;
- a generated derived Geometry object;
- an extracted curve, point, plane, or surface;
- the original pre-mesh state.

---

# 14. Mesh-to-Geometry Handoff

Mesh operations may generate semantic Geometry objects.

Examples:

```text
Selected vertex
→ Geometry point

Selected edge
→ Geometry segment or curve

Selected edge loop
→ Geometry polyline

Selected planar face
→ Geometry plane or polygon

Selected face region
→ Geometry surface

Mesh bounds
→ Geometry bounding box

Principal directions
→ Geometry axes

Symmetry detection
→ Geometry symmetry plane
```

The result should preserve lineage:

```text
Mesh face F-125
      ↓
Derived geometry plane P-8
```

The derived result must support:

- Open Mesh Source;
- Return to Result;
- highlight source;
- highlight result;
- restore before;
- regenerate after source change.

---

# 15. Hidden and Occluded Selection

Robust mesh editing requires more than direct front-face picking.

Provide four high-level methods:

```text
Viewport Pick
Visible Components
Pick Through
Selection List
```

## 15.1 Occlusion modes

Replace or expand `Pick through helpers` with:

```text
Occlusion

● Frontmost only
○ Through object
○ X-ray
○ Select from list
```

## 15.2 Component browser

For dense or hidden topology, provide a list:

```text
Faces       1–4674
Edges       1–7489
Vertices    1–2820
```

Filters:

```text
Selected
Hidden
Visible
Boundary
Non-manifold
Facing camera
Back-facing
Inside region
By normal
By connected component
By material
By source face
```

## 15.3 Selection tools

Required selection operations:

- click;
- Shift-add;
- Ctrl-toggle;
- box;
- lasso;
- paint;
- select all;
- invert;
- grow;
- shrink;
- loop;
- ring;
- linked;
- shortest path;
- similar;
- by normal;
- by material;
- by source geometry element.

---

# 16. Selection Sets

Support named selection sets shared between Geometry and Mesh.

Example:

```text
Selection Sets
- Roof edges
- Window faces
- Outer boundary
- Non-manifold vertices
```

Suggested structure:

```ts
interface SelectionSet {
  id: string;
  name: string;
  entityId: string;
  representationId?: string;

  kind: "object" | "face" | "edge" | "vertex";
  componentIds: string[];

  dynamicRule?: SelectionRule;
}
```

Dynamic sets may update automatically:

```text
All boundary edges
All faces with normal Y > 0.9
All non-manifold vertices
All components derived from Geometry face GF-12
```

---

# 17. Status and Feedback

The UI should clearly distinguish:

- hover;
- committed selection;
- active operation;
- preview;
- source;
- result;
- stale representation;
- invalid topology.

Suggested viewport badges:

```text
Hover: Edge E-42
Selected: Edge E-17
Preview: Bevel, width 0.15
Source: Geometry edge GE-8
```

Avoid displaying several repeated messages such as:

```text
Selected object
Whole object selected
Viewport preview selected
Current selection selected
```

Use one authoritative selection summary and one optional transient notification.

---

# 18. Recommended Immediate UI Changes

## 18.1 Top selection toolbar

Current:

```text
Pick:
Geometry Object | Face | Edge | Vertex
```

Recommended:

```text
Pick:
Object | Face | Edge | Vertex
```

Add:

```text
Selection:
Frontmost | X-ray | Through | List
```

## 18.2 Selected object actions

Recommended:

```text
Tower B pyramid
[Parametric] [Modified Mesh]

[Edit Definition]
[Edit Mesh]
[Transform]
[History]
```

## 18.3 Preview actions

Show only while an operation is active:

```text
Bevel Edge preview
[Cancel] [Apply] [Apply and Continue]
```

## 18.4 Inspector details

Recommended object header:

```text
Tower B pyramid

Entity: Solid
Active representation: Editable Mesh
State: Modified linked
Source: Tower B definition
Vertices/Faces: 5 / 6
```

---

# 19. Implementation Sequence

## Commit 1 — Shared terminology and selection

### Scope

- Rename `Geometry Object` to `Object`.
- Introduce shared `SceneSelection`.
- Use the same selection store in Geometry and Mesh.
- Preserve selection between workbenches.
- Preserve hover separately from committed selection.
- Add stable component IDs.
- Add component remapping hooks.

### Acceptance criteria

- Selecting an object in Geometry keeps it selected in Mesh.
- Selecting an edge in Geometry selects the mapped mesh edge or edges.
- Empty-space click clears committed selection consistently.
- Hover never overwrites committed selection.
- Object, face, edge, and vertex readouts use one data model.

---

## Commit 2 — Shared scene entities and representations

### Scope

- Add `SceneEntity`.
- Add `SceneRepresentation`.
- Move Geometry and Mesh references under one entity.
- Add active representation state.
- Add representation badges.
- Add linked, modified-linked, detached, stale, and invalid states.

### Acceptance criteria

- One scene-tree row represents one logical object.
- Geometry and Mesh no longer create duplicate object identities.
- Inspector can show all representations of the selected entity.
- The active representation can be changed without losing object selection.

---

## Commit 3 — Geometry/Mesh handoff

### Scope

Add actions:

```text
Edit Definition
Edit Geometry
Generate Mesh
Edit Mesh
Update Mesh
Detach Mesh
Return to Source
```

Preserve:

- camera;
- selection;
- isolation;
- visibility;
- helper state;
- active component mode.

### Acceptance criteria

- A Geometry object opens in Mesh with the same object selected.
- An edited mesh can return to its Geometry source.
- Detached meshes are clearly marked.
- Stale meshes can be updated or detached.

---

## Commit 4 — Shared operation preview

### Scope

- Replace workspace-specific previews with `OperationTransaction`.
- Add shared begin/update/validate/commit/cancel APIs.
- Separate selection summary from operation summary.
- Add Apply and Apply-and-Continue actions.
- Standardize validation and error messages.

### Acceptance criteria

- Geometry and Mesh operations use the same preview bar.
- Cancel always restores the exact pre-operation state.
- Apply creates one history operation.
- Invalid previews cannot be committed.
- Operation parameters remain inspectable in History.

---

## Commit 5 — Unified history and lineage

### Scope

- One Undo/Redo stack.
- Add `SceneOperation`.
- Add representation revision tracking.
- Add source/result navigation.
- Add restore-before-operation.
- Add affected-object highlighting.
- Add lineage display in Dependencies.

### Acceptance criteria

- Undo works across Geometry and Mesh workbench changes.
- A mesh operation can be inspected from Geometry.
- A derived Geometry result can open its Mesh source.
- History shows object, components, parameters, and output representation.

---

## Commit 6 — Robust component selection

### Scope

- Frontmost selection.
- Through-object selection.
- X-ray selection.
- Selection list.
- Box and lasso.
- Loop and ring.
- Linked selection.
- Grow and shrink.
- Component filters.
- Hidden component support.
- Named selection sets.

### Acceptance criteria

- Hidden faces, edges, and vertices can be selected reliably.
- Dense models can be edited without precise viewport clicking.
- Selection sets survive workbench switching.
- Selection can be filtered by topology and source lineage.

---

## Commit 7 — Modifier stack for linked meshes

### Scope

Represent mesh edits as replayable modifiers.

Example:

```text
Generated Mesh
├─ Subdivide
├─ Bevel
└─ Smooth
```

Required modifier behavior:

- enable/disable;
- reorder where valid;
- edit parameters;
- preview;
- remove;
- report replay failure;
- bake;
- detach.

### Acceptance criteria

- Source Geometry changes regenerate the base mesh.
- Compatible mesh modifiers replay automatically.
- Failed modifiers are clearly identified.
- The user may repair, disable, bake, or detach.

---

## Commit 8 — Mesh-to-Geometry derived objects

### Scope

Generate Geometry objects from mesh components:

- point from vertex;
- line/curve from edge;
- polyline from loop;
- plane from planar face;
- surface from face region;
- bounding box;
- principal axes;
- symmetry plane.

### Acceptance criteria

- Derived objects keep source-component lineage.
- Source and result can be highlighted.
- Regeneration occurs when the source changes.
- Detached results remain possible.

---

# 20. Suggested Data Flow

```text
User selects entity/component
        ↓
Shared Selection Store
        ↓
Geometry toolbar / Mesh toolbar / Inspector
        ↓
Begin shared operation transaction
        ↓
Preview representation
        ↓
Validate
        ↓
Commit scene operation
        ↓
Update entity representations
        ↓
Record lineage and component remap
        ↓
Add shared history entry
```

---

# 21. Suggested Store Separation

Avoid one very large Geometry-specific state store.

Recommended stores:

```text
sceneEntityStore
sceneRepresentationStore
sceneSelectionStore
sceneVisibilityStore
sceneOperationStore
sceneHistoryStore
sceneLineageStore
geometryDefinitionStore
meshTopologyStore
analysisResultStore
```

Geometry and Mesh components should consume the shared stores rather than synchronizing copies afterward.

---

# 22. Error Handling

The system should explicitly handle:

- stale generated mesh;
- missing source geometry;
- failed modifier replay;
- deleted selected component;
- one-to-many component mapping;
- many-to-one component mapping;
- non-manifold result;
- invalid face winding;
- zero-area faces;
- isolated vertices;
- failed tessellation;
- operation preview timeout.

Example:

```text
Bevel replay failed

The source edge GE-8 now maps to four disconnected mesh edges.

[Choose replacement edges]
[Disable bevel]
[Bake current mesh]
[Detach mesh]
```

---

# 23. Performance Requirements

For large meshes:

- hover should be throttled;
- picking should use acceleration structures;
- selection lists should virtualize rows;
- component metadata should load lazily;
- preview generation should support cancellation;
- expensive remesh operations should use workers;
- selection overlays should use GPU buffers;
- topology IDs should avoid full-array cloning;
- history should store deltas or operation parameters where possible.

Suggested thresholds:

```text
Small mesh:       < 50,000 faces
Medium mesh:      50,000–500,000 faces
Large mesh:       > 500,000 faces
```

For large meshes, automatically suggest:

- Fast viewport quality;
- frontmost-only hover;
- simplified preview;
- deferred dependency recomputation.

---

# 24. Testing Plan

## 24.1 Shared identity tests

- Geometry and Mesh refer to the same entity ID.
- Duplicate scene rows are not created.
- Deleting the entity removes all representations safely.
- Detaching creates a new representation state, not an accidental new identity.

## 24.2 Selection tests

- object selection survives workbench switching;
- face selection survives when mapping is one-to-one;
- one-to-many mappings return all mapped components;
- deleted components clear or remap selection;
- hover and committed selection remain independent;
- X-ray selection reaches occluded components.

## 24.3 History tests

- Geometry edit → Mesh edit → Undo twice;
- Mesh bevel → Geometry parameter change → modifier replay;
- failed replay → disable modifier → redo;
- detached mesh remains independent after source edit;
- source/result navigation remains valid after Undo/Redo.

## 24.4 Lineage tests

- mesh vertex → Geometry point;
- mesh edge loop → Geometry curve;
- mesh face → Geometry plane;
- regenerated mesh updates derived objects;
- deleted source marks derived result stale;
- detached result remains stable.

## 24.5 UI tests

- compact viewport widths;
- left panel scroll behavior;
- right Inspector scroll behavior;
- low-height windows;
- full-screen viewport;
- mobile and tablet layouts;
- keyboard-only selection and operation commit.

---

# 25. Keyboard and Workflow Recommendations

Suggested shortcuts:

```text
1  Object mode
2  Face mode
3  Edge mode
4  Vertex mode

Tab        Switch Geometry/Mesh context for selected entity
Enter      Apply operation
Esc        Cancel operation
Shift+A    Apply and continue
H          Hide selection
Shift+H    Isolate selection
Alt+H      Show hidden
Ctrl+I     Invert selection
Ctrl+L     Select linked
```

The exact shortcuts may be adjusted to avoid conflicts, but Geometry and Mesh should use the same selection-mode keys.

---

# 26. Final Target Workflow

Example end-to-end workflow:

```text
1. Create a parametric tower in Geometry.
2. Adjust height and radius.
3. Generate an editable mesh.
4. Open the same object in Mesh.
5. Select a roof edge loop.
6. Bevel the loop.
7. Return to Geometry.
8. Create a plane from a selected mesh face.
9. Compute a bounding box and principal axes.
10. Change the original tower radius.
11. Regenerate the base mesh.
12. Replay the bevel modifier.
13. Recompute the derived plane and analysis objects.
14. Review the entire process in one History timeline.
```

At every step:

- the object identity remains the same;
- the camera remains stable;
- selection is preserved when possible;
- lineage is visible;
- Undo/Redo works across workbenches.

---

# 27. Final Recommendation

Do not fully merge the Geometry and Mesh tabs into one overloaded workspace.

Instead:

- preserve separate specialized workbenches;
- unify their underlying scene model;
- unify object identity;
- unify selection;
- unify the scene tree;
- unify the Inspector;
- unify previews and operation transactions;
- unify history and lineage;
- expose representations explicitly.

The decisive architectural change is:

```text
Before:
Geometry object
Mesh object
Derived result
Separate selection
Separate history

After:
Shared scene entity
├─ Geometry representation
├─ Mesh representation
└─ Analysis representation

Shared selection
Shared Inspector
Shared history
Shared lineage
```

This gives Math3D a clear identity: a mathematical Geometry system and a practical Mesh editor operating on the same structured object graph.
