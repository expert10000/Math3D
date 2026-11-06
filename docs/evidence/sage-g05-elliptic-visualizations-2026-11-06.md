# SAGE-G05 elliptic curve visualization acceptance

Open a saved G04 elliptic curve in **Number Theory or CAS → Structures**. A curve over `QQ` shows **Real-coordinate curve · numerical sample** with bounded editable x limits and separate upper and lower branches. When the selected Project has saved G04 evidence for an integer point, the view overlays `P`, its exact tangent, the third intersection `R` and the reflected `2P`. A vertical tangent is labelled as doubling to the point at infinity. The sample is explicitly marked numerical and potentially incomplete as a real-curve representation.

A curve over prime `GF(p)` shows **Discrete GF(p) coordinate diagram · complete enumeration** for p ≤ 31. It plots exact residue pairs as unconnected points, lists the point at infinity `O`, and reports the complete group order. Saved G04 point evidence may highlight `P` and `2P`, but the view never draws a continuous chord or tangent. Fields with 31 < p ≤ 1009 remain valid G04 objects and operations; the diagram states its p ≤ 31 limit.

Both views are deterministic projections of the pinned curve revision and saved point evidence, so Project export and independent import restore the same visualization without a second serialized plot snapshot. The real sample checks nonnegative cubic values and splits disconnected real branches. The finite-field diagram checks every coordinate against the short Weierstrass equation modulo p; the result is complete within its stated bound. UI labels and SVG accessible names distinguish real geometry from modular arithmetic.

Fixtures: `E/QQ: y²=x³−x+1` has tangent slope `−1/2` at `(0,1)`, third intersection `(1/4,7/8)`, and reflected double `(1/4,−7/8)`. `E/GF(5): y²=x³+x+1` has eight affine points plus `O` (group order nine), with `(0,1)` doubling to `(4,2)` by modular arithmetic. The desktop gate selects both saved curves, checks the distinct SVG structure and labels, exports the Project and repeats the checks after fresh-profile reopen.

Acceptance results (2026-11-06): the G05 and G04 core Vitest selection passed six tests. The desktop Playwright gate passed, including fresh-profile Project reopen and SVG checks that the real view has separate sampled branches while the finite view has eight unconnected exact points. `npm run typecheck:noemit` and `npm run build:core` passed. Visual inspection of both captured SVG views confirmed the real tangent/reflection labels and the discrete GF(5) residue diagram.

Next: **SAGE-G06**, advanced ideal invariants with explicit capability and budgets.
