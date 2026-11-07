# SAGE-G08 affine and projective geometry acceptance

Open **CAS → Structures → + New scheme**, choose a saved ideal, and save `Spec(R/I)` or `Proj(R/I)`. The constructor pins the ideal and its ambient ring by object ID and revision. It accepts at most three affine coordinates or two to four projective homogeneous coordinates in a direct `QQ` polynomial ring, with at most six generators of at most 128 characters each. Projective generators must be provably homogeneous and the ambient monomial order graded. Invalid rings, mismatched references and nonhomogeneous ideals fail before save or import.

The scheme preserves the full ideal presentation. In particular, `Spec(QQ[x]/(x²))` remains nonreduced; it is never silently replaced by its radical or by a set of real points. A projective scheme can save a chart `D₊(xᵢ)`. The chart derives its affine coordinates and exact equations by substituting `xᵢ = 1`, and can save a canonical chart inclusion map back to its pinned projective scheme. The UI displays the map as homogeneous coordinates with the selected coordinate normalized to one. Arbitrary morphism formulas, general scheme computations and projective numerical plotting are outside this bounded G08 contract.

An affine scheme can open its pinned ideal in the existing real-locus builder. That is a separate bounded numerical request, with the ideal's identity and revision retained; the scheme object itself is not a numerical sample. Ring revisions mark their dependent ideals, schemes, charts and maps stale through the Project dependency graph.

Exact fixtures: `Proj(QQ[x,y,z]/(x²+y²−z²))` has `z ≠ 0` chart equations `x²+y²−1` and inclusion coordinates `[x:y:1]`. A separate `Spec(QQ[x]/(x²))` fixture verifies nonreduced structure survives export and independent import. Invalid nonhomogeneous projective generators, coordinates outside the homogeneous ring, and map targets that do not match the chart's parent are rejected.

Acceptance results (2026-11-06): the focused core gate passed all three tests, including equality of all nine algebra records after independent Project import. `npm run typecheck:noemit` and `npm run build:core` passed. The new desktop Playwright gate passed scheme, chart, map, real-locus handoff, Project save and fresh-session reopen. The existing C01 ideal Inspector and F01/F02 algebraic-locus desktop gates also passed. G08 exact objects and charts do not require a Sage runtime. The live B08 Docker Sage 10.10 comparison remains open.

Next: **SAGE-H01**, a capability-aware mathematics command palette.
