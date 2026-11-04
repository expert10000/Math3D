# GF-09 — saved Graph parameter study

**Status:** first Project and Graphs gate implemented, 2026-11-04.

`Graph2DSource.parameterStudies` saves a compact `ParameterStudy` recipe with a stable ID, explicit function ID, one existing controlled parameter, inclusive sweep bounds, 2–256 samples, and a numerical point-value measurement at one physical x coordinate. It reuses Graph parameters and their resolved expression dependencies. The first measurement is the function value `y(x)`; further measurements can extend the recipe as separate versioned kinds.

The sweep runs through the registered `graph2d.parameter-study` scientific operation, the in-process job service, and the execution broker. It has a 30-second maximum deadline, fixed work and memory limits, periodic progress and cooperative cancellation. Each sample is evaluated from a bounded parameter frame. Invalid ranges, unavailable source/parameter, out-of-domain measurement coordinates, and undefined numerical values fail without publishing a partial series. A changed document generation, changed recipe/source fingerprint, cancelled job, or superseding job cannot publish a late result.

A successful run creates or refreshes one Graph point-series row. Its `parameter-study/v1` origin pins the study ID and hash, source function and variable fingerprint, and complete measured-row hash. The checked point-table sidecar stores the values; Project serialization saves the recipe, row, and table reference while the existing portable sidecar path carries its bytes. The result row is selected so it opens directly in Graphs. Adding or styling that row does not invalidate its own source fingerprint.

Graphs checks the saved origin before passing table rows to the sampler. Missing or edited recipe, missing or changed source, and missing or changed table bytes withhold values while leaving the row and its explanation inspectable. The inspector offers study creation, editing, running, cancellation, row opening, and status. A new run explicitly refreshes a withheld row. Undo covers recipe edits and row creation/refresh through Graph commands.

The focused contract test covers exact measurements, progress, cancellation, late source changes, undo/redo, Project save/reopen, and withholding after measurement or source edits. The desktop gate covers the Graphs flow and Project reopen. **The verified bundled-source profile sampling foundation gate remains open**; this Graph parameter study does not claim to close it.
