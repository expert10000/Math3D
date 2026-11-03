# Math3D Workbook Export

_Exported 3.11.2026, 10:58:23_

## Geometry selection and Notes (active)

_Last updated 3.11.2026, 10:58:22_

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

#### 4.2 SageMath factor

Type: Text

Source: F = x^2 - 1

Operation: sage.symbolic.factor

Engine: SageMath 9.5 (Local WSL)

Source revision: 0

Result: (x + 1)*(x - 1)

LaTeX: ${\left(x + 1\right)} {\left(x - 1\right)}$

Input hash: 0f6ee336f4a4dbe5abdf4f372bcd031d039be60936be5cdb97517bf1de165a64

## Mesh topology and Notes

_Last updated 3.11.2026, 10:58:17_

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

_Last updated 3.11.2026, 10:58:17_

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

_Last updated 3.11.2026, 10:58:17_

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

_Last updated 3.11.2026, 10:58:17_

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

_Last updated 3.11.2026, 10:58:17_

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

_Last updated 3.11.2026, 10:58:17_

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

_Last updated 3.11.2026, 10:58:17_

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

_Last updated 3.11.2026, 10:58:17_

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

_Last updated 3.11.2026, 10:58:17_

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

_Last updated 3.11.2026, 10:58:17_

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

_Last updated 3.11.2026, 10:58:17_

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

