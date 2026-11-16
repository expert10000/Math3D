# MESH-05 and CA-05 Project save diagnostics

Status: **two expected failures, not acceptance PASS**. Local Windows source-built Electron run, one worker, zero retries. Test/harness commit: `24504158`. The reused renderer build identity reports production source `a6a37d02d8c1ab1dc97ef847a469776bb6602cc0`; no production code changed between that build and the test/harness commit. The scoped CI workflow rebuilds from its exact checkout when it runs.

Command: `npx playwright test tests/e2e/workbench-project-lifecycle-gaps.spec.ts --workers=1 --retries=0 --reporter=list`.

| Gate | UI action | Observed saved Project state | Desired assertion |
| --- | --- | --- | --- |
| MESH-05 | Box → Smooth, 2 iterations, `New object`, VTK success, then Save | One Mesh entry, same document ID at r2 after r1 source; one replay transaction; no source-to-derived relation. Original checkpoint resource SHA-256 stays fixed. See [mesh-new-object.json](mesh-new-object.json). | Distinct result document ID and explicit source-to-derived relation. |
| CA-05 | Residue Lab, `1/z`, Publish numerical analysis, then Save | F06 Inspector shows numerical result at r4, method and error estimate; saved Complex source is `1/z` at r4, but no matching `workspace.results` entry. See [complex-numerical-project.json](complex-numerical-project.json). | Source-qualified numerical result retained in Project. |

The tests mark only their final desired assertions as expected failures. Setup, worker execution, publication and Project save must succeed normally. If a fix makes a desired assertion pass, Playwright reports an unexpected pass until the expected-failure marker is removed and the full reopen journey is added. These diagnostics do not cover cold reopen, sidecar withholding, stale history or installed-app execution.
