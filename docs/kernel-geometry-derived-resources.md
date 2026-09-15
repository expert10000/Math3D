# Revision-safe Geometry derived resources

GK06 routes expensive Geometry outputs through the shared scientific job, analysis
result, artifact, and document-relation contracts.

`GeometryDerivedResourceCoordinator` binds every request to the exact Geometry
document ID, revision, structural hash, and generation. Registered operations cover
the infrastructure used by tessellation, section/intersection, diagnostics,
generated Geometry → Mesh outputs, and other expensive analysis. Executors receive
the shared cancellation/deadline/work/memory context. Publication performs a second
source check, so late output from an older revision is rejected.

Compact results record operation, algorithm/version, engine/version, status,
elapsed time, parameters, and numerical precision/tolerance. Dense mesh, sample, or
table bytes are published only through `InMemoryArtifactRegistry`; result JSON holds
opaque handles. GK01 `analysis-of`, `generated-by`, and `promoted-from` relations
record lineage. Geometry → Mesh publication can additionally expose a compact
mesh-entity → Geometry-entity locate-back map.

Distance, angle, and area are the only synchronous exact publication families in
this slice. They are bounded O(1) operations, and each result records why worker
scheduling would cost more than the computation. Expensive operations must use the
job path.

Run `npm run test:kernel:gk06` for provenance, artifact isolation, relation lineage,
locate-back, stale-publication rejection, exact-operation authority, GK03 Geometry
conformance, typecheck, and production builds.
