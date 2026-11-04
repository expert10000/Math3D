# GF-20–22 implementation checkpoint

## GF-20: checked Graph diagnostics

Graph regression already provides residual tables, residual standard deviation, and pointwise intervals where the fitted model supports them. Nonlinear fits explicitly decline parameter uncertainty. The existing checked Fourier worker now also computes a one-sided, window-energy-normalized periodogram and mean-centered biased autocorrelation for each selected channel. Its original point-table checksum, row cap, uniform spacing, gap rejection, declared units, detrending, and window choice still govern admission. A constant series has undefined normalized autocorrelation. The result records method names and units, shows two plots and bounded diagnostic rows, and exports a separate provenance-bearing CSV. PSD is an estimate, not a confidence interval; zero padding does not create independent information. Cross-correlation and spectrogram remain later work.

## GF-21: Cartesian frame and unit contract

The versioned contract reads the existing vector source's Cartesian axes, component units, time unit, source ID, revision and structural hash without changing its Project encoding. Explicit plans convert only known length units (`mm`, `cm`, `m`, `km`) and time units (`ms`, `s`, `min`, `h`). All three axes must use one source length unit and one target length unit. Components must be coordinate units per time. Point, vector, time, and Jacobian scalings follow the declared physical dimensions; exports must name target physical units. Unknown legacy units remain readable but cannot be converted. Cylindrical, spherical, affine, mixed-dimension, and mixed-axis-unit plans are rejected pending source-schema, calculus and export validation. The Field Explorer inspector offers a read-only conversion preview; it never silently rewrites coordinates or field expressions.

## GF-22: discrete temporal source contract

The Project now supports an optional collection of versioned temporal source documents. Each pins 2–64 distinct saved analytic 3D vector source generations to strictly increasing physical times. Frames must share Cartesian axes, bounds, component units, and time unit. The time-axis contract states `discrete-frames` sampling and `none` interpolation, with per-frame Cartesian calculus and per-frame source lineage for export. Exact-time lookup returns the pinned frame; between-frame lookup refuses a value. Project save/reopen preserves the collection, and changed or missing frames withhold it. Existing Projects without the collection retain their schema and behavior. Verified bundled frames, temporal interpolation, probes, slices, physical pathlines, and streaklines need later independent numerical gates.

## Gates still open

The verified bundled-source magnitude → slice → profile foundation exit gate remains open. GF-18 scientific-source alignment and comparison-profile Graph export remain open. Neither is implied by these three first gates.
