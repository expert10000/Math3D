# Revision-safe Complex preview artifacts

C05 binds Function Explorer preview production to `ComplexAnalysisDocument`
revision/hash and F07 artifact handles. Fourteen layer families are declared for both
low- and high-resolution quality: domain coloring, Z/W grids, real, imaginary,
modulus, argument, vector field, U/V levels, Cauchy-Riemann defect, conformal field,
path mapping, and 3D value surface.

The React integration retains only revision, readiness, and handle count. Float32
sample grids live in the in-memory artifact registry; they are not serialized into
the document or localStorage. Low quality is capped at 32×32, high quality at
256×256, and sampling yields between row blocks so it does not monopolize the render
cycle. Drag previews are independent, transient, and capped at 256 samples.

Each handle names the document revision and structural hash. Publication checks the
source generation again after computation. If the function, domain, sampling, or
branch source changes in the meantime, the late bundle is returned as ignored and
the old handles resolve as `stale-source`. The artifact registry also invalidates
old payloads when a new source generation begins.

No Sage or native engine is required. The preview service compiles only the validated
C03 AST and preserves the existing immediate TypeScript exploration path.

In the UI, open **Complex Analysis → Function Explorer** and find the green
`Revision-safe preview r… · 14 F07 artifacts ready` line under
**Visualization / Overlays**.
