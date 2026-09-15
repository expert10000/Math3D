# Controlled Complex expression AST

C03 separates Complex Analysis expression handling into four explicit stages:

1. `parseComplexExpressionAst` tokenizes controlled source and builds a normalized,
   location-free AST.
2. `validateComplexExpressionAst` rejects unknown nodes, fields, variables,
   functions, operators, executable values, excessive depth, and excessive size.
3. `serializeComplexExpressionAst` and `deserializeComplexExpressionAst` round-trip
   canonical JSON with stable field ordering.
4. `compileComplexExpressionAstPreview` creates the renderer's fast numerical
   evaluator from an already validated AST.

The grammar remains deliberately small: finite decimal literals; `z`, `u`, and `v`
when allowed; constants `i`, `pi`, and `e`; unary minus; `+ - * / ^`; parentheses;
implicit multiplication; and the unary functions `sin`, `cos`, `tan`, `exp`, `log`,
`sqrt`, and `abs`. Powers with a non-real exponent remain non-finite in the preview,
matching the previous evaluator contract.

Diagnostics carry absolute source index plus one-based line and column. Empty input,
bad numbers, unknown identifiers, unsupported characters, missing operands,
mismatched parentheses, and invalid function arity fail before preview compilation.

This pipeline does not use `eval`, `Function`, `math.evaluate`, Sage text, or any
other source-to-executable path. Later symbolic adapters must translate the
validated AST structurally.
