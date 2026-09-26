# Scene-object composition and remapping

MOB63 defines the shared planning boundary used before selected objects are copied into another project.

## Deterministic identity plan

`planSceneObjectComposition` accepts validated `math3d.scene-object` envelopes, declared object-to-object dependencies, the destination's reserved object IDs, a portable source project identity, and an import timestamp. Source objects are sorted by ID before allocation. A free ID is kept; a collision receives the first available `-2`, `-3`, and so on suffix. The same logical input therefore produces the same map regardless of picker or storage ordering.

The planner returns no partial plan when validation fails. Source IDs must be unique, destination IDs must be unique, object/dependency limits are bounded, and every dependency target must be included in the source selection.

## Reference rewriting

Dependencies may declare a JSON Pointer inside `analysisMetadata`. The source value must exactly equal the declared target object ID. During planning, both dependency endpoints and declared metadata references are rewritten through the same ID map. Paths outside `analysisMetadata` are rejected; callers cannot use composition to mutate the envelope schema or mathematical definition.

The completed plan is validated again so every dependency endpoint resolves to an output object and every declared path contains the remapped target. Canonical plan serialization rejects tampered or dangling plans.

## Provenance

Each output envelope records the portable source format, source project ID, original object ID, and import time. A parallel provenance record retains the source producer and source/destination content hashes. Device paths, picker URIs, and access tokens are not accepted as source formats.

The golden fixture corpus covers collision allocation, reordered input stability, internal-reference rewriting, provenance, missing dependencies, mismatched paths, and post-plan tampering.
