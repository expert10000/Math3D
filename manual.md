# Manual

## Workbook usage
1. Open the Workbook tab (right panel) and create or select a workbook.
2. Add blocks in the Define/Compute/Visualize/Explain stages as needed.
3. Interaction blocks: choose a mode (Pick point, Draw curve, Select region, Pick direction) and capture data on the surface.
4. Compute blocks: pick an operator and click Run to generate outputs; parameters can be added via the Parameters section.
5. Visualize blocks: capture the current view as a snapshot and jump back to it later; use A/B snapshots for compare mode.
6. Export or import workbooks as JSON from the Workbook panel.

## Differential operators (grad/div/laplacian)
1. Add a Compute block and choose `Grad (scalar → vector field)`, `Div (vector → scalar field)`, or `Laplacian (scalar → scalar field)`.
2. For `Grad`, pick a scalar field (defaults to `K`) and optionally set `Vector density` and `Vector scale`. Run to render downsampled tangent arrows (e.g. `K → grad(K)`).
3. For `Div`, either connect a vector output from an earlier Grad block or choose the `Vector field` param (defaults to `grad(K)`), then run to compute a scalar field.
4. For `Laplacian`, choose a scalar field (defaults to `K`) and run; this computes `div(grad(scalar))`.
5. When the surface samples match the mesh vertices, `Div` and `Laplacian` also enable a heatmap for the computed scalar field.
