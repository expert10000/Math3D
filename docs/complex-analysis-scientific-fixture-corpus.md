# Complex Analysis scientific fixture corpus

Commit C01 freezes the current Complex Analysis surface before the professional
kernel migration starts. The machine-readable source of truth is
`tests/fixtures/complex-analysis-v1/scientific-corpus.json`.

## Evidence classes

Every fixture declares both an evidence class and a named oracle:

- **exact** records a discrete mathematical invariant, such as a sheet
  permutation, deck action, generalized-circle kind, or the Riemann-sphere point at
  infinity;
- **numerical** compares evaluated values or contour integrals with a stated
  closed-form theorem and an explicit absolute tolerance;
- **illustrative** checks that a sampled 3D mesh or interactive control remains
  finite and reachable. It is never accepted as a proof of analytic, topological,
  or numerical correctness.

Pixel snapshots are intentionally absent from the scientific oracle. A rendered
image may support visual regression work, but it cannot upgrade an illustrative
fixture to exact or numerical evidence.

## Frozen corpus

The function cases cover `1/z`, `1/(z^2+1)`, `sin(z)/z`, `exp(z)`, `log(z)`,
`sqrt(z)`, `z^(1/3)`, and `sqrt(z^2-1)`. Contour cases exercise the residue theorem,
cancellation of paired residues, removable singularities, and Cauchy's theorem for
an entire function.

Exact cases freeze logarithmic monodromy, square- and cube-root sheet actions,
the two branch points of `sqrt(z^2-1)`, exponential and power-map fibers, deck
transformations, Möbius generalized-circle mapping, and the Riemann-sphere infinity
convention.

The illustrative contract keeps the existing Function Explorer, Möbius, Riemann
Sphere, Residue, Branch, and Covering lab entry points. It also inventories domain
coloring, grid deformation, vector and level overlays, contour bands, all current
path modes and branch-cut profiles, sheet/loop animation, fiber inspection, deck
transformations, and all five 3D value-surface quantities.

## Verification

Run the focused C01 gate with:

```powershell
npm run test:complex:c01
```

The unit stage evaluates the mathematical fixtures. The Electron stage verifies UI
reachability and labeling only. TypeScript and the renderer production build are
part of the same gate so the frozen corpus cannot silently drift out of the shipped
application.
