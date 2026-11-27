# Scientific capability and platform discovery

Math3D now separates five scientific concepts:

| Concept | Contract | Meaning |
| --- | --- | --- |
| Capability | `ScientificCapability` | Mathematical work a module intends to offer. |
| Operation | `ScientificOperation` and `ScientificOperationDescriptor` | A versioned implementation and its discoverable input, parameter, and output contract. |
| Result | `ScientificResult` | One execution against a source reference. |
| Metric | `ScientificMetric` | A measured value from that result. |
| Artifact | `ScientificArtifact` | A retained output reference. |

The common capability registry in `packages/core/src/scientificCapabilityRegistry.ts` covers Graph 2D, Graph 3D, Curve, Surface, Mesh, Geometry, Volume, Topology, CAS, Number Theory, Complex Analysis, Field Explorer, and Quantum. Entries with `status: "catalogued"` are discovery and roadmap entries. They have no claimed executable operation. Consumers must check the host environment and implementation availability through `runnableFor` before offering execution.

The first registered operation is `surface.curvature.compute`. It implements Gaussian, mean, and principal curvature capabilities from the same sampled input and describes the histogram parameter, field and statistics outputs, numerical method, validation, and execution properties. The Surface UI and Surface Analysis worker both call the same bound implementation in `renderer/src/surfaceAnalysis/surfaceCurvatureOperation.ts`. The existing Surface result store still owns result retention, source freshness, and cache behavior.

`packages/core/src/platformDiscovery.ts` adds a common `list`, `get`, `related`, and `executableOperation` interface for scientific operations, mathematical objects, computational methods, features, visualizations, UI routes, commands, metrics, validators, workflows, journeys, runtime providers, and exporters. References are checked when the service is created. A registered operation must agree with its capability registry entry.

The Surface curvature descriptor currently has `schemaCompleteness: "partial"`: it identifies the operation and its connected entries but does not fully describe every typed array, mask, and optional output. `generatableOperations()` therefore excludes it. Parameter editors, workflow nodes, API documentation, SDK bindings, and benchmark forms should only be generated after a descriptor has a complete, validated schema and a host has bound its implementation. The other platform entries are catalogued identifiers; they do not change application navigation or claim runtime support.

## Next integration steps

1. Describe the remaining existing operations from their canonical implementation and tests, then bind each through the common registry. Keep proposed capabilities catalogued until their executor is verified.
2. Add complete schemas and stable result, metric, and artifact adapters to the current Surface result pipeline. Validate units and source generation at the boundary.
3. Use discovery to populate one computation panel and one command or workflow node, retaining current routing until those consumers have parity tests.
4. Extend the same host availability check to desktop, web, mobile, API, and Python SDK surfaces before advertising an operation there.