_Last updated 3.11.2026, 10:58:17_

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
      "workbookId": "b0302943-429f-4426-8687-543628c21401",
      "namedParameters": []
    },
    {
      "workbookId": "9aed6d5d-182b-4960-9570-979944cfccb4",
      "namedParameters": []
    },
    {
      "workbookId": "b0699fed-0fd1-4824-99a2-3e53e0eb1d63",
      "namedParameters": []
    },
    {
      "workbookId": "6f0d0879-ed64-4798-b365-911b32052b02",
      "namedParameters": []
    },
    {
      "workbookId": "2d234d6b-3159-435f-b00e-fd4f93701031",
      "namedParameters": []
    },
    {
      "workbookId": "388ba72b-fcc9-451a-bcf4-4099be362a20",
      "namedParameters": []
    },
    {
      "workbookId": "c26a0f68-4c73-4b6c-8b10-bd5ed14b0397",
      "namedParameters": []
    },
    {
      "workbookId": "33747321-57e0-4db0-862b-6218231730c0",
      "namedParameters": []
    },
    {
      "workbookId": "ff290479-2d35-4f7e-853b-2aac2df9f902",
      "namedParameters": []
    },
    {
      "workbookId": "05da9566-1fa2-42d3-bd7b-eca89b389d6b",
      "namedParameters": []
    },
    {
      "workbookId": "d2be69d7-d58e-4145-850c-55970f2394a2",
      "namedParameters": []
    },
    {
      "workbookId": "c2132728-0683-425f-a98b-f197291be58d",
      "namedParameters": []
    },
    {
      "workbookId": "fb4f5dd6-05a6-4584-afbf-409103a764c9",
      "namedParameters": []
    }
  ],
  "qualification": "Publication records selected blocks, exact citations and freshness at export. Stale and unavailable evidence remains qualified. Numerical support checks only the declared scalar interval; it is not proof of arbitrary prose. A captured availability label alone does not establish portability. The Project package includes its saved Workbooks and current/replay source resources.",
  "blocks": [
    {
      "workbookId": "b0302943-429f-4426-8687-543628c21401",
      "blockId": "6dc51a1c-5e3c-4def-a548-1acfbcba081e",
      "title": "Create a Geometry source",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:3b230cfd1a3c8ad27037998cc42f2032b982bdd7219fbe3c3dbf303dd8e60f58",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "b0302943-429f-4426-8687-543628c21401",
      "blockId": "59d07c6f-acdb-4888-aad1-8f4256550b92",
      "title": "Question",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:78332d63f951684a48f703389cbbd9af545602543dd71ea406e69b0afbf573f5",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "b0302943-429f-4426-8687-543628c21401",
      "blockId": "b8c741fd-6ec7-421e-822f-09c9e4c45665",
      "title": "Anchor an object and face",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:c16e9ae91c0a7ef8da368151911e03962be200080524f936c7e6c9ff899e0e0c",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "b0302943-429f-4426-8687-543628c21401",
      "blockId": "6dda8700-ce49-441f-9e10-fd80c24f17e0",
      "title": "Geometry view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:c75a8d50e94f731d171e0bda2a4bb9e2e07da8f93ac0941c188bbb1e0b794a2a",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "b0302943-429f-4426-8687-543628c21401",
      "blockId": "62fee37e-5713-4c9c-a590-40babd5ed65e",
      "title": "Verify exact references",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:3c1397b8b40e3443e7abc29a0f108bf9ac9dfb921aed935a77700afd5ed4fd4f",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "b0302943-429f-4426-8687-543628c21401",
      "blockId": "ff425ced-4cde-42ca-a3ca-dc2f396d4143",
      "title": "SageMath factor",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:15c45ec1a51ffd44306716e3995ce1afae2bc04f875d9131ed37a3deb2e02699",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "9aed6d5d-182b-4960-9570-979944cfccb4",
      "blockId": "17766b36-146b-4985-a44d-4a1850b0c90b",
      "title": "Create a Mesh source",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:a195c99811217389d63a9519fa017456d24a07a1d106b8c53e5fa04e4e90822c",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "9aed6d5d-182b-4960-9570-979944cfccb4",
      "blockId": "849f16f2-4a3c-4e82-addf-eed69ccc0cb8",
      "title": "Anchor Mesh evidence",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:2f924a5937d24e994cc914d86d59c3576539449e738447ff4990192298ca84fc",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "9aed6d5d-182b-4960-9570-979944cfccb4",
      "blockId": "7c823ab8-24d7-455e-8dc6-4c392226e9d2",
      "title": "Mesh evidence",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:151544c8b974e1792fc09af88bb3f09961bada69467df6fc1d2da895248ebd71",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "9aed6d5d-182b-4960-9570-979944cfccb4",
      "blockId": "2f7cb05a-fa11-41c1-af0a-88948ce86641",
      "title": "Check topology changes",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:2bf19077fa34b9c4e8539e89d95a3a0d75fb9b9f108a57670bf77d834deb11f5",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "b0699fed-0fd1-4824-99a2-3e53e0eb1d63",
      "blockId": "ef85b514-ea75-4eed-bd69-987663dc57b0",
      "title": "Define a Surface",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:c4f9e9e89b72010a373f512d09bb35a97d232f76840f0b86af846b2a46f0d1db",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "b0699fed-0fd1-4824-99a2-3e53e0eb1d63",
      "blockId": "4657bfb3-184c-4d8d-b816-113cda018861",
      "title": "Surface equation",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:4f1f13035957e69fb9868beb847d4878c22cff161d48f243afb3d76f3cafc05a",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "b0699fed-0fd1-4824-99a2-3e53e0eb1d63",
      "blockId": "92115119-3add-4986-9bb4-00e7b8450a8e",
      "title": "Curvature field",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:895bb243321931b40f7991a3e26f47b36fe0b0aa43995466fad7e6b6ef8f7e97",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "b0699fed-0fd1-4824-99a2-3e53e0eb1d63",
      "blockId": "6fd59fdd-def2-4c80-bc5c-bdf68ec54c78",
      "title": "Save evidence",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:726452c27988d858771d232bebe584f5ca0fa683f811e1ca00b798535c641c5e",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "b0699fed-0fd1-4824-99a2-3e53e0eb1d63",
      "blockId": "f9082f77-6240-4e6e-8033-93b649cc5136",
      "title": "Curvature view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:25644387b6d69f3d6e3911d8b7d955ce119fdd529728e49082d2e8831c70b42e",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "b0699fed-0fd1-4824-99a2-3e53e0eb1d63",
      "blockId": "4e93a946-1034-4c94-b023-c8da93869f57",
      "title": "Check provenance",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:ccb0b83d18aa237a435d0f2ae1edcae0f875ee7f6d682e9413df23419fa3fdbc",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "6f0d0879-ed64-4798-b365-911b32052b02",
      "blockId": "3c86f3a4-094a-40ff-95e6-6f51bc99dbd0",
      "title": "Goal",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:84aa999038d935c8d975b5b57fa7a3dd922a6ccc9b63de377785b9bbed07b5b1",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "6f0d0879-ed64-4798-b365-911b32052b02",
      "blockId": "215ff547-5c68-475c-a494-030d8300e499",
      "title": "Surface definition",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:4720596028a3add34d062902f69ae42a5d33ac854f6f6e9d782409e928d448f2",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "6f0d0879-ed64-4798-b365-911b32052b02",
      "blockId": "d896e59b-63f2-4ad0-badc-6e17db342e2f",
      "title": "Curvature field",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:8537a87907cd6543b8494c5cd539c5d0c92ed75169abe6651fb9d6cd8aa6a766",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "6f0d0879-ed64-4798-b365-911b32052b02",
      "blockId": "a98f744c-f6bc-490a-b17c-c5cf5b95597e",
      "title": "Curvature snapshot",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:86e7a9fac5622d07cbc66fd7b449abcad02cbf48db941364e39e833d7424f261",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "6f0d0879-ed64-4798-b365-911b32052b02",
      "blockId": "f5b8153d-6372-4b63-a172-7b0d40d6c04d",
      "title": "Interpretation",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:eacfd7af263e8302d73e239210e7a0236f6661c74f6750f8d7ab0a8b2ba11adf",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "2d234d6b-3159-435f-b00e-fd4f93701031",
      "blockId": "2d349315-f86f-4a5c-a52b-2b3fe252f04b",
      "title": "Goal",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:e47d64274d3f210c89f958dffa57b15bbfdadf183813c22f654456cbf26e8bc7",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "2d234d6b-3159-435f-b00e-fd4f93701031",
      "blockId": "effbeb89-bc65-4c2c-948d-6bf84e32ca91",
      "title": "Pick start point",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:0385c5425f2d5ed21b24c1e3e8763bd1bef1f64b4ed929263256d1bdd9c4b071",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "2d234d6b-3159-435f-b00e-fd4f93701031",
      "blockId": "0417c031-f36a-4cc4-a321-153bb8a08dd8",
      "title": "Pick end point",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:48d4741081e41a02b58eeb9fad89ed967411c4d1cbb8ea4bc86aeb21c4b05e89",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "2d234d6b-3159-435f-b00e-fd4f93701031",
      "blockId": "13eba897-b64e-4fff-9943-afd719afe4ea",
      "title": "Geodesic heat",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:79d063a0138ea45dcd621500ef12a3bd1bec26fdf5bc6726334fcee4a9b43be9",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "2d234d6b-3159-435f-b00e-fd4f93701031",
      "blockId": "e0c5798d-075a-41a9-bd32-ed407e95eeaa",
      "title": "Geodesic path",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:62af09dc71bd4b4234991f751405eaf6d571832fc7bec66ce3c6bf7b0287c4ab",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "2d234d6b-3159-435f-b00e-fd4f93701031",
      "blockId": "3d934220-f9d2-45e3-bf3f-4117af5149a0",
      "title": "Geodesic snapshots",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:759bd16b2d3f4d29689986e8e4951f02cf4bd0b00ddbfe7f9217e98e12958c4a",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "2d234d6b-3159-435f-b00e-fd4f93701031",
      "blockId": "6636b9e7-0dae-407b-8f64-9403ab378ed8",
      "title": "Observations",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:6d4953052ffccc7cdbaf98271f406eb188998bec73d621bbb06fa35cccdf74bd",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "388ba72b-fcc9-451a-bcf4-4099be362a20",
      "blockId": "e3c310ac-a7f0-45ad-9ee7-644b2e89508f",
      "title": "Goal",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:b21d625b3c3e7ce4b4aefefe11357194ea3dff4268f51a544f4f61322c255aeb",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "388ba72b-fcc9-451a-bcf4-4099be362a20",
      "blockId": "ebfab439-f886-4275-ac44-31391db1887a",
      "title": "Chart grid + basis",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:341be5f4ca541aa674be48526206d9bd4cf66740592a2c849009de6d43c7759e",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "388ba72b-fcc9-451a-bcf4-4099be362a20",
      "blockId": "6338b340-35f3-4a1f-9fd4-a63b5ba2266e",
      "title": "Chart grid snapshot",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:82dd766ab21683c9ae720a96a4f3a0abfb9a532483269dca5d8ee1bb177ebd4c",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "388ba72b-fcc9-451a-bcf4-4099be362a20",
      "blockId": "22ba830f-ab20-4a35-8c89-bf88bc36844f",
      "title": "Notes",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:9bf7cd7311e7519674079547bab640a06f8505b51fc0cc4554be7c7881946f95",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "c26a0f68-4c73-4b6c-8b10-bd5ed14b0397",
      "blockId": "6fa79d73-4b72-4e87-8bfa-9fb94eafb0b9",
      "title": "Goal",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:fa7fd693c1eb795a221bfbef9672975ce0359c884f9e5248aa7103d30784dc6b",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "c26a0f68-4c73-4b6c-8b10-bd5ed14b0397",
      "blockId": "825c7ae4-1112-4d54-bea4-b3574289e1fd",
      "title": "Select region",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:0bc5c291e8f053a2236855b3078cbbdd3643d89191d7163fe4f438e206514b29",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "c26a0f68-4c73-4b6c-8b10-bd5ed14b0397",
      "blockId": "ce58c89e-3d63-4487-99d1-d6412e8a1aea",
      "title": "Selection overlay",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:3870b07e7b57425f94b152080ec55bd59c0f93e8fcee502d9239e5033156b31d",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "c26a0f68-4c73-4b6c-8b10-bd5ed14b0397",
      "blockId": "ae7149b0-0e3e-4e73-ae6d-3aba8ebf8118",
      "title": "Curvature field",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:a232387500418dfd28943d52c51fb0e7e9bbed3334d151abe616a3c2f82494c0",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "c26a0f68-4c73-4b6c-8b10-bd5ed14b0397",
      "blockId": "96e3ded6-66ab-41a7-ace4-aefe90ba16d4",
      "title": "Selection snapshot",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:f40855d2c01c014580c67a6faafbe54042bc16fa54cd8faa7b4e7560d341c914",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "c26a0f68-4c73-4b6c-8b10-bd5ed14b0397",
      "blockId": "25159d50-fc62-4054-be7f-3792f5db9a60",
      "title": "Stats summary",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:3e99e21b6fcd13c15e109396f21b620dd6752ed9f7f922c44d3e256d0cc4b46b",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "33747321-57e0-4db0-862b-6218231730c0",
      "blockId": "0a247950-92b7-4b85-9d75-56700f285624",
      "title": "Goal",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:6e9c71c3f73769a3c52d4dcecc7b2f85b86d35caf5e83d4684d150e2e9cfecd8",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "33747321-57e0-4db0-862b-6218231730c0",
      "blockId": "c15d382d-d78a-46b4-9c25-ce5a62a5e112",
      "title": "Curvature field",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:7e490970f920b11db3caea454e02a36422b8ac7d98752d2712cebf7dd05c8832",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "33747321-57e0-4db0-862b-6218231730c0",
      "blockId": "596bfd61-a537-423c-9181-8c9303db2745",
      "title": "Principal directions",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:cb2d7d01b21ab13e26fc01009de8d07f258e993a3da42af3d64fa97d1e26580a",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "33747321-57e0-4db0-862b-6218231730c0",
      "blockId": "4ed38c9a-e20e-451e-9f98-66af667242c5",
      "title": "Principal direction snapshot",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:c91f3f7d5af04ba7294d7e1d60af0d6ff3680ac4ff3a3ec0bb44e9062d673bfe",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "33747321-57e0-4db0-862b-6218231730c0",
      "blockId": "c010c8ad-cc66-48fe-aa95-d01398427c73",
      "title": "Interpretation",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:8a0c13bc99ba3bd6d9a73626703ab1f8879af6658593ea922b16d3bb594dc614",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "ff290479-2d35-4f7e-853b-2aac2df9f902",
      "blockId": "b4dc1334-d835-4edc-ad66-25302a733349",
      "title": "Task",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:1f670a159247a5fb9518cf2a3dc9461c499c2b442dcf69f915aeb1232f48f8c1",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "ff290479-2d35-4f7e-853b-2aac2df9f902",
      "blockId": "1c043d57-175d-4cb5-ad49-681091acebd1",
      "title": "Allowed tools + hints",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:ba8378a0ae0ea4acaa28259fe795505ddd51073ff0abfc827ca1bd0a666408c0",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "ff290479-2d35-4f7e-853b-2aac2df9f902",
      "blockId": "5c4dbf29-def0-4aa9-9e26-ec6f5cb1a292",
      "title": "Solution view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:4eb8921ce5f1e93be925e40061fc43642c253ec301bdfc4b5ae6174d591ca084",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "ff290479-2d35-4f7e-853b-2aac2df9f902",
      "blockId": "6115f334-aeef-411d-a810-46c6127d6a99",
      "title": "Validation checks",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:4fab7993f5cfeb2c1b7c64262188e66ba8d5859e5c8d75f734a170baa595991b",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "ff290479-2d35-4f7e-853b-2aac2df9f902",
      "blockId": "6802fe93-3a2a-4e5a-a915-c91e75871286",
      "title": "Measurements to report",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:df445b5fb911ca4c2cd5e9cdd592a59e16361376f0f024755387bea51d77ea00",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "05da9566-1fa2-42d3-bd7b-eca89b389d6b",
      "blockId": "e338041d-1d26-4b0f-b843-b49c25ab8b5b",
      "title": "Task",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:63c0a0daba19e4d13a73cf69e728135ab75abdf0f86c4038656240b0ac793036",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "05da9566-1fa2-42d3-bd7b-eca89b389d6b",
      "blockId": "3cb7c945-5d0d-4d55-aee3-561ed6b1530f",
      "title": "Allowed tools + hints",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:9143465207f58b3dad6bba313b66a191990a514ee199923be7c86e34b020aa16",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "05da9566-1fa2-42d3-bd7b-eca89b389d6b",
      "blockId": "3dcaa2b5-7a8e-4650-9175-ded434176b4a",
      "title": "Solution view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:5353264c7f2359dbb7818bab151a5bb034e4a7e057954d63ab498af93cddacd1",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "05da9566-1fa2-42d3-bd7b-eca89b389d6b",
      "blockId": "80263796-5599-4c04-bba2-cbc3eb9d7d16",
      "title": "Validation checks",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:44a946a6f683986f927bc266c8b31cc4ae0dc80094e2907ea7256ad5fbb54786",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "05da9566-1fa2-42d3-bd7b-eca89b389d6b",
      "blockId": "1087c789-f8a9-49a8-9b07-9d19140fa78a",
      "title": "Measurements to report",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:c5a01af47c868e25dfc8f3e3e08458571ad0a0723329d1e7a039ea48f8be7ed6",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "d2be69d7-d58e-4145-850c-55970f2394a2",
      "blockId": "6ae397c6-2c48-49c9-ba31-300f4fec0e4e",
      "title": "Task",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:c605f4cd8bf14f65a3769adb7f1aa34b15027d9cdef0d6848e98803fa07951e5",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "d2be69d7-d58e-4145-850c-55970f2394a2",
      "blockId": "35db4dab-4826-4529-9c66-28bd2ee4999b",
      "title": "Allowed tools + hints",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:cdaf365de816cfca71cf02463dc43ddcd2b4823dbf4b78f67616a162ea170b55",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "d2be69d7-d58e-4145-850c-55970f2394a2",
      "blockId": "91fbfabf-f123-41e0-a607-e08cee002593",
      "title": "Solution view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:493aacd6b6efa09ee62b59d0337039b2820b3290b10dea7687c1e683d1c691d0",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "d2be69d7-d58e-4145-850c-55970f2394a2",
      "blockId": "f36fc157-9ee4-4b37-82f2-0215c91c4cd9",
      "title": "Validation checks",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:84cda829d8aca618d27d766b376159f8bc0b3ad6d95887ae10566f51e35569b1",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "d2be69d7-d58e-4145-850c-55970f2394a2",
      "blockId": "803434f3-4bda-4883-8626-a4cc7366390f",
      "title": "Measurements to report",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:9a509b561e54db702dee1c15287593fd1735cc991d02da14fa7ffc43eede95c8",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "c2132728-0683-425f-a98b-f197291be58d",
      "blockId": "92b3d689-a007-46ed-ba33-6eacb9574235",
      "title": "Task",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:a868ce8833c530a33afd71471cbf26b2f66807e455db3913e4abca8cada2e05c",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "c2132728-0683-425f-a98b-f197291be58d",
      "blockId": "2689e33d-09db-4e91-9802-3ef416d089c8",
      "title": "Allowed tools + hints",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:8d54ceb93c2f0eed33ab04f940b00f8a19654cb0666d13aa6c196c447b1393cf",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "c2132728-0683-425f-a98b-f197291be58d",
      "blockId": "89442d65-6549-4a16-9aa5-c9825d066caa",
      "title": "Solution view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:fa25c3bfaee7ba816182d9c9ee9bed99ead24bdd5afe11da9f5c78bb4ba06f61",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "c2132728-0683-425f-a98b-f197291be58d",
      "blockId": "14034bf0-5960-4006-bcc3-091b47cf925f",
      "title": "Validation checks",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:594a215799142372ac1976b225065c77dad6efcbf4a21c579a752c7c971e2b8f",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "c2132728-0683-425f-a98b-f197291be58d",
      "blockId": "498facee-efd3-49b1-92ff-18b39397c12e",
      "title": "Measurements to report",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:18ba87e7c69af1d0dcaa385528c657ac08a0f4657f3dd35c2f8513bb89c541d4",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "fb4f5dd6-05a6-4584-afbf-409103a764c9",
      "blockId": "54e3976e-7177-4409-8446-1dd7bc98399b",
      "title": "Task",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:89d706ebba800b5300ea6139ab3f92687e2967cf7dd070cd23b876854032c094",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "fb4f5dd6-05a6-4584-afbf-409103a764c9",
      "blockId": "953d175b-2255-41f3-80de-2eedd17d31b4",
      "title": "Allowed tools + hints",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:e05ff2b368c5811b39a7c976361fd3014a454ddfe99ecb9f14e3f014ba0a26af",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "fb4f5dd6-05a6-4584-afbf-409103a764c9",
      "blockId": "4348f9f1-9b95-49dd-989d-be60ce1a0938",
      "title": "Solution view",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:54fb20da4893d12c9c7a46db46b48626110b411a3c9049959a370a62c0c0993a",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "fb4f5dd6-05a6-4584-afbf-409103a764c9",
      "blockId": "d61ff1c7-5389-4601-b296-5379a5815024",
      "title": "Validation checks",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:a2ea530ddce8765b4135ac6ee7e26bdd17e66efefa33aa14ab82fcb22ba6b784",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    },
    {
      "workbookId": "fb4f5dd6-05a6-4584-afbf-409103a764c9",
      "blockId": "7a8b8510-cb87-4d3d-a6d3-1ebdf74ca259",
      "title": "Measurements to report",
      "notes": [],
      "enabled": true,
      "contentHash": "sha256:6a8d7fd36c9dab32436b333d87c4c2b9dae4a35d95f28e7579e75897de5b0e68",
      "claim": null,
      "snapshots": [],
      "comparison": null,
      "savedMeshTrend": null
    }
  ],
  "citations": []
}
```