# Post-1.6.0 continuation fixtures

These additions extend the existing Topology and Complex v1 corpora; they do not
replace them. Expected outputs are fixed from cellular chain complexes and the
residue theorem, rather than captured from the implementation under test.

`mathematical-regressions.json` adds four Topology and five Complex cases. The
Topology tests use the production canonical analysis pipeline and assert integer
homology, F2 dimensions, chain consistency, deterministic hashing, and refusal of
surface classification for these non-surface inputs. Degrees 17 and 18 extend the
existing degree-1-through-12 property matrix and distinguish integer torsion from
F2 parity. The two-component and two-loop cases exercise rank beyond a connected
single-generator example.

Complex tests use the production command adapter and numerical result publisher,
not a test-only integrator. They check reversed orientation, repeated winding,
an off-center circle excluding the pole, cancelling residues, and an enclosed
double pole with zero residue. Absolute tolerances are explicit. The analytic
oracle is exact; the sampled output remains numerical and revision-bound.
No pole lies on these contours. Branch crossing diagnostics do not serve as an
oracle for these single-valued rational functions.

`roadmap-evidence.json` maps every F/T/C/GK milestone to representative code,
test, and documentation. A mapped test is evidence of that contract, not exhaustive
coverage of every UI or runtime obligation. Run from the repository root:

```text
node scripts/post160-roadmap-audit.mjs
node scripts/post160-roadmap-audit.mjs --run
```

The second command executes every mapped test and both new fixture consumers,
rejecting failed, skipped, or absent test evidence. Its JSON report is disposable.
Install the normal project dependencies in a fresh checkout first. Re-run after
rebasing onto the actual 1.6.0 release; update the audit findings separately from
mathematical expected values. Change an oracle only with a mathematical explanation.
