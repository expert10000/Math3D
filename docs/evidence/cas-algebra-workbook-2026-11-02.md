# Math3D Workbook Export

_Exported 2.11.2026, 13:58:15_

## Geometry selection and Notes (active)

_Last updated 2.11.2026, 13:58:15_

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

#### 4.2 SageMath simplify

Type: Text

Source: F = sin(x)^2 + cos(x)^2

Operation: sage.symbolic.simplify

Engine: SageMath 9.5 (Local WSL)

Source revision: 0

Result: 1

LaTeX: $1$

Input hash: 10a61644a92033b084507f3e5e63a646d3e6a7981e697fcd2a09119002a7469c

## Mesh topology and Notes

_Last updated 2.11.2026, 13:58:04_

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

_Last updated 2.11.2026, 13:58:04_

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

_Last updated 2.11.2026, 13:58:04_

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

_Last updated 2.11.2026, 13:58:04_

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

_Last updated 2.11.2026, 13:58:04_

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

_Last updated 2.11.2026, 13:58:04_

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

_Last updated 2.11.2026, 13:58:04_

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

_Last updated 2.11.2026, 13:58:04_

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

_Last updated 2.11.2026, 13:58:04_

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

_Last updated 2.11.2026, 13:58:04_

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

_Last updated 2.11.2026, 13:58:04_

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

