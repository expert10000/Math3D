# Implicit contour preview: numerical scope

The Graph formula preview uses the same bounded implicit sampler as the workspace. It reports sampled branches, closed/open/clipped paths, ambiguous and unresolved cells, evaluations, local subdivisions, cell resolution, viewport, and elapsed time. A sampled closed path is not a proof of topology.

## Current method

- Marching squares shares edge identities across cells. Four-crossing cells use the bilinear asymptotic decider; nearly singular decisions remain unresolved rather than joining branches arbitrarily.
- A small interval screen handles constants, variables, arithmetic, integer nonnegative powers, `abs`, nonnegative `sqrt`, and `exp`. If its range excludes zero, a same-sign cell can be skipped. A cell that may contain zero is subdivided locally within the preview's sample, depth, and time budgets. This can reveal small loops missed by corner signs.
- Unsupported functions have no interval exclusion. The sampler may use a local corner-value heuristic to refine, but it makes no topology claim from that heuristic.
- A same-sign cell that remains uncertain at the work limit is reported as unresolved. Exact sampled zero vertices are displayed as *possible* isolated zeros or tangencies. Neither is certified as a unique zero.
- The reported pixel figure is the largest sampled contour-cell diagonal. It describes geometric resolution, not a bound on root position or function error.

## Further work for certified contours

Outward-rounded interval evaluation for the full expression grammar, interval gradients, and an adaptive subdivision criterion are needed before the UI can claim that a cell is zero-free or that a contour's topology is certified. Near-singular and nonregular zero sets need a separate policy; simply raising the sample budget does not resolve them. Compare the interval-based isotopic approach of [Plantinga and Vegter (2004)](https://www.math.rug.nl/~gert/documents/2004/pv-sgp-2004.pdf) and the [asymptotic decider of Nielson and Hamann (1991)](https://graphics.stanford.edu/courses/cs164-10-spring/Handouts/paper_p83-nielson.pdf).
