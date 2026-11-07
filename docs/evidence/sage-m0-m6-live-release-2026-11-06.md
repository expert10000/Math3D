# M0–M6 current Sage release gate — 2026-11-06

Both configured routes were available: WSL Ubuntu reported SageMath 9.5, and the rebuilt `math3d-sage-worker` health endpoint reported SageMath 10.10 with its typed operations and worker policy. The [machine-readable run record](sage-m0-m6-live-release-2026-11-06.json) identifies the tested source base and exact counts.

| Gate | Result | Scope |
|---|---:|---|
| [B08 exact comparison](sage-b08-live-2026-11-06.json) | 16/16 WSL, 16/16 Docker; 0 differences | Polynomial dossiers, matrices, Smith/Hermite, invalid inputs and unavailable cases. Run with `--require-docker`. |
| `npm run test:sage:f08` | 6/6 desktop tests | Real-route M0 symbolic/CAS/Number Theory flows, trusted Console and Workbook code, cancellation, error, export and fresh-profile import. Builds main and renderer first. |
| WSL Sage service discovery | 78/78 tests | Real Sage 9.5 operations covering M1–M6 algebra objects, ideals, number fields, groups, modules, homology, finite fields, p-adics, local extensions and elliptic curves. |
| Docker Sage service discovery | 78/78 tests | Same suite on Sage 10.10, with repository mounted read-only for shared fixtures. |
| M1–M6 desktop cohort | 28/28 tests across 21 files | Current Structures, Recipes, Inspector, computation panels and independent Project reopen paths. Some UI tests use controlled Sage responses; their arithmetic is covered separately by both real service suites. |

The Docker image copies `service/` but omits shared `tests/fixtures/`. Running discovery inside the unmounted image produced three fixture-path errors after 75 other tests ran. The complete Docker gate passed with the repository bind-mounted **read-only**, leaving the built worker image unchanged:

```text
docker run --rm --mount "type=bind,source=C:\Users\janko\OneDrive\Dokumenty\Math3D-Sage-CAS-roadmap,target=/math3d,readonly" --workdir /math3d/services/sage-worker sage-worker-sage-worker sage -python -m unittest discover -s service -t . -p 'test_*.py'
```

The first M1–M6 desktop cohort run exposed four stale assertions: a Number Field button locator also matched its tower node, local-extension and p-adic tests assumed evidence array order after import, and a Services test expected an old provenance separator. Their assertions now select the relevant object or saved study and check the current explicit source/revision label. Each affected test passed on rerun, followed by a clean **28/28 full cohort** run. No production behavior was changed for those test fixes. The end-to-end test TypeScript check passed.

`npm run check:sage:release` now verifies the SHA-256 of this record and the linked B08 output, then reports `currentLiveGate: recorded-passed`. Its `liveExecutionNow: not-run` field means an audit invocation reads evidence; it does not itself execute the suites again. A future release build needs its own fresh run.

After merging the concurrently added Surface retention and manifold-coverage commits, the merged app was rebuilt and `npm run test:sage:f08` passed **6/6** again. Six targeted desktop cases for exact-source locus, local extensions, Number Field, and Structures/Inspector reopen also passed **6/6**. The 28-case M1–M6 cohort was run as a clean suite on the recorded `e234c891` source base plus the four acceptance-assertion fixes; it was not rerun in full after the later unrelated Surface merge.
