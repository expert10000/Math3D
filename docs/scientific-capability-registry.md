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

The first fully described operation is `surface.curvature.compute`. It implements Gaussian, mean, and principal curvature capabilities from the same sampled input and describes the histogram parameter, field and statistics outputs, numerical method, validation, and execution properties. The Surface UI and Surface Analysis worker both call the same bound implementation in `renderer/src/surfaceAnalysis/surfaceCurvatureOperation.ts`. The existing Surface result store still owns result retention, source freshness, and cache behavior. `surface.curvature.analytic-reference` samples exact derivative presets on a bounded grid, and `compareSurfaceCurvatureReference` checks a corresponding candidate field with explicit units, grid, coverage and tolerance checks. `mesh.normals.compute` is also fully described and all callers of `computeVertexNormals` use its registered binding. Other canonical worker entries retain partial schemas until checked against their implementations and tests.

`packages/core/src/platformDiscovery.ts` adds a common `list`, `get`, `related`, and `executableOperation` interface for scientific operations, mathematical objects, computational methods, features, visualizations, UI routes, commands, metrics, validators, workflows, journeys, runtime providers, and exporters. References are checked when the service is created. A registered operation must agree with its capability registry entry.

Three descriptors now have `schemaCompleteness: "complete"`: sampled Surface curvature, analytic Surface curvature reference, and Mesh vertex normals. Their JSON compatible input, parameter, and output values pass contract validation against real results. The retained sampled Surface result is adapted to stable capability, metric, and artifact identifiers only after source identity, revision, representation, units, and sample bounds agree. Other canonical worker descriptors have `schemaCompleteness: "partial"`; they cannot generate parameter editors, workflow nodes, benchmarks or SDK calls. An incomplete descriptor is not advertised as available by the discovery adapters even if a backend implementation ID is reported.

`packages/core/src/scientificOperationProducts.ts` derives parameter metadata, workflow node templates, Markdown contract documentation, a metric checked result inspection model, and a schema checked benchmark runner from complete descriptors. Generated nodes and benchmarks require an explicit verified host binding. Surface result adaptation checks metric identifiers against the same registry before presenting retained evidence. The API client exposes descriptor generated documentation and server eligible workflow nodes. `integrations/python/scientific_operations.py` exposes a descriptor driven client over a caller supplied verified transport; it validates request and response values against the registry's JSON Schema subset. No server executor is added by that client.

The desktop and web module navigation has a **Capabilities** button. Its panel follows the selected module and offers a selector for all 13 scientific modules, including Graph 3D, Field Explorer, and Quantum. It separates operations verified in the current host, registered operations without a verified local binding, and planned capabilities. The available Surface curvature operation opens the existing analysis controls. The Surface computation panel and command palette also use the same descriptor. The panel does not imply that all listed mathematics can be computed.

The panel also shows a source-backed inventory of existing workspace features for each module, grouped as Create, Edit, View, Analyze, Export, and Study. Analysis entries for Curve, Surface, Mesh, and Geometry are drawn from their respective result-kind registries; exact CAS and Number Theory entries come from the algebra operation registry; Graph tools and Field derived operations likewise come from their module definitions. Other workspace entries describe existing authoring, visualization, and export controls. A workspace entry is a navigation aid, not a claim that an operation can execute on every source or host. Graph 3D currently has no dedicated workspace; its capability entries remain registered or planned according to their actual status.

Host discovery requires an explicit implementation binding. Desktop and web bind Surface curvature; the mobile and API adapters advertise no scientific operation by default. Python discovery reads registry descriptors plus a server's verified binding report and likewise returns none by default. An operation's environment declaration alone is insufficient. These adapters are discovery boundaries, not new execution endpoints.

## Integration progress and next work

1. **In progress:** Complete the remaining worker schemas one operation at a time and verify each host implementation. Proposed capabilities remain catalogued.
2. **Surface and Mesh slices:** Curvature, analytic reference sampling and Mesh normals have validated contracts. Extend retained result, metric and artifact adapters beyond sampled Surface curvature.
3. **Generated contracts available:** Parameter metadata, workflow node templates, API Markdown and benchmark execution consume complete descriptors. A full Workflow Builder, generated execution panel and result inspector still need to consume those templates in the application.
4. **Guarded across hosts:** Desktop, web, mobile, API, and Python discovery use explicit binding checks. Add server and mobile bindings only when their execution paths and tests exist. A verified Python server transport and generated static SDK methods remain future work.
