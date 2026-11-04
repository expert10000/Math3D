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

For a 3D vector field from a Theory Lab run or Python notebook, use three components, three coordinate axes and a three-element `shape`. Set `producer` to `theory-lab` only when the data actually came from Theory Lab; use its stable run ID as `sourceId` and its versioned data contract as `sourceSchema`. The publisher writes no declarative slice `view` for vector fields. In desktop Graphs, choose **Import scientific dataset → Open in Field Explorer** to inspect the verified volume. For example, a 3×3×3 vortex sampled with x outermost and z fastest:

```python
points = [(x, y, z) for x in (-1, 0, 1) for y in (-1, 0, 1) for z in (-1, 0, 1)]
spec = {
    "sceneId": "lab-vortex", "title": "Theory Lab vortex",
    "producer": "theory-lab", "sourceId": "run-vortex-1", "sourceSchema": "theory-data/v1",
    "coordinateKind": "cartesian",
    "axes": [{"name": axis, "unit": "m"} for axis in ("x", "y", "z")],
    "origin": [-1, -1, -1], "spacing": [1, 1, 1],
    "periodic": [False, False, False], "shape": [3, 3, 3],
    "datasetId": "velocity", "quantity": {"name": "Velocity", "unit": "m/s"},
    "components": [
        {"name": "east", "values": [-y for x, y, z in points]},
        {"name": "north", "values": [x for x, y, z in points]},
        {"name": "up", "values": [0 for _ in points]},
    ],
}
publish_scene(spec, "lab-vortex.sscene")
```

`npm run test:ssr:publisher` publishes this shape with Theory Lab source metadata, reads all three components through Math3D's verified 3D importer, then checks that an edited publication has a different source hash and an old fingerprint cannot be used for it. This tests the interchange contract; it does not launch Theory Lab or establish an automatic two-app round-trip.

The flat value order is last-axis-fastest. A 2D scalar grid gets an `identity` height-surface view. A 3D scalar grid gets an `identity` slice; a 3D complex grid supplies an additional flat `imaginary` array and gets a `complex-density/v1` slice. A caller can provide an explicit `view` with those same registered operations and a 3D `axis` of 0, 1 or 2. No expression is accepted as a view operation. Each resource is little-endian Float64, hashed independently, and held to the 16 MiB contract budget; the published manifest and envelope are hashed too. The output parent must exist; an existing `.sscene` destination is refused, not overwritten.

Cross-language acceptance: `npm run test:ssr:publisher` invokes Python, checks the files with Math3D's shared TypeScript validator and desktop byte-verifying reader, checks exact samples and units, then tests malformed and tampered bundles. Set `PYTHON` to a Python 3.10+ executable if it is not `py` on Windows or `python3` elsewhere.

**Current UI boundary:** Desktop Graphs imports the bounded 1D scalar, complex and vector subsets as point series, and a 2D scalar grid as a line after you explicitly choose the varying axis and fixed index. Eligible 3D scientific fields open in Field Explorer through **Import scientific dataset**. The separate **File → Verified quantum examples → Open external .sscene folder…** read-only preview supports the bounded **2D scalar height-surface** subset. Producer claims are displayed as supplied and are not authenticated. Opening a bundle launches no Python process.

Graphs → **More → Author** also includes two bundled 2D grid presets: **Sine–cosine grid** (17×17, sampled trigonometric function) and **Thermal gradient grid** (5×7, time in seconds, distance in metres, temperature in kelvin). Select one to load its verified bundle, then choose the varying axis and fixed index and preview the line before importing. These illustrative datasets are generated from deterministic fixtures; they are not measurements. No folder selection or Python execution is needed.

An optional **Publish with reference Python script…** action in the same desktop dialog uses this pinned, standard-library script from either the checkout or the installed app. Supply an independently managed Python 3.10+ executable, a JSON spec and a new `.sscene` destination; no interpreter is bundled for this interchange path. **Publish with custom Python script (trusted code)…** remains an explicit, unsandboxed option. Math3D displays hashes and paths before Run and asks for native confirmation of local-code execution. Nothing runs merely because a scene or spec is opened. The [workflow and limitations](../../docs/scientific-scene-python-job-workflow.md) describe cancellation, source-change refusal and the current 2D preview boundary. The standalone CLI above remains usable without Math3D.

For a first run, choose the shipped `examples/sincos-grid.json` shown by the spec picker. It is a small 5×5 demonstration, not a physics calculation or a performance benchmark. Replace it with your own bounded JSON data to publish a scientific dataset.

## Read Graph numerical analysis in Python or Theory Lab notebooks

Graphs exports critical-point and intersection results with **Export analysis JSON** in the Analysis Inspector. The standard-library reader in this directory validates the bounded `math3d.graph2d-numerical.v1` contract before a Python or Theory Lab notebook uses the numbers:

```python
from graph_analysis_reader import load_graph_analysis

data = load_graph_analysis("graph-analysis.json")
points = [(candidate["x"], candidate["y"]) for candidate in data["candidates"]]
print(data["operation"], data["scan"]["quality"], points)
```

Run `python graph_analysis_reader.py graph-analysis.json` to check a file from a shell. Add this directory to the notebook's Python path or copy the reader into the notebook environment. The reader rejects duplicate keys, nonfinite numbers, out-of-interval candidates, inconsistent quality labels, and unsupported fields; it enforces a 1 MiB file and 256-candidate bound. New exports include bounded `unresolvedIntervals` entries with x bounds and reasons; a work limit conservatively marks the whole analysis interval. The reader also accepts older v1 exports without that optional field. Treat `source.structuralHash` as a link to a Math3D source revision, not independent proof of the result: the JSON contains numerical evidence, not the editable function or a verified source bundle. A `refined` candidate met a stated numerical residual test; `scan.quality` remains `approximate` for a completed bounded scan, or `incomplete` when coverage is unresolved. Theory Lab can consume the validated dictionary in its own Python analysis code; there is no automatic Theory Lab project import or reverse synchronization yet.
