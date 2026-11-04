# Math3D Workbook Export

_Exported 3.11.2026, 13:05:09_

## Geometry selection and Notes (active)

_Last updated 3.11.2026, 13:05:08_

### 1. Define

#### 1.1 Create a Geometry source

Type: Text

Open Geometry and place a Box. Save a named Project, then add this Workbook to the Project from Projects. The Geometry document and Workbook must both appear in that Project.

#### 1.2 Question

Type: Text

Which faces of the Box are visible from the current view, and how does the answer change after a transform?

### 2. Compute

#### 2.1 Anchor an object and face

Type: Text

Select the Box object, open Notes, choose From selection, write an observation, and Save to Project. Select one Box face and repeat. Attach another Note to this Workbook block with Note on block.

### 3. Visualize

#### 3.1 Geometry view

Type: Visualize

> Capture a view showing the selected Box face. Reopen Notes and use Open target for both selection Notes.

**Snapshot A**

_(No thumbnail)_

**Snapshot B**

_(No thumbnail)_

### 4. Explain / Check

#### 4.1 Verify exact references

Type: Text

Transform the Box: the object-local Note should stay current. Change its shape or topology: the face Note should report stale. Remove the source: both Notes should report detached. Save and reopen the Project to confirm the exact IDs persist.

#### 4.2 SageMath sage.numberTheory.gcd

Type: Text

Input = 84, 30

Operation: sage.numberTheory.gcd

Engine: SageMath 10.10 (Docker)

Source revision: 0

Status: Exact

Result: {"value":"6"}

LaTeX: $6$

Input hash: not reported

#### 4.3 SageMath sage.numberTheory.modInverse

Type: Text

Input = 3 mod 11

Operation: sage.numberTheory.modInverse

Engine: SageMath 10.10 (Docker)

Source revision: 0

Status: Exact

Result: {"value":"4","modulus":"11"}

LaTeX: $4$

Input hash: not reported

#### 4.4 SageMath sage.numberTheory.modInverse

Type: Text

Input = 2 mod 4

Operation: sage.numberTheory.modInverse

Engine: SageMath 10.10 (Docker)

Source revision: 0

Status: Failed

Result: {}

Error: inverse of Mod(2, 4) does not exist

Input hash: not reported

## Mesh topology and Notes

_Last updated 3.11.2026, 13:05:01_

### 1. Define

#### 1.1 Create a Mesh source

Type: Text

Open a Mesh with visible faces, save a named Project, then add this Workbook from Projects. Record the Mesh object and face you will inspect.

### 2. Compute

#### 2.1 Anchor Mesh evidence

Type: Text

Select the Mesh object and a numbered face in turn. For each selection create a Note with From selection and Save to Project. If you have a saved Mesh analysis result, choose its exact ID with Note on result.

### 3. Visualize

#### 3.1 Mesh evidence

Type: Visualize

> Capture the selected Mesh face. Add a Note on this Workbook block, then reopen it with Open target.

**Snapshot A**

_(No thumbnail)_

**Snapshot B**

_(No thumbnail)_

### 4. Explain / Check

#### 4.1 Check topology changes

Type: Text

Reopen the Project and confirm Notes are current. Change Mesh topology and refresh Notes: the face Note should become stale. If the exact result is deleted, its Note should report detached.

## Surface investigation and Notes

_Last updated 3.11.2026, 13:05:01_

### 1. Define

#### 1.1 Define a Surface

Type: Text

Choose a Surface such as a catenoid or sphere. Save it in a named Project and add this Workbook from Projects. Record the equation and domain here.

#### 1.2 Surface equation

Type: Formula

$$

σ(u,v) = (x(u,v), y(u,v), z(u,v))

$$

### 2. Compute

#### 2.1 Curvature field

Type: Compute

Operator: surface.curvature

#### 2.2 Save evidence

Type: Text

Save the curvature result to the Project. Open Notes, choose that result ID, and write an interpretation. Add a Note on this Workbook block to record the computation settings.

### 3. Visualize

#### 3.1 Curvature view

Type: Visualize

> Capture the color-mapped Surface. Reopen the result and Workbook Notes from the Project Notes sidebar.

**Snapshot A**

_(No thumbnail)_

**Snapshot B**

_(No thumbnail)_

### 4. Explain / Check

#### 4.1 Check provenance

Type: Text

Change the Surface definition and refresh Notes: the result reference should report stale or detached until a matching saved result exists. Edit this Workbook block and save it to the Project: the block Note should report stale.

## Compute curvature

_Last updated 3.11.2026, 13:05:01_

### 1. Define

#### 1.1 Goal

Type: Text

Compute curvature invariants and explain where curvature is high or changes sign.

