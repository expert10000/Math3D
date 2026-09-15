# Topology surface eligibility and classification

T10 provides the shared-core authority for classifying a canonical finite 2D complex
as a connected compact surface, optionally with boundary. A name, preset identity,
or R3 realization is never an input to this computation.

## Publication gates

Classification is published only after all six visible gates pass:

1. the canonical complex is finite, nonempty, and two-dimensional;
2. its canonical one-skeleton is connected;
3. every edge link has one point (boundary) or two points (interior);
4. every vertex link is an interval or circle;
5. the boundary graph is a disjoint union of circles; and
6. the cellular Euler characteristic yields a valid integer genus or crosscap
   number after orientability and boundary count are known.

T04 structural validation remains the prerequisite. Invalid canonical references,
attachments, incidences, or chain data produce an `unsupported` F06 result rather
than a partial classification. A structurally valid non-manifold produces a
`certified` result whose `eligible` value is false: the failure itself is certified,
while the surface name remains withheld.

## Certificates and provenance

Orientability is determined by signed face-orientation propagation across interior
edges. Conflicting constraints identify the canonical edges that certify
non-orientability. Boundary components are counted from the certified boundary
subgraph. Classification then uses

```text
orientable:     chi = 2 - 2g - b
non-orientable: chi = 2 - k - b
```

The compact result envelope records source document/revision/hash/generation,
canonical hash, algorithm/version, shared-core engine identity, eligibility values,
Euler characteristic, boundary count, orientability, and the resulting family and
index. Failed gate records retain canonical cells and authored source references.

## UI behavior

Topology **Algebra View** displays every gate as PASS or WITHHELD, the formal label
only when eligible, boundary/orientation evidence, and the result provenance. Failed
edge or vertex prerequisites expose both canonical-cell inspection and direct
Diagram-source location controls. Existing teaching labels and realizations remain
available but cannot promote themselves to computed classification.
