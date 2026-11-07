# Read a scientific result

Use this guide when a Project contains a saved analysis, a derived document, a sampled plot, or a Note that cites a result. The rules describe the current source tree. They do not certify an installed 2.0 release.

## Five questions to answer

1. **What source was used?** Open the result's source document and check its ID, revision, and structural hash. A Project title or a visually similar shape does not establish identity. A derived Curve or Surface has a recorded relationship to an exact source generation.
2. **What method was used?** Inspect the operation, algorithm version, parameters, engine version, and diagnostic messages. An `exact` result, a `certified` result, and a `numerical` result make different claims. A rendered view is not automatically a recomputation.
3. **What do the numbers measure?** Read the coordinate frame, axes, units, orientation, domain, and any sampling or normalization convention attached to the source and result. `rad` and `deg` are different angle declarations. A missing unit is unknown, not dimensionless.
4. **Is the evidence still available?** Read source freshness and artifact availability separately from method status. A saved numerical result can be valid for its old source yet stale for the current edited document. A result handle can exist while its referenced bytes are missing.
5. **What uncertainty is stated?** Read precision, tolerance, convergence diagnostics, excluded samples, and any statistical assumptions. A requested solver tolerance is not an error bound or confidence interval. Where no uncertainty or validation is recorded, do not infer one from displayed digits.

## Status and freshness are separate

The shared saved-result contract in `packages/core/src/analysisResults.ts` records `exact`, `certified`, `numerical`, `recognized`, `heuristic`, `unsupported`, `failed`, or `cancelled`. It also records source generation, operation and engine provenance, warnings, diagnostics, and optional precision/tolerance. `numerical` results must declare a numeric context. These fields describe the method and outcome at calculation time.

Project source checks can separately report current, stale, historical, missing, or unavailable evidence. If a source changes, retain the old result as historical evidence and recompute explicitly for the new generation. Do not relabel the old value as a current one. If the source bytes or an artifact cannot be verified, a summary may remain readable, but the missing data cannot be treated as checked output.

| Observation | Safe reading |
| --- | --- |
| Result says `numerical`, source is current | The result belongs to the current exact source; inspect tolerance, diagnostics, and method before using its value. |
| Result says `exact`, source is stale | The old operation's status remains recorded; it does not establish a result for the edited source. |
| Source is verified, artifact is unavailable | Metadata can be inspected; dependent figures or arrays require the missing artifact. |
| Saved output says `heuristic` or `recognized` | Treat the classification as bounded evidence, not a proof or certified numerical error. |

## Units, coordinates, and comparisons

Math3D modules use domain-specific units. A Graph may have authored x/y units, a Curve has coordinate/parameter/angle units, and a 3D field has a declared frame and component units. Before comparing a continuous Surface measure with a discrete Mesh measure, check the units, source generation, sampling resolution, orientation, and boundary exclusions. A shared color scale or overlapping pictures is not sufficient. If a field profile becomes a Graph, the Graph records a projection from the field; opening the Graph does not reconstruct the original field.

For the **Minimal Surface Study** starter, follow Graph → Curve → Surface in the Project's **Relations** view, then open the saved derivative result and its Notes. The starter demonstrates recorded lineage and persistence. It does not by itself prove a surface is minimal: that would require an appropriate mathematical test and stated numerical qualifications.

## Common uncertainty cases

- **Sampling and discretization:** record resolution, valid and excluded samples, convergence or refinement evidence, and the physical quantity's units. A finer image alone is not a convergence check.
- **Numerical solver:** record precision and absolute/relative tolerance where supplied; inspect failure and cancellation diagnostics. A tolerance parameter controls a procedure and does not certify the final physical error.
- **Statistical fit:** distinguish mean-response confidence limits from individual prediction limits and keep assumptions visible. The [Graph regression guide](../../graph2d-g39-regression-uncertainty.md) states its model, exclusions, and interval assumptions. Its fit is transient and must be rerun after a source change.
- **Exact or symbolic computation:** inspect the exact input and algebraic operation. A sampled visualization of an exact object has its own approximation and display limits.

When publishing or sharing, include the source generation, method, parameters, units, warnings, and unavailable-resource notes alongside the number or image. The Project's saved Result and Note links are more reliable than a screenshot without provenance.
