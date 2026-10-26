# SCI-12 numerical golden fixture: 80³ vortex

`output/scientific-vortex-80-overview.sscene` is a deterministic, analytic velocity field, not an observation. The [v3 scene notes](scientific-scene-tiled-v3.md) describe its tiled source and verified overview. The numerical test reads the committed 80³ physical tiles, checks each tile and resource SHA-256, and reconstructs the same bounded 32³ transfer used by Explorer. Core then checks the transfer checksum, source fingerprint, component references, and tile coverage before calculating derived values.

Run `npm run test:scientific:golden`.

## Independent oracle

Coordinates are in metres and velocity components in m/s. With `t = x²+y²` and `a = 16/(16+t)`:

```text
F = (-y a, x a, sin(z)/4)
div F = cos(z)/4
curl F = (0, 0, 512/(16+t)²)
q = |F|² = t a² + sin²(z)/16
∇|F| = ∇q/(2√q)
Δ|F| = Δq/(2√q) - |∇q|²/(4q^(3/2))
q_t = 256(16-t)/(16+t)³
∇q = (2x q_t, 2y q_t, sin(2z)/16)
Δq = 1024(256-64t+t²)/(16+t)⁴ + cos(2z)/8
```

The `|F|` derivatives apply where `|F| > 0`. The test chooses points away from a zero-speed singularity. Explorer correctly labels its three-point finite differences as approximate.

| Quantity | Interior absolute error limit | One-sided boundary limit | Unit |
| --- | ---: | ---: | --- |
| Divergence | 0.004 | 0.012 | 1/s |
| Each signed curl component | 0.015 | 0.035 for z component | 1/s |
| Each component of `∇|F|` | 0.018 | 0.055 | (m/s)/m |
| `Δ|F|` | 0.12 | 0.30 | (m/s)/m² |

Three interior and three one-sided boundary points check the probe calculation. XY, XZ and YZ derived maps each check an independently calculated value, method metadata, source hash, and verified transfer coverage. A forged tile-coverage claim must fail before a derived map appears. These limits apply to the bounded 32³ sampling lattice of this fixture; they are regression limits, not certified truncation-error bounds or general accuracy guarantees.

## SCI-05 trajectory oracle

For the seed `(1,0,0)`, the analytic physical-time path has radius one, angle `16t/17`, and `z=0`. A normalized field line has angle equal to its arc-length parameter. The test checks both against the verified 32³ interpolation with a `0.02 m` endpoint tolerance at parameter one. It also checks a boundary stop at `y=4 m`; solver and interpolation errors are distinct.

Explorer offers **Exploratory** (`10⁻⁴`), **Balanced** (`10⁻⁶`) and **Precise** (`10⁻⁸`) paired absolute/relative integration tolerances. Manually edited values are shown as **Custom**. These settings control the ODE solver and do not recover detail absent from the sampled source lattice.

## SCI-06 provenance in derived views

Full-volume slices, probes and local calculus report each component's verified sample SHA-256 and either its checked tile/chunk count or full-resource verification. Sparse slice and probe paths retain per-transfer coverage. Derived maps identify boundary stencils and invalid samples. For v3 scenes, derived slices and Graphs profiles now use immediate source-grid neighbors at each bounded output cell; [source-grid stencil measurements](scientific-source-grid-stencils.md) compare accuracy and latency with the prior bounded-grid method. V1 remains on its full-resource path, and standalone point calculus still uses the bounded transfer.
