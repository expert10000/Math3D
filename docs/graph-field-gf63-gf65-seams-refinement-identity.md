# GF-63–65 reviewable gates

## GF-63 — atlas seams and hidden gaps

The gate reads the saved GF-60 atlas Mesh and its verified GF-62 coverage evidence. Saved member vertex and triangle counts split the unwelded Mesh into charts; no shared vertex indices are assumed. For each chart boundary edge, the midpoint is compared with projected triangles on other charts. Physical point-to-triangle distance and oriented face normals identify matched edges, separated sheets hidden by projection, and orientation conflicts. Edges without projected overlap remain open boundaries. The result saves counts, maximum and RMS distances, tolerance, work count, source and Mesh checksums. It is withheld until both GF-62 Mesh resources are verified again after Project reopen. An analytic two-sheet fixture has identical projection but six hidden gap edges.

This is sampled, local seam evidence. Open boundaries can be intentional; the classification is inconclusive where gaps or orientation conflicts occur. No global manifold claim follows.

## GF-64 — bounded analytic atlas refinement

Starting from the pinned GF-63 result, each saved analytic member is recomputed with up to two more seeds, one additional ring, and halved absolute and relative solver tolerance. A member already at the 12-seed cap retains that count while refining rings and solver tolerance. The same accepted continuation time is used. Each recomputation records its recipe, evaluations, stop reason, and bidirectional physical vertex-to-triangle maximum and RMS error. If all members resolve within the 384-vertex, 768-triangle and one-million-comparison budgets, the gate also compares seam witnesses and projected triangle coverage at 16×16 and 32×32. A local convergence label requires bounded error and no worsening seam or coverage evidence; otherwise the saved result remains inconclusive. No global claim is published.

## GF-65 — guarded surface-event identity links

The gate replays verified GF-59 transport on exact pinned frames. For a one-to-one geometric component link, it advects bounded surface vertices forward and backward using checked midpoint velocity samples, then measures physical distance to the target and source triangles. A directed link is saved only when both directions fit the declared tolerance, the GF-59 witness is transport-consistent, and no competing component is within tolerance. Split, merge, appearance, disappearance, missing sampling and competing matches are explicit ambiguous records. It stores frame signatures, transport lineage, units, errors, ambiguity counts, and a 100,000-face-test cap. Project reopen and source change guard the result. Identity is supported only for the checked directed link: global material identity and surface interpolation remain unavailable, and playback stays on exact frames.

GF-61 human TalkBack listening and broader mobile physical-device signoff are deferred to the next mobile pass.