#### 1.2 Surface definition

Type: Formula

$$

z = f(x,y) or σ(u,v) = (x,y,z)

$$

### 2. Compute

#### 2.1 Curvature field

Type: Compute

Operator: surface.curvature

### 3. Visualize

#### 3.1 Curvature snapshot

Type: Visualize

> Capture A/B with different domains or resolutions.

**Snapshot A**

_(No thumbnail)_

**Snapshot B**

_(No thumbnail)_

### 4. Explain / Check

#### 4.1 Interpretation

Type: Text

Describe where curvature concentrates and how it matches intuition.

## Geodesics from point

_Last updated 3.11.2026, 13:05:01_

### 1. Define

#### 1.1 Goal

Type: Text

Compare heat‑method and shortest‑path geodesics between two points.

### 2. Compute

#### 2.1 Pick start point

Type: Interact

Interaction: pick_point

#### 2.2 Pick end point

Type: Interact

Interaction: pick_point

#### 2.3 Geodesic heat

Type: Compute

Operator: surface.geodesicDistance

#### 2.4 Geodesic path

Type: Compute

Operator: geodesic_path

### 3. Visualize

#### 3.1 Geodesic snapshots

Type: Visualize

**Snapshot A**

_(No thumbnail)_

**Snapshot B**

_(No thumbnail)_

### 4. Explain / Check

#### 4.1 Observations

Type: Text

Compare the two geodesics and note any discrepancies or mesh artifacts.

## Chart + basis

_Last updated 3.11.2026, 13:05:01_

### 1. Define

#### 1.1 Goal

Type: Text

Inspect chart grids and tangent directions on the surface.

### 2. Compute

#### 2.1 Chart grid + basis

Type: Compute

Operator: chart_grid

### 3. Visualize

#### 3.1 Chart grid snapshot

Type: Visualize

**Snapshot A**

_(No thumbnail)_

**Snapshot B**

_(No thumbnail)_

### 4. Explain / Check

#### 4.1 Notes

Type: Text

Describe how the chart grid aligns with principal directions or symmetry.

## Selection + stats

_Last updated 3.11.2026, 13:05:01_

### 1. Define

#### 1.1 Goal

Type: Text

Select a meaningful region and summarize its curvature statistics.

### 2. Compute

#### 2.1 Select region

Type: Interact

Interaction: select_region

#### 2.2 Selection overlay

Type: Compute

Operator: selection_overlay

#### 2.3 Curvature field

Type: Compute

Operator: surface.curvature

### 3. Visualize

#### 3.1 Selection snapshot

Type: Visualize

**Snapshot A**

_(No thumbnail)_

**Snapshot B**

_(No thumbnail)_

### 4. Explain / Check

#### 4.1 Stats summary

Type: Text

Record count, mean curvature, and any anomalies.

## Principal directions

_Last updated 3.11.2026, 13:05:01_

### 1. Define

#### 1.1 Goal

Type: Text

Visualize principal directions and relate them to curvature.

### 2. Compute

#### 2.1 Curvature field

Type: Compute

Operator: surface.curvature

#### 2.2 Principal directions

Type: Compute

Operator: principal_dirs

### 3. Visualize

#### 3.1 Principal direction snapshot

Type: Visualize

**Snapshot A**

_(No thumbnail)_

**Snapshot B**

_(No thumbnail)_

### 4. Explain / Check

#### 4.1 Interpretation

Type: Text

Explain alignment and direction changes across the surface.

## Task: Build A Rectangular Box With Volume 2

_Last updated 3.11.2026, 13:05:01_

### 1. Define

#### 1.1 Task

Type: Text

Create a rectangular box and tune dimensions to hit volume 2 while preserving clean box topology.

Starting scene: Start with a single default box object at world origin.

Expected result: A box-like mesh with volume close to 2 and classic box topology.

### 2. Compute

#### 2.1 Allowed tools + hints

Type: Text

Allowed tools:
- Create > Box
- Transform > Scale
- Object > Convert to Mesh object

Hints:
- Use unit box first, then adjust one axis at a time.
- Keep object axis-aligned for easier measurement.

### 3. Visualize

#### 3.1 Solution view

Type: Visualize

> Capture your final task solution view.

**Snapshot A**

_(No thumbnail)_

**Snapshot B**

_(No thumbnail)_

### 4. Explain / Check

#### 4.1 Validation checks

Type: Assert

Expected: - Volume between 1.95 and 2.05
- Object has 8 vertices
- Object has 12 triangular faces
- Width greater than height

Status: pending

#### 4.2 Measurements to report

Type: Text

- Volume
- Vertex count
- Face count
- Width vs height

## Task: Extrude One Face And Compare Volume

_Last updated 3.11.2026, 13:05:01_

