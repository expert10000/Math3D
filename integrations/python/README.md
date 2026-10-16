# Standalone scientific-scene publisher (SSR-05)

This standard-library Python 3.10+ module writes a bounded `scientific-scene/v1` `.sscene` directory. It is a producer-side tool, **not** a Python runtime embedded in Math3D. It does not import Math3D, start Electron, or contact a worker. The source hash identifies the published component payload bytes in manifest order; it does not authenticate the producer or prove scientific correctness.

From Python or a Jupyter notebook:

```python
import math
import sys
sys.path.insert(0, "integrations/python")
from scientific_scene_publisher import publish_scene

nx = ny = 17
spec = {
    "sceneId": "my-sincos", "title": "Python sin(x) cos(y)",
    "producer": "python", "sourceId": "my-grid", "sourceSchema": "python-data/v1",
    "coordinateKind": "cartesian",
    "axes": [{"name": "x", "unit": "1"}, {"name": "y", "unit": "1"}],
    "origin": [-math.pi, -math.pi], "spacing": [math.pi / 8, math.pi / 8],
    "periodic": [False, False], "shape": [nx, ny],
    "datasetId": "f", "quantity": {"name": "scalar value", "unit": "1", "symbol": "f"},
    "real": [math.sin(-math.pi + i * math.pi / 8) * math.cos(-math.pi + j * math.pi / 8)
             for i in range(nx) for j in range(ny)],
}
publish_scene(spec, "my-sincos.sscene")
```

Or save the same dictionary as JSON and run:

```bash
python integrations/python/scientific_scene_publisher.py --spec my-grid.json --output my-grid.sscene
```

For Graphs, publish a 1D complex signal with `shape: [2..256]`, `real` and `imaginary` arrays of matching length, and one coordinate axis. A 1D vector replaces `real` with two or three named components:

```python
spec = {
    "sceneId": "velocity-run", "title": "Measured velocity",
    "producer": "python", "sourceId": "run-1", "sourceSchema": "python-data/v1",
    "coordinateKind": "cartesian",
    "axes": [{"name": "time", "unit": "s"}],
    "origin": [0], "spacing": [0.5], "periodic": [False], "shape": [4],
    "datasetId": "velocity", "quantity": {"name": "Velocity", "unit": "m/s"},
    "components": [
        {"name": "east", "values": [1, 2, 3, 4]},
        {"name": "north", "values": [4, 3, 2, 1]},
    ],
}
publish_scene(spec, "velocity-run.sscene")
```

In desktop Graphs, choose **Import scientific dataset** and select a component. Each import copies one checked component into a separate point series with source and unit metadata. 1D bundles have no surface or slice view. Names must be unique; all component arrays must match the shape and contain finite values.

The flat value order is last-axis-fastest. A 2D scalar grid gets an `identity` height-surface view. A 3D scalar grid gets an `identity` slice; a 3D complex grid supplies an additional flat `imaginary` array and gets a `complex-density/v1` slice. A caller can provide an explicit `view` with those same registered operations and a 3D `axis` of 0, 1 or 2. No expression is accepted as a view operation. Each resource is little-endian Float64, hashed independently, and held to the 16 MiB contract budget; the published manifest and envelope are hashed too. The output parent must exist; an existing `.sscene` destination is refused, not overwritten.

Cross-language acceptance: `npm run test:ssr:publisher` invokes Python, checks the files with Math3D's shared TypeScript validator and desktop byte-verifying reader, checks exact samples and units, then tests malformed and tampered bundles. Set `PYTHON` to a Python 3.10+ executable if it is not `py` on Windows or `python3` elsewhere.

**Current UI boundary:** Desktop Graphs imports the bounded 1D scalar, complex and vector subsets as point series, and a 2D scalar grid as a line after you explicitly choose the varying axis and fixed index. The separate **File → Verified quantum examples → Open external .sscene folder…** read-only preview supports the bounded **2D scalar height-surface** subset; it validates the bytes and re-verifies them for each selected sample. The 3D scalar and complex bundles above are valid interchange data, but the generic external picker does not yet render them. Producer claims are displayed as supplied and are not authenticated. Opening a bundle launches no Python process and does not automatically import into a Project.

An optional **Publish with reference Python script…** action in the same desktop dialog uses this pinned, standard-library script from either the checkout or the installed app. Supply an independently managed Python 3.10+ executable, a JSON spec and a new `.sscene` destination; no interpreter is bundled for this interchange path. **Publish with custom Python script (trusted code)…** remains an explicit, unsandboxed option. Math3D displays hashes and paths before Run and asks for native confirmation of local-code execution. Nothing runs merely because a scene or spec is opened. The [workflow and limitations](../../docs/scientific-scene-python-job-workflow.md) describe cancellation, source-change refusal and the current 2D preview boundary. The standalone CLI above remains usable without Math3D.

For a first run, choose the shipped `examples/sincos-grid.json` shown by the spec picker. It is a small 5×5 demonstration, not a physics calculation or a performance benchmark. Replace it with your own bounded JSON data to publish a scientific dataset.
