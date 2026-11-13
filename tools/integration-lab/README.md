# Math3D 2.0 Integration Lab

The canonical hosted app remains the existing owner-private Site:
https://math3d-integration-lab.frizzylinden.chatgpt.site

Its Site ID is `appgprj_6aef5741f2e0819187587b1c704d8985`. Do not create a replacement Site. The source here uses the same app, validation, server and shared data model. It adds no Math3D Project, Job, AnalysisResult, SceneResource, runtime or Workbook/Notes owner.

## Run from the Math3D repository

Requires Node 24; no dependency installation:

```bash
cd tools/integration-lab
npm run build
npm test
npm start
```

Open `http://127.0.0.1:3000`. The local server binds to loopback by default. Local state and private JSON attachments stay in ignored `.sites-runtime/`. Import a workspace export to reuse existing private planning records; a blank local profile never impersonates the hosted database. The optional verified-history import includes public GitHub source-bound observations, not the private Site state or access credentials.

Historical reports remain linked to the private Site rather than copying its 146 MB evidence archive into Math3D. The portable build explicitly labels historical report links; it does not invent local historical evidence. Source changes in a GitHub PR do not automatically deploy the Site. Review and reconcile the shared files in the existing Site source checkout, run the Site build and checks, then publish that same private Site through its normal source-backed publication workflow. `SOURCE_MANIFEST.json` records exact hashes to detect drift. Do not copy credentials or `.sites-runtime` into Git.

## Shared records and evidence

- PRs reuse `changesets`: repository, PR URL, exact head and merge commits, tasks, contracts and checks.
- Executions reuse append-only `runs`, with optional versioned `integration` provenance: exact target SHA/kind, CI run/attempt, environment, workflow, scope identifiers, counts, linked checks/tests/tasks, tags, artifact references and private attachment hashes.
- Milestone acceptance uses append-only `reviews` of kind `baseline`; no parallel baseline database exists.
- Existing check statuses, behavior versions, policy, immutable runs and reviews are retained. Importing a scoped green journey does not certify every linked architecture check.

The Integration Lab views cover the evidence register, PR48 post-merge, native UI, stale-result/late-output rejection, save/cold-reopen, exact scope comparison and release baseline. Filters include PR, source target, exact SHA or text, environment and result. Compare two runs by exact scope identifiers; overlapping suites are never summed as unique tests.

## Honest outcomes

`passed`, `failed`, `blocked`, `missing`, `cancelled`, `incomplete` and `skipped` remain distinct. A passed CI workflow with no assertion report is **incomplete evidence**, while its original CI result remains visibly passed. Skipped, missing, cancelled, failed, flaky or incomplete cases never become complete acceptance. Counts must cover the expected scope exactly. A scoped PASS remains scoped. Source head evidence is never relabelled as a merge execution.

A rerun records a new immutable run and an attempt number; it does not start GitHub Actions or overwrite a previous failure. The UI says so explicitly. Keep actual timestamps and provenance when importing a new CI result. Imported runs use unknown semantic applicability until independently reviewed against the relevant check definitions.

## Attach and transfer evidence

Use **Add / import evidence** to attach Playwright or Vitest JSON. Review the derived counts and enter the exact source, PR, environment, check/test/task IDs and limitations. Original JSON is retained privately under a SHA-256 address in the existing storage binding, outside the 1.5 MB shared-state document. It is verified on upload, limited to 8 MiB, and downloaded as an attachment. Importing evidence records an observation; it never runs tests.

Use **Export evidence** for the versioned `math3d.integration-evidence` envelope. Repeat imports are idempotent for identical semantic evidence; conflicting immutable IDs are rejected. Complete workspace exports preserve all shared planning records. Attachment references retain their URLs and digests; they do not imply that bytes are portable to a different host or available offline. Download and reattach originals when moving hosts.

## Acceptance baseline and release

**Review milestone acceptance** requires a named reviewer and rationale, exact target and environments, and complete executed acceptance for all selected checks. Carry-forward reviews and scoped-only evidence are insufficient. The server independently checks a newly submitted baseline, so a fabricated accepted snapshot is rejected. A baseline preserves its accepted check snapshot and release-gate snapshot immutably; later changes require a new review.

Windows signing is tracked separately and remains blocked until a successful real signed-installer result is recorded. An accepted scientific milestone never silently closes that release gate. Cloudflare remains separate and excluded from this acceptance scope.