### 1. Define

#### 1.1 Task

Type: Text

Duplicate your base object, extrude one face on the working object, and verify volume increased.

Starting scene: Create a base box, duplicate it. Keep one copy unchanged as comparison.

Expected result: Primary object has larger volume than comparison object after extrusion.

### 2. Compute

#### 2.1 Allowed tools + hints

Type: Text

Allowed tools:
- Duplicate object
- Mesh edit > Extrude face
- Compare panel A/B

Hints:
- Set selected object to extruded result.
- Assign original object as comparison target.

### 3. Visualize

#### 3.1 Solution view

Type: Visualize

> Capture your final task solution view.

**Snapshot A**

_(No thumbnail)_

**Snapshot B**

_(No thumbnail)_

### 4. Explain / Check

#### 4.1 Validation checks

Type: Assert

Expected: - Extruded object volume is greater than original
- Extruded object has at least as many faces as original

Status: pending

#### 4.2 Measurements to report

Type: Text

- Volume before/after
- Face count after extrusion

## Task: Equal Volume, Different Surface Area

_Last updated 3.11.2026, 13:05:01_

### 1. Define

#### 1.1 Task

Type: Text

Build two objects with nearly equal volume but visibly different surface area.

Starting scene: Create two independent mesh objects and set one as comparison object.

Expected result: Volumes match within tolerance while surface areas differ.

### 2. Compute

#### 2.1 Allowed tools + hints

Type: Text

Allowed tools:
- Create primitives
- Transform
- Compare panel A/B

Hints:
- A cube and a stretched box can help.
- Tune one dimension while compensating another to keep volume.

### 3. Visualize

#### 3.1 Solution view

Type: Visualize

> Capture your final task solution view.

**Snapshot A**

_(No thumbnail)_

**Snapshot B**

_(No thumbnail)_

### 4. Explain / Check

#### 4.1 Validation checks

Type: Assert

Expected: - Volumes match within ±0.05
- Surface areas differ by more than 0.1

Status: pending

#### 4.2 Measurements to report

Type: Text

- Volume difference
- Surface area difference

## Task: Slice A Cone And Identify Section Curve

_Last updated 3.11.2026, 13:05:01_

### 1. Define

#### 1.1 Task

Type: Text

Create a cone, slice with a section plane, and promote the section curve object.

Starting scene: Start with one cone object and enable section plane tools.

Expected result: A section-curve mesh object is created with non-zero curve geometry.

### 2. Compute

#### 2.1 Allowed tools + hints

Type: Text

Allowed tools:
- Create > Cone
- Section plane
- Promote section to curve object

Hints:
- Tilt/offset section plane away from apex.
- Promoted curve object should have measurable geometry.

### 3. Visualize

#### 3.1 Solution view

Type: Visualize

> Capture your final task solution view.

**Snapshot A**

_(No thumbnail)_

**Snapshot B**

_(No thumbnail)_

### 4. Explain / Check

#### 4.1 Validation checks

Type: Assert

Expected: - Section curve object has at least 1 face
- Section curve object has at least 3 vertices

Status: pending

#### 4.2 Measurements to report

Type: Text

- Section object face count
- Section object dimensions

## Task: Bevel An Edge And Observe Topology Changes

_Last updated 3.11.2026, 13:05:01_

### 1. Define

#### 1.1 Task

Type: Text

Duplicate object, bevel one edge on the working copy, and compare topology with original.

Starting scene: Create a box, duplicate it, keep original as comparison.

Expected result: Beveled object has increased vertex/face counts compared to original.

### 2. Compute

#### 2.1 Allowed tools + hints

Type: Text

Allowed tools:
- Duplicate object
- Mesh edit > Bevel edge
- Compare panel A/B

Hints:
- Use a clearly visible bevel amount.
- Validate with selected object as beveled copy.

### 3. Visualize

#### 3.1 Solution view

Type: Visualize

> Capture your final task solution view.

**Snapshot A**

_(No thumbnail)_

**Snapshot B**

_(No thumbnail)_

### 4. Explain / Check

#### 4.1 Validation checks

Type: Assert

Expected: - Beveled object has more vertices
- Beveled object has more faces

Status: pending

#### 4.2 Measurements to report

Type: Text

- Vertex count delta
- Face count delta

## Linked-source manifest

Publication records selected blocks, exact citations and freshness at export. Stale and unavailable evidence remains qualified. Numerical support checks only the declared scalar interval; it is not proof of arbitrary prose. A captured availability label alone does not establish portability. The Project package includes its saved Workbooks and current/replay source resources.







