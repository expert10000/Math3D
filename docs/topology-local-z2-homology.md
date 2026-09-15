# Topology local Z/2Z homology

T07 provides immediate finite-field homology feedback from the shared canonical
pipeline.  It is an exact calculation over the field `Z/2Z`, not an approximation
and not an integral-homology or torsion calculation.

## Authoritative path

```text
TopologyDocument source generation
  -> T03 canonical finite 2-complex
  -> T04 structural/algebra gate
  -> T06 exact sparse integer boundary artifact
  -> T07 bounded sparse reduction modulo 2
  -> compact F06 AnalysisResultEnvelope
```

The result contains the coefficient field and characteristic, chain dimensions,
ranks of `d1` and `d2`, Betti dimensions `beta0` through `beta2`, group notation,
algorithm/engine provenance, exact source revision/hash/generation, and the T06
matrix handle.  Matrix bytes and reduction workspace are never embedded in the
result record or persistent Topology source.

## Bounds and failure behavior

The local engine enforces reviewed cell, nonzero-entry, and reduction-step limits.
A limit produces an explicit `unsupported` result without partial Betti numbers.
Malformed matrices fail, stale source generations are withheld, and only a T06
`topology.cellular-boundary-d1-d2` artifact handle is accepted.

The Algebra view labels the new result `Local finite-field feedback`, always shows
`Z/2Z`, and states that the output does not compute integral homology or torsion.
T08 remains the planned constrained Sage path for integral homology and Smith normal
form under its own provenance.
