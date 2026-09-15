# ComplexAnalysisDocument v1

`ComplexAnalysisDocument` is the versioned, serializable mathematical authority for
the Complex Analysis workspace. It lives in `@math3d/core` so renderer panels,
workers, persistence, commands, and future exact-analysis adapters can share one
contract.

The structural hash covers the normalized expression AST, parameters, assumptions,
domain and sampling policy, contours and paths, branch policy, covering definition,
and Möbius transformation. Result references and migration provenance are recorded
but do not alter the mathematical source hash.

The following values are deliberately outside the document: panel layout, active
inspector tab, animation progress, hover targets, and drag previews. They are
transient view state and cannot become mathematical authority merely by appearing
in a UI store.

Legacy lab state is accepted only through a controlled adapter that receives a
validated AST parser. The adapter does not persist executable functions and will
not accept raw expression text alone. Unsupported input returns the
`complex.legacy.unsupported` diagnostic with a recovery action.

The current schema can be validated and round-tripped with
`normalizeComplexAnalysisDocument`, `serializeComplexAnalysisDocument`, and
`deserializeComplexAnalysisDocument`. All deserialized documents are immutable
canonical-JSON clones with an identity hash verified against their complete
mathematical source.
