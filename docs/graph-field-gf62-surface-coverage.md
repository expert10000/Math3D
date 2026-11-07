# GF-62: saved manifold atlas surface coverage

GF-60 counted cells inside projected chart bounding boxes. GF-62 reads the exact saved GF-58 base and GF-60 refined Mesh sidecars and tests their triangles in physical coordinates. The refined atlas must retain every base vertex and triangle and add one chart within the saved domain.

The bounded gate samples projected triangle occupancy at 16×16 and 32×32 cell centers. It records occupied cells, boundary gap cells, and the longest run of gaps at each resolution. Refinement must gain occupied cells at both resolutions. For new chart triangles that overlap the base projection, it measures nearest three-dimensional base-triangle distance at centroids and then at centroids plus edge midpoints. The fine maximum and coarse-to-fine RMS change must fit the saved overlap tolerance. Evaluation is capped at 2 million triangle tests and supports cancellation.

The saved `vector3d.manifold-surface-coverage` result pins the source, both atlas result IDs, both Mesh IDs and checksums, domain, projection axes, method, units, both resolutions, boundary gaps, overlap samples and tolerance, and work count. Reopen retains this evidence but withholds current values until the exact Mesh bytes are verified. Changing the source, atlas or bytes withholds the result. Mobile retains the recipe and announces the withholding reason without verifying the scientific Mesh values.

Projected occupancy is a local coverage diagnostic. It can hide folds, multiple sheets and gaps along the projection direction. Triangle area sums include overlap. The global manifold claim remains withheld. GF-61's human TalkBack listening check remains deferred until the phone is available.