_Last updated 2.11.2026, 13:58:04_

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
      "workbookId": "164cf256-1c05-44a4-88fc-84ee7fac3e79",
      "namedParameters": []
    },
    {
      "workbookId": "507957a1-18a9-45de-b89c-ed91215c928d",
      "namedParameters": []
    },
    {
      "workbookId": "bb73df76-9b37-4258-bf19-ae60219ce0f9",
      "namedParameters": []
    },
    {
      "workbookId": "2d5034b7-442e-42c7-923e-05c16b013e85",
      "namedParameters": []
    },
    {
      "workbookId": "972ce249-ccdc-4f74-92b9-d7c876aaa85a",
      "namedParameters": []
    },
    {
      "workbookId": "b820a0b9-4da7-49eb-8157-4820269d62c3",
      "namedParameters": []
    },
    {
      "workbookId": "053343d1-c71a-41a5-9496-79e882a1d4bd",
      "namedParameters": []
    },
    {
      "workbookId": "a78b097d-2383-41d0-b232-ba0640336e18",
      "namedParameters": []
    },
    {
      "workbookId": "57655e07-5c66-4d4f-a2f9-9548d58eab27",
      "namedParameters": []
    },
    {
      "workbookId": "6b67d371-0a4c-467e-9fb4-205c9626af29",
      "namedParameters": []
    },
    {
      "workbookId": "1a1215ef-fd7f-4cd8-9b35-7ce99b6758b6",
      "namedParameters": []
    },
    {
      "workbookId": "e72ff3a2-f32b-4986-a651-2b4e3ca136f4",
      "namedParameters": []
    },
    {
      "workbookId": "dbdd0839-37e5-4201-896c-eb9c8a727d51",
      "namedParameters": []
    }
  ],
  "qualification": "Publication records selected blocks, exact citations and freshness at export. Stale and unavailable evidence remains qualified. Numerical support checks only the declared scalar interval; it is not proof of arbitrary prose. A captured availability label alone does not establish portability. The Project package includes its saved Workbooks and current/replay source resources.",
  "blocks": [
    {
      "workbookId": "164cf256-1c05-44a4-88fc-84ee7fac3e79",
      "blockId": "a41e6202-d556-431d-95e1-12cd179d3009",
      "title": "Create a Geometry source",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:87135a8ace6de750a2695b64a3bde4c50623ae8ee2a47939db95b06ff0781351",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "164cf256-1c05-44a4-88fc-84ee7fac3e79",
      "blockId": "d2bb6e79-53c7-413f-a408-4e90b276aefd",
      "title": "Question",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:92e87bc320e0264bffe427168a4e521c3d7c2e12beda09ead669e2b78e569842",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "164cf256-1c05-44a4-88fc-84ee7fac3e79",
      "blockId": "034a8c4f-367d-4660-8c68-873a4cadcca3",
      "title": "Anchor an object and face",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:11eae3cc97e5f005c9196713bd5b8143888cf3e880c3ab162fd7f56eda584aca",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "164cf256-1c05-44a4-88fc-84ee7fac3e79",
      "blockId": "e8d1f2e2-fe2f-4656-bc7a-f4492e3a6f40",
      "title": "Geometry view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:f2d20486270c64f78f8518e87608a43618421d05f880507cd67aa53fa08f43da",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "164cf256-1c05-44a4-88fc-84ee7fac3e79",
      "blockId": "3a145109-9bbf-49df-a1ec-044fbe030c9c",
      "title": "Verify exact references",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:0abc39688f732f1945a379aa62e0d3722a5d65aa3f1b9848e68478430ccf4721",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "164cf256-1c05-44a4-88fc-84ee7fac3e79",
      "blockId": "00947081-48ad-4b6c-bf1f-73b28aa042f7",
      "title": "SageMath simplify",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:ae596690aa541c63aa914e4f750fe437469964a8fe0f84286ffb280ea9334310",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "507957a1-18a9-45de-b89c-ed91215c928d",
      "blockId": "e76fc06e-5ade-4747-8d56-137e924fe8f5",
      "title": "Create a Mesh source",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:21766b8a8347dea6186c354d0096bd775d7edc71417ab6bf0a92e9c8f9fafa6b",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "507957a1-18a9-45de-b89c-ed91215c928d",
      "blockId": "cd2820a2-d284-4d61-a398-b2094ec2e989",
      "title": "Anchor Mesh evidence",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:66ed4d29bbc8057d2510a115f30d427761dcbf380ec6ed114dd45fe3ad76f6cc",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "507957a1-18a9-45de-b89c-ed91215c928d",
      "blockId": "235079bd-d99b-4e27-8f8a-084552801879",
      "title": "Mesh evidence",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:b4eab63f3084532c0150538776144cdd0ba65e9952746a7ad37df161e83e5e80",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "507957a1-18a9-45de-b89c-ed91215c928d",
      "blockId": "a9c8c4f2-900c-4e36-9ab4-7e227da7ccd6",
      "title": "Check topology changes",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:1364a16fbb8512c372e19f3f8fb8d0c08e8a45ecbcddc370f45de889749276e3",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "bb73df76-9b37-4258-bf19-ae60219ce0f9",
      "blockId": "c6cdf5f1-b997-4533-90b6-20d200c4050a",
      "title": "Define a Surface",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:a46974dfb68b63c1e1d89b2447908eadd4a6bc97c7b5dace4e337d848b8cd6ed",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "bb73df76-9b37-4258-bf19-ae60219ce0f9",
      "blockId": "ab3a9293-5e6d-4086-9fcc-93f370d867db",
      "title": "Surface equation",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:2c6e57f0fdc22279a03419eca4a499d76d6ce5ed8395098845b9fc3feaf5a39c",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "bb73df76-9b37-4258-bf19-ae60219ce0f9",
      "blockId": "ea42dfe8-a26e-4a9f-841d-c0233ce28710",
      "title": "Curvature field",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:3e117845a5977e3e6da140c60defafcb598f35df08ad588b41fd013218289fb5",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "bb73df76-9b37-4258-bf19-ae60219ce0f9",
      "blockId": "1e526705-68c9-4a0c-a817-feaf58f28d6c",
      "title": "Save evidence",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:08a4b43fde54eac1fb4bcb91fb7133eade4da3369286a7be955c81342dc7a7e0",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "bb73df76-9b37-4258-bf19-ae60219ce0f9",
      "blockId": "30b5dc8d-24cc-4fb8-ab63-7910a00e14fc",
      "title": "Curvature view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:076c8ab5d7fab17de0aec32535b37bcd8d42270ec1e9181694cd02a40adcb950",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "bb73df76-9b37-4258-bf19-ae60219ce0f9",
      "blockId": "d09f05b0-e436-4aec-b746-ec288bd77ad2",
      "title": "Check provenance",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:140fa7d38f1dcd05d3d6612ff55f6430e81098ffcfb0a0143e4e1f0e3fdd685e",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "2d5034b7-442e-42c7-923e-05c16b013e85",
      "blockId": "9f74d2f9-8924-4b00-a7f5-8926b3b52b35",
      "title": "Goal",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:1b0096f6519409834d45dd20bd287aad02a60239fc75f1154105a7ca286472a3",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "2d5034b7-442e-42c7-923e-05c16b013e85",
      "blockId": "7234034a-23c1-4303-b478-afc3ae45a61c",
      "title": "Surface definition",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:6b00aaa6461e02264764f806a8c0a773c0b5b97f7f443e3beef837457ae5174b",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "2d5034b7-442e-42c7-923e-05c16b013e85",
      "blockId": "5a59537e-1b76-46c8-9553-ddb5b1fcb1d4",
      "title": "Curvature field",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:705cbf0a7e5371fa4d2f054bfca66f82a675faddd1a196fad430a6b0392fd1bf",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "2d5034b7-442e-42c7-923e-05c16b013e85",
      "blockId": "1e2aa12e-d569-446f-a6e7-a39256bf2e53",
      "title": "Curvature snapshot",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:7c5a548b9017a2b31c53a5887b59ef6d78f6aab4c88a3b14695f6109d42bb5ed",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "2d5034b7-442e-42c7-923e-05c16b013e85",
      "blockId": "3502b3df-9908-4372-be58-cc54a3b9fdfd",
      "title": "Interpretation",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:34bb44ac375ad33e6fbdc3a6a3aea3577b1002edb9bbffc87960759ce742fa27",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "972ce249-ccdc-4f74-92b9-d7c876aaa85a",
      "blockId": "c9d42afe-fff7-4bcf-85b0-b8666d3baec4",
      "title": "Goal",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:fe43c78d7320b188429d8f6adafb2d2bd397e266cd43e3fac8aa34300e9a3947",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "972ce249-ccdc-4f74-92b9-d7c876aaa85a",
      "blockId": "de5dd2a8-b762-4af4-b31b-78abcf4d86a7",
      "title": "Pick start point",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:86869b041a0ca4d4f6b6bf9dd16c4d4e1adac31a81ae62e818be118ec317cb4a",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "972ce249-ccdc-4f74-92b9-d7c876aaa85a",
      "blockId": "c1d7c777-c501-42ed-b7af-9b16d001f4ba",
      "title": "Pick end point",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:5cbdf74fb7d039db023348fe0d9f80dfd87f4b1645be93384c4e49f70b8c3206",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "972ce249-ccdc-4f74-92b9-d7c876aaa85a",
      "blockId": "7c0e4472-e01d-433b-9cff-5c8943bd412e",
      "title": "Geodesic heat",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:07a26ce137b9e2c8d9c65cda30d884607fe0bd0c6c8778e8c30217ad8c4c9889",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "972ce249-ccdc-4f74-92b9-d7c876aaa85a",
      "blockId": "42000a35-e0ca-49bd-b3ca-b296100b4c50",
      "title": "Geodesic path",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:33ae2fffd3b2ac13badb5df692914b3e351714cb41ce5cea543314b60a62e139",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "972ce249-ccdc-4f74-92b9-d7c876aaa85a",
      "blockId": "e8e1993b-20a0-431f-a9e5-1d097695df09",
      "title": "Geodesic snapshots",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:76b2fcd1808c7cfd0af15770d949cdaa0f201a4dd6b7e58c62a33859d0c4515b",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "972ce249-ccdc-4f74-92b9-d7c876aaa85a",
      "blockId": "c1cf9825-b5c8-411b-a57b-de940dffb8b1",
      "title": "Observations",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:11d4afa08d603f73f605679b6ce0b29049467d61b706e12fea35d50c45ad2968",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "b820a0b9-4da7-49eb-8157-4820269d62c3",
      "blockId": "bb3080a2-2732-463d-be54-6748109af094",
      "title": "Goal",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:ae1c384ed82a4ad3312c343be6a5e27f63910504b4082b58c4ddceb6def11ce2",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "b820a0b9-4da7-49eb-8157-4820269d62c3",
      "blockId": "161d98ab-3bda-4b2a-a480-317ba2d475c8",
      "title": "Chart grid + basis",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:8d4c852413286a82b631b1771a284bcae28903f00e6d5a91df8942fa5a763e69",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "b820a0b9-4da7-49eb-8157-4820269d62c3",
      "blockId": "758a2c70-37f1-4b07-865a-c157888f9aae",
      "title": "Chart grid snapshot",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:82132484a207deb1a3de433fb561d66a6a5a9e3ec4d65f737616039732ecaf77",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "b820a0b9-4da7-49eb-8157-4820269d62c3",
      "blockId": "ddfe9545-6733-4f0e-a754-e609c2a62558",
      "title": "Notes",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:9250c6bc1863a646cec2eced67e41efdf93859a254cd0c89fe4465f7fb7f66f2",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "053343d1-c71a-41a5-9496-79e882a1d4bd",
      "blockId": "25a7f8ab-e4ff-4250-918a-2ec50ddde6b2",
      "title": "Goal",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:1c6d3d61a252ca5828b171087a0adc5a2c770b8b0f8d0590075e36dfc3f2523f",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "053343d1-c71a-41a5-9496-79e882a1d4bd",
      "blockId": "2cbd87fb-4308-40ea-9dfe-68f2aab23484",
      "title": "Select region",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:9d211a3edf7d1a14924066e9f0c3affe642d18940f87dd521611769f2d12f8ce",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "053343d1-c71a-41a5-9496-79e882a1d4bd",
      "blockId": "73cc7827-419c-4da1-98b8-8982443de586",
      "title": "Selection overlay",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:fda9166bd1c28669df78dedd5747c9a43b796d8a44913f88d34302d3ebfcd79b",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "053343d1-c71a-41a5-9496-79e882a1d4bd",
      "blockId": "e40cb5bc-bb21-4d46-aee6-7b812e6bdf63",
      "title": "Curvature field",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:9b962b23fdee0168c8b0ffd7f9fc26dea7d77aad9266bcc8207935f07b05a112",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "053343d1-c71a-41a5-9496-79e882a1d4bd",
      "blockId": "05992280-a635-4598-88bb-4f5cec5cec64",
      "title": "Selection snapshot",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:26d24ef111f00fb1b0ed685dc03eb65c7e2f9ff36141867411464703ffa0c852",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "053343d1-c71a-41a5-9496-79e882a1d4bd",
      "blockId": "e1b2922b-e508-4252-b5f8-cc36433d400c",
      "title": "Stats summary",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:06779faf8982450ae484568d4107a6d8921ee414a7bf9bf875d22f5ebc6f4a67",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "a78b097d-2383-41d0-b232-ba0640336e18",
      "blockId": "90583115-dd1c-460f-9142-f9ab22efa00c",
      "title": "Goal",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:209178863d0f0c0d1b2f00122e1d8fee128b677de5229da3293b551386a0ee76",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "a78b097d-2383-41d0-b232-ba0640336e18",
      "blockId": "eb54c188-5f7f-4d27-897a-21c482b68fd4",
      "title": "Curvature field",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:7cec7aa26482fb3b0172cf33e12baef432c5ffd1c9bd38c7c76395ae0353106b",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "a78b097d-2383-41d0-b232-ba0640336e18",
      "blockId": "5101ebfe-c82d-4b8e-8ab1-811a753451bf",
      "title": "Principal directions",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:b541b0d10468ac42fe8b6f1d43bc1f9fd313ebc33ee3d7730f78e987674404af",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "a78b097d-2383-41d0-b232-ba0640336e18",
      "blockId": "9eee60d6-a5f4-49aa-b88c-bea7da22c7af",
      "title": "Principal direction snapshot",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:436a4599da960fe1ed607a6bab24b2d81c8646f15beda4076dd00b5775c007c2",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "a78b097d-2383-41d0-b232-ba0640336e18",
      "blockId": "8aa8c7de-e431-4f6f-aa8c-632b4f0d2b33",
      "title": "Interpretation",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:96607a4b8484994f6507024f84755a0ac82b2d25b7a5fad73eb3b1a3f266e9ac",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "57655e07-5c66-4d4f-a2f9-9548d58eab27",
      "blockId": "1d3ff2d4-86d0-4b62-bbdb-5e6ca1167b10",
      "title": "Task",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:bf7d2aaa899a252ad2449d823c82fbc8a7cce5f34de476b60c9d0c17a42322be",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "57655e07-5c66-4d4f-a2f9-9548d58eab27",
      "blockId": "2f3fba7a-f80f-4a6c-88f1-1396209c9888",
      "title": "Allowed tools + hints",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:73a24d0c5aad4663aa9d074a05fa5c15a407adf746d4b8d73488d72fc05e0913",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "57655e07-5c66-4d4f-a2f9-9548d58eab27",
      "blockId": "b421edc1-8e72-4ce4-b66a-5ec90e550a89",
      "title": "Solution view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:0ac531f65afff315fd56c4784c3891e01fbfb10e94ab3432e7e01306b7e4bcd6",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "57655e07-5c66-4d4f-a2f9-9548d58eab27",
      "blockId": "3d43a81c-0467-48d3-ae15-87fc098c6406",
      "title": "Validation checks",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:0b576d83c49c26178a812b39af8d8f8ec339960b9b6572f0f4389b9d404e4069",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "57655e07-5c66-4d4f-a2f9-9548d58eab27",
      "blockId": "ff77fadb-a22a-44a4-86e9-c4ee306060c4",
      "title": "Measurements to report",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:cd4cfccad4f274b345b85ec42071fae308c56560b15f36c15747a785ea5f29d2",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "6b67d371-0a4c-467e-9fb4-205c9626af29",
      "blockId": "f0af1fc1-558d-453b-870d-0823baac4706",
      "title": "Task",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:6f8904a619e2e66e4a02021b36185a62a584748524c5cdc900c1bf5239dfb433",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "6b67d371-0a4c-467e-9fb4-205c9626af29",
      "blockId": "3bb0717c-bc7b-4a55-8bca-ad95c9a1eaf4",
      "title": "Allowed tools + hints",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:bfd35c30b17cdbcd4c12646675d2167d3cdfbef5cf7cfad5f164ef8acc6f6bbe",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "6b67d371-0a4c-467e-9fb4-205c9626af29",
      "blockId": "dc401593-a15f-4eb2-9400-ca61a4f11b61",
      "title": "Solution view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:b18ae9e80959ddcfe6cd4ff9e9ceb25faacd52e447d6ef3cfaa3d110af12fdf6",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "6b67d371-0a4c-467e-9fb4-205c9626af29",
      "blockId": "9cdf166c-59f4-486d-9487-e59e8a5f7318",
      "title": "Validation checks",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:5330b96eed6ffb96ca613694958f2dffd9883c50dfcc931f72be138eaf9d8751",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "6b67d371-0a4c-467e-9fb4-205c9626af29",
      "blockId": "6bbd1f86-2c27-4299-8310-47a2d5ea79d9",
      "title": "Measurements to report",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:0297a1a7449296894149ccfdcaba6fef873b67dad4590fe27dd02f4c63a1bb00",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "1a1215ef-fd7f-4cd8-9b35-7ce99b6758b6",
      "blockId": "1b72edc9-eae5-4583-a244-6fab23ce19c3",
      "title": "Task",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:a16d9f6553355ebb6dec38bc58b98961b20858f73d409fc002a817d0bf3dcb0c",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "1a1215ef-fd7f-4cd8-9b35-7ce99b6758b6",
      "blockId": "35959ff9-8a20-45a4-b7cf-5dbe28698fcc",
      "title": "Allowed tools + hints",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:431f370e94ca1469ef0f96dbf16423659ebf20616618b36dc1a89469dcb1506d",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "1a1215ef-fd7f-4cd8-9b35-7ce99b6758b6",
      "blockId": "e5373aa5-a12e-491d-96f1-e958e506902d",
      "title": "Solution view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:0eb6cdd48e6391f4bd03d4f351e6468fd4256f5c7ff9cb9d8e439902c5080ddc",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "1a1215ef-fd7f-4cd8-9b35-7ce99b6758b6",
      "blockId": "af3a96d8-286b-4773-8d99-4eb9bb55bb08",
      "title": "Validation checks",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:ecf8bdb171e11cbe27eaa30c879a62fd5b270cd5d97b7f7bc4598bb3fa9e1ac3",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "1a1215ef-fd7f-4cd8-9b35-7ce99b6758b6",
      "blockId": "7e065814-c7af-4310-8159-c798511d637b",
      "title": "Measurements to report",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:584065109ec454c7b7c0caaf69abeb86c778adddc18afc2dd3c70e61931ecd58",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "e72ff3a2-f32b-4986-a651-2b4e3ca136f4",
      "blockId": "10cf4d53-3db4-4d09-8579-d431dfd05466",
      "title": "Task",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:42cd7bd9526f0035ef7e7699cae98f55cfceb802052df5cf18014a3138524b5a",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "e72ff3a2-f32b-4986-a651-2b4e3ca136f4",
      "blockId": "a9d5761d-f303-437a-b225-0680c61ef8b8",
      "title": "Allowed tools + hints",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:4a4f2868cb87fa2cb37beeb20311f1207f1944ba100f6e72851531841046bc2b",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "e72ff3a2-f32b-4986-a651-2b4e3ca136f4",
      "blockId": "c06241a3-6edb-4fbc-8838-067b423dfe5d",
      "title": "Solution view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:39fe2aae30c87d9cb6ff4d9d26119a736a281eac064327064a0c5d3cca3fe20c",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "e72ff3a2-f32b-4986-a651-2b4e3ca136f4",
      "blockId": "423522c1-19c7-4767-9683-1d56a17956dc",
      "title": "Validation checks",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:e7841b1c099ae3df8bf791082942984a3ab00a0741720c1bce85863c532d91a8",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "e72ff3a2-f32b-4986-a651-2b4e3ca136f4",
      "blockId": "5a9ce0da-7bf0-4ae8-abd3-2929ca1cb4d3",
      "title": "Measurements to report",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:708fa6c85fea064a3d2ef3007d3835c8100d52ce46188c6f4ccfe7ad05012cf7",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "dbdd0839-37e5-4201-896c-eb9c8a727d51",
      "blockId": "63b74de2-2fa4-488e-b54b-9d2534361a52",
      "title": "Task",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:0b0908fd01899280fd2c1efc62a0a4f141c768c54e2fa75f3381d7e5d6c1a96d",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "dbdd0839-37e5-4201-896c-eb9c8a727d51",
      "blockId": "9286473a-88f9-497b-ae99-f0887ba7c73c",
      "title": "Allowed tools + hints",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:b86e2733bb0fb1f925b7ff98c2908581511ae9dbebacc34c1739755514f29af7",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "dbdd0839-37e5-4201-896c-eb9c8a727d51",
      "blockId": "a3593c03-a9f4-4676-bbba-523b6a8d760f",
      "title": "Solution view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:51a1529a2389010161334072969c29a97a75de4720d28d3def70c2c005513138",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "dbdd0839-37e5-4201-896c-eb9c8a727d51",
      "blockId": "c8d3e290-e7a4-46e3-8ba6-30eb990845b8",
      "title": "Validation checks",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:d5fa30cefd9a558cb920fc11ce547d47024180de3466d2a61da5a6155ddcb507",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "dbdd0839-37e5-4201-896c-eb9c8a727d51",
      "blockId": "e34851ca-1d07-4610-ac50-83445f685899",
      "title": "Measurements to report",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:fe39a642da4308ebe9054ea91980f4102fd8021ba7518f113bc894fde9b1ede5",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    }
  ],
  "citations": []
}
```