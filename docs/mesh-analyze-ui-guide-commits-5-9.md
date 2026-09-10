# Mesh Analyze UI guide — Commits 5–9

This guide shows where to exercise the features delivered by the five latest completed Mesh Analyze roadmap commits.

| Commit | Feature | Implementation commit |
| --- | --- | --- |
| 5 | Surface field calculus | `ebe8115` |
| 6 | Geodesic methods | `2fad684` |
| 7 | Cached surface-feature extraction | `a4844ad` |
| 8 | Ridges and valleys | `0c0207b` |
| 9 | Target isolation and large-mesh workers | `e151abf` |

## Open Mesh Analyze

1. Select **Mesh** in the main module bar.
2. Load a mesh through **Mesh presets** or import a mesh file.
3. Select **Mesh tools**.
4. Open the **Analyze** tab.
5. In **Analysis computations**, select the computation described below.

Geometry objects can also be sent here through **Geometry → Analyze → Open Mesh Analyze**.

## Commit 5 — Surface field calculus

Open **Analysis computations → Fields**.

To see scalar-field calculus:

1. Choose a **Scalar source**, for example `x`.
2. Select **Compute gradient** or **Compute Laplacian**.
3. Read the result, statistics, method, and cache metadata in the **Result** inspector.
4. Select **Compute Laplacian** again to see the cached-result status.

To see vector-field calculus:

1. Choose a **Vector source**.
2. For **Custom vector**, enter an expression such as `-y; x; 0`.
3. Select **Compute divergence** or **Compute curl**.

Visible confirmation: the status reports the computed operator, the Result inspector identifies the numerical method, and available scalar/vector field counts appear below the controls.

## Commit 6 — Geodesic methods

Open **Analysis computations → Distances & geodesics**.

1. Expand **Geodesic path methods** in the Analyze controls.
2. Enable **geodesic path tool**.
3. Choose a method:
   - **Approximate edge-graph routing** follows mesh edges.
   - **Accurate CGAL surface path** crosses triangle interiors.
4. Choose **Selected vertex**, **Selected surface point**, or **Selection set** as the source.
5. Click the source and target on the mesh. With a selection set, select source vertices first and then click one target.

Visible confirmation: a path appears in the viewport, **Length** is reported, and the Result inspector names the selected graph or CGAL surface method. **Clear path** removes the endpoints and overlay.

## Commit 7 — Cached surface-feature extraction

Open **Analysis computations → Feature classification**.

1. Wait for the classification status to report cached/current results and valid vertices.
2. Choose a **Candidate class**: high curvature, elliptic, hyperbolic/saddle, parabolic/developable, or umbilic.
3. Select **Show overlay**.
4. Select **Select members** to send the classified mesh samples to the shared **Selection** inspector.

Visible confirmation: the panel reports member, uncertain-vertex, and feature-edge counts. The viewport shows the selected class, while the Result inspector records the normals → curvature → principal-directions dependency chain.

## Commit 8 — Ridges and valleys

Open **Analysis computations → Ridges / valleys**.

1. Wait for the green **Ready** status and validated-direction count.
2. Choose the **Ridge family** and **Valley family** (`k1` or `k2`).
3. Adjust **Strength**, **Directional contrast**, **Neighborhood rings**, **Smoothing passes**, **Minimum line length**, or **Minimum confidence** if needed.
4. Enable **Show traced curves** to switch from candidate segments to stitched curves.
5. Select **Show ridges** and/or **Show valleys**.

Visible confirmation: green ridge and orange valley overlays appear in the viewport. The summary reports ridge/valley candidates, traced lines, and uncertain vertices suppressed. Hiding both overlays does not change the valid cached result from **Ready**.

## Commit 9 — Target isolation and large-mesh workers

The **Target display** controls are at the top of the Analyze tab.

1. Select **Focus target** to isolate the analyzed mesh.
2. Select **Ghost others** to keep other scene objects visible but de-emphasized. This is the default Analyze display.
3. Select **Show scene** to restore ordinary scene visibility.
4. Toggle **Show construction overlays** when topology or construction helpers are needed.

To see worker-backed analysis, load a larger preset such as **Stanford Bunny**, **Armadillo**, or **Dragon**, then open **Differential geometry**, **Feature classification**, or **Ridges / valleys**.

Visible confirmation: computation status advances through queued/running/publishing to ready without freezing the viewport. Long-running feature or ridge/valley work exposes a cancellation button, and completed computations appear in the cached-analysis count.

## Recommended quick walkthrough

For a compact check of all five commits, load **Stanford Bunny**, open Mesh Analyze, and then:

1. Compute `Laplacian(x)` under **Fields**.
2. Draw an **Accurate CGAL surface path** between two picked points.
3. Show **high-curvature** or **hyperbolic/saddle** feature candidates.
4. Show ridge and valley candidate segments, then enable traced curves.
5. Switch between **Focus target**, **Ghost others**, and **Show scene** while the overlays remain active.
