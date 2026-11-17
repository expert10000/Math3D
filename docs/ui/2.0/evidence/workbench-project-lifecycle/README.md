# MESH-05 and CA-05 Project lifecycle evidence

The JSON files below record the **pre-fix failures** at test/harness commit `24504158`. The original local Windows source-built Electron run used one worker and zero retries. Its reused renderer build identity reports production source `a6a37d02d8c1ab1dc97ef847a469776bb6602cc0`.

The production fix creates a distinct Mesh document and `derived-from` relation for `New object`, preserves the source document, and includes published Complex numerical result envelopes and `analysis-of` relations in Project capture. The acceptance command is `npx playwright test tests/e2e/workbench-project-lifecycle.spec.ts --workers=1 --retries=0 --reporter=list`. Local source-built Windows Electron: **2/2 passed**, one worker, zero retries. The scoped CI workflow rebuilds its exact checkout and uploads the native test report.

| Gate | UI action | Observed saved Project state | Desired assertion |
| --- | --- | --- | --- |
| MESH-05 | Box → Smooth, 2 iterations, `New object`, VTK success, then Save | One Mesh entry, same document ID at r2 after r1 source; one replay transaction; no source-to-derived relation. Original checkpoint resource SHA-256 stays fixed. See [mesh-new-object.json](mesh-new-object.json). | Distinct result document ID and explicit source-to-derived relation. |
| CA-05 | Residue Lab, `1/z`, Publish numerical analysis, then Save | F06 Inspector shows numerical result at r4, method and error estimate; saved Complex source is `1/z` at r4, but no matching `workspace.results` entry. See [complex-numerical-project.json](complex-numerical-project.json). | Source-qualified numerical result retained in Project. |

The tests exercise UI setup, VTK execution, Complex publication, Project save and a renderer reload. The saved identities, result and relations survive the reload. Opening the Project is correctly withheld when required binary sidecars are unavailable; the tests verify that qualified state. A full cold reopen with a transferred sidecar archive, stale history and installed-app execution remain separate acceptance work.