```json
{
  "schemaVersion": 1,
  "projectId": null,
  "projectHash": null,
  "parameters": [
    {
      "workbookId": "39a8b05f-1b5b-4b34-b137-fdf9058d25b8",
      "namedParameters": []
    },
    {
      "workbookId": "e3a33ef5-e483-416d-9684-e223f33908a7",
      "namedParameters": []
    },
    {
      "workbookId": "8e439645-683f-4ed8-90bd-47dc40e29ce1",
      "namedParameters": []
    },
    {
      "workbookId": "26e4d162-06a2-46ff-9cd2-78539e609840",
      "namedParameters": []
    },
    {
      "workbookId": "c258762a-6cb7-4416-ba95-458b8d0cbc34",
      "namedParameters": []
    },
    {
      "workbookId": "c397c4c1-0452-4c38-9f5c-9971611f7cdf",
      "namedParameters": []
    },
    {
      "workbookId": "32240bbf-cba3-4aff-9397-eb851e220b5a",
      "namedParameters": []
    },
    {
      "workbookId": "67cf4068-2eba-4499-8a86-6b53c647c790",
      "namedParameters": []
    },
    {
      "workbookId": "2279bbf2-3eb2-43e4-873b-a927f637de16",
      "namedParameters": []
    },
    {
      "workbookId": "e2c27fe8-2f02-449b-957c-10725e7b93b3",
      "namedParameters": []
    },
    {
      "workbookId": "5f3e2ed6-b06e-451c-b2a9-2d278c0cd506",
      "namedParameters": []
    },
    {
      "workbookId": "47c21b3c-4d21-4930-8157-4dc74eb184d2",
      "namedParameters": []
    },
    {
      "workbookId": "c18b850d-b567-4b0e-994c-aa6bd138d26a",
      "namedParameters": []
    }
  ],
  "qualification": "Publication records selected blocks, exact citations and freshness at export. Stale and unavailable evidence remains qualified. Numerical support checks only the declared scalar interval; it is not proof of arbitrary prose. A captured availability label alone does not establish portability. The Project package includes its saved Workbooks and current/replay source resources.",
  "blocks": [
    {
      "workbookId": "39a8b05f-1b5b-4b34-b137-fdf9058d25b8",
      "blockId": "e9641e5e-eabd-4e20-bbfc-cc684c624492",
      "title": "Create a Geometry source",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:1bd5e967c555c1462b15a387da3b7c9d3a20d51b5ae9778019540fc224b73eee",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "39a8b05f-1b5b-4b34-b137-fdf9058d25b8",
      "blockId": "ece5ec41-114b-4b0e-9c33-2981515b9487",
      "title": "Question",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:642a39b83baec6563e31d059055be3e2febfbf83718b8ded939d1f0c63f91b9a",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "39a8b05f-1b5b-4b34-b137-fdf9058d25b8",
      "blockId": "e096d692-13de-412d-b21b-bf16a72bfb9f",
      "title": "Anchor an object and face",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:0f206dc11c6c8e7313c70672db7ba316598490627f040a88382304e0030e4177",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "39a8b05f-1b5b-4b34-b137-fdf9058d25b8",
      "blockId": "96d8eae8-a6c5-4747-989a-e079453e8cbd",
      "title": "Geometry view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:4493d83f8f64fa8df85257078e8348b2013f8ae1c24c1c9ef2214beaac340828",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "39a8b05f-1b5b-4b34-b137-fdf9058d25b8",
      "blockId": "c72e7e52-525f-4045-bec4-49a125e22aa6",
      "title": "Verify exact references",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:d0f5f0adc5c7a2457a8a2d55099416fe87f6d4e699a9ee274621711eff9da6e4",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "39a8b05f-1b5b-4b34-b137-fdf9058d25b8",
      "blockId": "bc61c903-5d2d-4e0c-b091-253a15391323",
      "title": "SageMath sage.numberTheory.gcd",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:053449f9cb4b976752b894eca24b215a9c49516458ec8d3d78b8e7bf6845f640",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "39a8b05f-1b5b-4b34-b137-fdf9058d25b8",
      "blockId": "2d424f25-2bf4-4776-9e06-8fe90d6ba9a8",
      "title": "SageMath sage.numberTheory.modInverse",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:764ef628ebe77da7cea95bf519142cd9c5ef9cff7a4ca623a2c5ff7eb914c55d",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "39a8b05f-1b5b-4b34-b137-fdf9058d25b8",
      "blockId": "be984956-3872-471b-962c-cca0a3c5105f",
      "title": "SageMath sage.numberTheory.modInverse",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:c02a83cf52f03b13c521d64265a07d0f02d6644263f617e6c485d438863c5e7d",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "e3a33ef5-e483-416d-9684-e223f33908a7",
      "blockId": "752ee76b-a37e-4572-810f-9e61f2c7861a",
      "title": "Create a Mesh source",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:48e9c18ba06333ace1bffe928e07a11dc0c5f92b1a9c187cb539a6038cc744ec",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "e3a33ef5-e483-416d-9684-e223f33908a7",
      "blockId": "9d7885e8-cd08-4da9-a5eb-72816c666752",
      "title": "Anchor Mesh evidence",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:3f5328d9897d754b8c056ddfd32dd16fb2503cdbf211206dcd5a9bc4e544f25d",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "e3a33ef5-e483-416d-9684-e223f33908a7",
      "blockId": "38dc22e6-1613-4663-9bac-d5dd33576e47",
      "title": "Mesh evidence",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:64df5982bea85b3660d0c415453e2bb4694340dbb2d8d7384992fec6665658c4",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "e3a33ef5-e483-416d-9684-e223f33908a7",
      "blockId": "cd9a967f-77f3-47a3-aa7a-fdc597e6adbd",
      "title": "Check topology changes",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:77d43609a1d2a6ad4d6ee47e5f1947afd2497fb6844fb12ff1e23b4858784c4c",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "8e439645-683f-4ed8-90bd-47dc40e29ce1",
      "blockId": "b92c10aa-eb0e-4aed-a62f-ff6677ed8df2",
      "title": "Define a Surface",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:306d973c1d0be53fb1b5d902d43df90c4389d9974e30bd4c771a3fe8ef703263",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "8e439645-683f-4ed8-90bd-47dc40e29ce1",
      "blockId": "77326796-d446-4015-8b26-0bcde466c431",
      "title": "Surface equation",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:41e043e3bbbf46d1d7f91934cf925e370a4bedfcae513bc25732785b5e1c9bc3",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "8e439645-683f-4ed8-90bd-47dc40e29ce1",
      "blockId": "d586a7e9-4491-449a-a363-4354e4afabe0",
      "title": "Curvature field",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:e981274ac97e64df70162e744c74c44ca05c5eab952a763029c85618ee0279b8",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "8e439645-683f-4ed8-90bd-47dc40e29ce1",
      "blockId": "1a401057-0ef3-4706-a43e-92aa0026a912",
      "title": "Save evidence",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:b43718a010f9b0d71e3dd2679f20306a4ceef84b5c90d5d188dfd2c9bee5277e",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "8e439645-683f-4ed8-90bd-47dc40e29ce1",
      "blockId": "deeab82b-fd60-4c38-9b92-01c51e633257",
      "title": "Curvature view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:e25a9b4b90ca6c5fd98837e7dd296d13d4ac24d2e4320b9cb3f1507f82403b03",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "8e439645-683f-4ed8-90bd-47dc40e29ce1",
      "blockId": "08bdc471-4a95-4425-8c9b-8d95909e3b77",
      "title": "Check provenance",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:70919b1838a81608f5e3213a667e6f8334aade85415b267e9aac981ded4a3f24",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "26e4d162-06a2-46ff-9cd2-78539e609840",
      "blockId": "ee800b5f-626b-49c0-a3a0-5b947a64ad38",
      "title": "Goal",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:b44f4a7677341f38af8f0f3940322e108e541fe5b0a8ddd42c68ebae001b3bd6",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "26e4d162-06a2-46ff-9cd2-78539e609840",
      "blockId": "9a22aac4-9a22-485d-b2cd-5b9e082a820a",
      "title": "Surface definition",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:189cf1d383278e8beca9a07a92583f2f75caf8d268820151e577dbea7c228354",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "26e4d162-06a2-46ff-9cd2-78539e609840",
      "blockId": "e5fdf9ff-2cdb-4fe4-a875-7f60c814b78a",
      "title": "Curvature field",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:f16838488b99152c72d28fdc5b53a7718af6ecd02e8d4825c27a0a43e89a991f",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "26e4d162-06a2-46ff-9cd2-78539e609840",
      "blockId": "65e33e86-fa7d-4f39-bef5-1ec51be92d18",
      "title": "Curvature snapshot",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:070c5755fa79bd5ae0d7cd843fdff7d8f855f840e33097505843f960d0a0572d",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "26e4d162-06a2-46ff-9cd2-78539e609840",
      "blockId": "478aa52d-dc98-4b76-b428-7919605cab3b",
      "title": "Interpretation",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:ec99b34d521fed8dc8f002821b147d0d845122d8ab6e2884c6e39c53252dcf01",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c258762a-6cb7-4416-ba95-458b8d0cbc34",
      "blockId": "f49e75f3-1ff4-493f-88c4-5586dcb75fd9",
      "title": "Goal",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:d42a9b8e20c01a25591575f06cae9d190a32f9e1279b8f58aeb7702212c86391",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c258762a-6cb7-4416-ba95-458b8d0cbc34",
      "blockId": "3e8279bd-6ea1-48e9-8754-e61e70809b6d",
      "title": "Pick start point",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:92f2c377c2270de324079ee2d0ce2ea8daaa531dedd9047abd8a79ee3feb3eae",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c258762a-6cb7-4416-ba95-458b8d0cbc34",
      "blockId": "031e2f67-c902-4089-95b9-15b87e0f15ea",
      "title": "Pick end point",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:4b72aad6fd41cf282a76871de00869fada41c856befecf649f260e897fe47c52",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c258762a-6cb7-4416-ba95-458b8d0cbc34",
      "blockId": "e2ac63da-6300-4ff6-b6fe-b6261e16d774",
      "title": "Geodesic heat",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:8b8eda30545916d589881871a51b02862107e1ee351a49f47fe6550203c5e740",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c258762a-6cb7-4416-ba95-458b8d0cbc34",
      "blockId": "d50686a1-7379-4cee-8f5c-1228fcf04baa",
      "title": "Geodesic path",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:fcd33518ec20d7d69b6cb5dd39965d51595345134202230ed753fce3eb3e807a",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c258762a-6cb7-4416-ba95-458b8d0cbc34",
      "blockId": "5a4791a6-9eee-4629-8d23-5f2bcc81cce3",
      "title": "Geodesic snapshots",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:bf20ea1a018d455f2e4e6fad9a521a646c8f230e4e80a4175410783f69b9bfd8",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c258762a-6cb7-4416-ba95-458b8d0cbc34",
      "blockId": "000b7f2a-8a36-4620-9bb2-d3b7b3054004",
      "title": "Observations",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:9650ac9617e64d93e65108a2aeeecf5b9ae4c9b4f93990eee44f9ee0b47ac422",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c397c4c1-0452-4c38-9f5c-9971611f7cdf",
      "blockId": "f11c0e02-781b-460d-9898-826cdbe41511",
      "title": "Goal",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:2f27bbd3764d1fecd7921aee9057cdc95d71a56682db928e1b19195166e5fadc",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c397c4c1-0452-4c38-9f5c-9971611f7cdf",
      "blockId": "c9e80038-09a0-49c7-b5c3-991df468113e",
      "title": "Chart grid + basis",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:5cb259ba6b16878c395db975779182f241282944693001a2132e1b15b4529e22",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c397c4c1-0452-4c38-9f5c-9971611f7cdf",
      "blockId": "2ca1f548-036f-4f26-ab6d-00bac2715fb0",
      "title": "Chart grid snapshot",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:349b22967eec227c55627ed49aa083abd7e912ea449bf593f05d22b84eacca27",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c397c4c1-0452-4c38-9f5c-9971611f7cdf",
      "blockId": "d8614936-b8e6-4387-854d-d25d1a13f8b2",
      "title": "Notes",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:68be593242d8cf61cf3418c87004217bed00d9f54ef9b0bbb0664ce5e85307a2",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "32240bbf-cba3-4aff-9397-eb851e220b5a",
      "blockId": "8ab3e580-ffa2-41d7-b06a-a2408dcd3542",
      "title": "Goal",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:3ae93fb46c48c25fd1efa0dac38185c8e430a8bf5dbf0624db58ca7d0cd10101",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "32240bbf-cba3-4aff-9397-eb851e220b5a",
      "blockId": "3503bc2b-e1f2-40aa-93af-584d5b3c9703",
      "title": "Select region",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:0734809650ed9c118ef1e1fd07ca238db507b9661ec69738486e2c424e6e79a9",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "32240bbf-cba3-4aff-9397-eb851e220b5a",
      "blockId": "ff7a356e-c230-4f3d-90b2-4184fa605178",
      "title": "Selection overlay",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:741fa666dd7c4bdf0522f074c97bf71b4382bd99083d0bbdff796d1a1a78ed1f",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "32240bbf-cba3-4aff-9397-eb851e220b5a",
      "blockId": "325a4a37-6af0-4e18-98ad-5681edab4944",
      "title": "Curvature field",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:af6dac76458f3e3811083320698cc9c116d8f254865cd7a1e574b9a168418666",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "32240bbf-cba3-4aff-9397-eb851e220b5a",
      "blockId": "2f261ba9-aaa8-4bc9-b004-013383cedf69",
      "title": "Selection snapshot",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:b7fd3c630c80dcae78e177fbfe681332f3345e13d3629563e64bc08617ceb062",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "32240bbf-cba3-4aff-9397-eb851e220b5a",
      "blockId": "528d3ee9-c99a-46f2-b083-186a3bb0fca5",
      "title": "Stats summary",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:266da14e6482cffb8064aa7e1a038f7c16486d5a2fbc2fe6abb2b3115376930e",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "67cf4068-2eba-4499-8a86-6b53c647c790",
      "blockId": "e09404cc-2e0d-4a9f-aae0-c3997affbb59",
      "title": "Goal",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:ab75ce51c846c0b49473edb02377a9ead92ad8443b51bdfadceb4be747c3a4e7",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "67cf4068-2eba-4499-8a86-6b53c647c790",
      "blockId": "3804859d-327d-47f7-b859-f9c796432732",
      "title": "Curvature field",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:3c5a91464120f9b1eb841a2e9e13dd50512df2e7a41cc6ce193473ccc64298ec",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "67cf4068-2eba-4499-8a86-6b53c647c790",
      "blockId": "69d68e7d-5b8b-40be-81a4-416d800d90f6",
      "title": "Principal directions",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:b688ddc626a77062d82d66e3de4b91d831c598355f4a08fe936d4c6559125220",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "67cf4068-2eba-4499-8a86-6b53c647c790",
      "blockId": "62a66124-cf1d-4636-937d-34ac8a9d7f55",
      "title": "Principal direction snapshot",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:894a2c08dccc2a405d11ad8cd8f21c2690ac6d0df2908e22eb3d69263568c91e",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "67cf4068-2eba-4499-8a86-6b53c647c790",
      "blockId": "0d66b69f-9908-4cd4-b3be-74203ab219d2",
      "title": "Interpretation",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:774be23f2a4d2ba7d473d3c6a47d15cb7f96c669959c450e62efe0d5d7cefaf5",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "2279bbf2-3eb2-43e4-873b-a927f637de16",
      "blockId": "b990ac44-045b-4ee6-ab8e-af5eb30df215",
      "title": "Task",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:84c063f496bf1e301498f30802410515bfeee193994959b927aad89831e71584",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "2279bbf2-3eb2-43e4-873b-a927f637de16",
      "blockId": "344a9e26-65e4-4274-973b-162eff97fdf4",
      "title": "Allowed tools + hints",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:17bcfbca4d811dabfc31d15e8a5240db91058d499c88b582297e6adec55d85ba",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "2279bbf2-3eb2-43e4-873b-a927f637de16",
      "blockId": "1fd68008-f2f0-41d9-88fb-f6a9739580d2",
      "title": "Solution view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:ada82c31fbf2fcd310f05de01c75a44dc57c3634ca638061ad901a23e1c2125b",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "2279bbf2-3eb2-43e4-873b-a927f637de16",
      "blockId": "ada16d08-3ac8-4542-80d3-a72686d378b9",
      "title": "Validation checks",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:c6413862e61d7712c8ba498558acbe98ee36273ea69b04221be3f5dc0c9bb1c8",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "2279bbf2-3eb2-43e4-873b-a927f637de16",
      "blockId": "c823808a-a28d-48e1-a451-0208cb1c5018",
      "title": "Measurements to report",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:49d81512aac597fc636dfc466e0111f4841e4a71ff91f3a7713667898bcf0028",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "e2c27fe8-2f02-449b-957c-10725e7b93b3",
      "blockId": "532b5207-c63a-41e2-85d9-a19afa2264d1",
      "title": "Task",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:c3866941ffb045084c79c52e51caaf10cfd2c34a4b04e8dc86e98e64f4c4057e",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "e2c27fe8-2f02-449b-957c-10725e7b93b3",
      "blockId": "122134aa-6b1b-4e7d-9084-5e9abe0ff6fa",
      "title": "Allowed tools + hints",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:2d3052cb6f5cf8d6f2a070f5f729f48cd3235cd5bf8a1925bf960a48faf39863",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "e2c27fe8-2f02-449b-957c-10725e7b93b3",
      "blockId": "ee1f717c-70dd-41c6-bf2e-df5a963efd9d",
      "title": "Solution view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:9aa8457c88b68d12575373d6aa9e4034f4ab2e84496db90d728ec8525c48a99d",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "e2c27fe8-2f02-449b-957c-10725e7b93b3",
      "blockId": "f0766105-081f-44fe-9324-78bd46d7456e",
      "title": "Validation checks",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:482d1324ee5c029b22e6a1080621c0d2d92f099725021f6687fe9c50faf1511f",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "e2c27fe8-2f02-449b-957c-10725e7b93b3",
      "blockId": "c6c9e65d-0045-46f2-afdf-99b17f12b5f8",
      "title": "Measurements to report",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:5b1a8f5d4b39b96c7998cf1fb5d9d06bc274f08b544c3af9fdbaf3305abeeb14",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "5f3e2ed6-b06e-451c-b2a9-2d278c0cd506",
      "blockId": "0668517f-1c7a-4fd9-b892-82899bdcca36",
      "title": "Task",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:09ccb16733b94d96238808c459fc820f119be74a288b3905a70c523f23674f5d",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "5f3e2ed6-b06e-451c-b2a9-2d278c0cd506",
      "blockId": "96608aa7-d767-4b18-b337-2ff7fa23650e",
      "title": "Allowed tools + hints",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:3d86f13961059fc4a5a9187cb1056da4868af179988d744037b15c688fa5710b",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "5f3e2ed6-b06e-451c-b2a9-2d278c0cd506",
      "blockId": "4399fdf0-e0bd-419d-940f-1218870e506d",
      "title": "Solution view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:2d48e3d45f139bc70d2aa83f5d209c41535ffb4f23c7adeb4804c3c03596a81e",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "5f3e2ed6-b06e-451c-b2a9-2d278c0cd506",
      "blockId": "07997c80-4986-4580-9ef5-fa5f3b95bbec",
      "title": "Validation checks",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:1c5b4de9f9e736b44494a89f15088d3e873504d474339e4539d17cb9033819cb",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "5f3e2ed6-b06e-451c-b2a9-2d278c0cd506",
      "blockId": "888cd2ce-c978-4c78-92e7-3b6c6df1b8e1",
      "title": "Measurements to report",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:602256306950b565ebbbeae113a6f445b635370303b194a277a03c17ac60cea0",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "47c21b3c-4d21-4930-8157-4dc74eb184d2",
      "blockId": "4a134613-c1d0-4c48-aa5d-3d80d908e3a8",
      "title": "Task",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:72028cbcb5b9e8de1979bea2f9cf579dc82b59a770fb1259da1260190df04ce4",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "47c21b3c-4d21-4930-8157-4dc74eb184d2",
      "blockId": "7cc6660e-179a-4273-bd77-73ea3f58e7fa",
      "title": "Allowed tools + hints",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:0684a9f68fd2a8a79debfa2fb63b67e367ca77f456c4921c96b5a4eeb81ead84",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "47c21b3c-4d21-4930-8157-4dc74eb184d2",
      "blockId": "4b06f19b-a2fd-43d5-b585-df9572a3a962",
      "title": "Solution view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:9d3b3a65cf4f16eea215602903cd404e2285bf2cb5b8262aeb85ff6c56872e22",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "47c21b3c-4d21-4930-8157-4dc74eb184d2",
      "blockId": "d2e40a1a-d891-4b7c-a4ef-12dfb9af6a35",
      "title": "Validation checks",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:f8e15a672140780e5942b1a8fc76909314830c8dddf1afad0b15c1cb9c7720d3",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "47c21b3c-4d21-4930-8157-4dc74eb184d2",
      "blockId": "5fb55303-d21b-4123-bb1d-9fb70ba92ab1",
      "title": "Measurements to report",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:de2eacd88acfe73b803fad6399aa723bcf481bd7a508c9b6759e468ca0bf331f",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c18b850d-b567-4b0e-994c-aa6bd138d26a",
      "blockId": "fb625e03-2c70-47d2-acb4-a15782afc027",
      "title": "Task",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:caed4c8bfcceb38a74dec75f80c2d98e6383d1eca0cba28c77b2be233010b8ea",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c18b850d-b567-4b0e-994c-aa6bd138d26a",
      "blockId": "72ad6b80-5eed-431b-ad64-c98cc79b8e8e",
      "title": "Allowed tools + hints",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:281bb0e5e6187f970db70ceb1a04a57b3440a14e8c32124423e8a5d3912bb6ac",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c18b850d-b567-4b0e-994c-aa6bd138d26a",
      "blockId": "9ee7005b-86d6-4f85-bb6d-29439228a0f6",
      "title": "Solution view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:8383bfa2788d047549be372a7a70df45bd0b7367a4024bf3b05b3d7ab7fe8cb4",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c18b850d-b567-4b0e-994c-aa6bd138d26a",
      "blockId": "ee7aaea7-8d48-42ce-b053-4d98dc93c9fd",
      "title": "Validation checks",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:4bf9d15608ff52c2ad60b61a3db5215a70a4a0dcf86c90c27b5247d6efa8161b",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    },
    {
      "workbookId": "c18b850d-b567-4b0e-994c-aa6bd138d26a",
      "blockId": "61d99f00-d100-48a9-9c44-a584387638f2",
      "title": "Measurements to report",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:3708fc61be1d6bb36d0a86aabf3a4e5a8e0e2d55b03c659504a200d4ea34b85f",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null,
      "savedMeshComparison": null
    }
  ],
  "citations": []
}
```