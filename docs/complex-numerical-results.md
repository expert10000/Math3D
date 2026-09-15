# Complex numerical results (C06)

C06 keeps the existing Residue/Path Lab calculations as immediate previews and adds
an explicit publication step for scientific numerical evidence.

## UI location

Open **Complex Analysis -> Residue Lab**, choose the **Residue** inspector tab, and
select **Publish numerical analysis**. The blue F06 inspector reports:

- numerical status and the explicit “not proof” evidence boundary;
- exact source revision, method, engine, tolerance, and error estimate;
- valid/attempted sample counts;
- branch-cut crossings and near-pole diagnostics;
- F07 artifact availability.

The older inline integral, residue, winding, and Laurent displays remain visible.
They are labelled as legacy numerical previews until published because they do not
carry a complete F06 result envelope.

## Scientific contract

`publishComplexNumericalAnalysis` accepts only a validated
`ComplexAnalysisDocument`. It compiles its normalized AST through the safe preview
compiler, computes centered finite-difference agreement, rational pole candidates,
nested trapezoid contour quadrature, winding, branch-cut crossings, and pole
proximity. It publishes compact metadata through `AnalysisResultEnvelope`; sampled
arrays are never embedded in the result.

The status is always `numerical`. Agreement within tolerance never promotes this
record to `exact` or `certified`.
