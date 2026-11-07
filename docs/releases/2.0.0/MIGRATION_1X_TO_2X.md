# 1.x Project migration in the 2.0 application

Math3D 2.0 keeps `math3d.project` schema v1 as the canonical named Project envelope until the architecture freeze authorizes a new persisted schema. The application upgrade does **not** imply a Project schema bump. `Math3DProject` remains the owner of identity, its mixed workspace, Notes and Workbook references; document and result identities remain inside that workspace. Saved analysis is retained as recorded evidence, without a new verification claim.

## Supported input path

| Input | Source version | Action | Output |
| --- | --- | --- | --- |
| Named `math3d.project` | 1 | Validate and open unchanged | Project v1 |
| `math3d.project-package` | 1 | Validate Project and source sidecars | Project v1 plus verified resources |
| `math3d.mixed-workspace` | 1 | Explicit preview and adoption | Project v1 |
| `math3d.project-handoff` | 2 | Verify handoff identity, hash and capabilities; explicitly adopt | Project v1 |

The migration function reports source format/version, target format/version, the exact original string, and a deterministic Project. It validates the source before adoption. A legacy workspace is wrapped without editing its entries, expected document identities, results, artifacts, relations or selections. Repeating migration with the same bytes and title produces the same Project ID and content. The desktop/browser import sheet shows the versions, documents and resources before import/open, and can download the original file. A successful library import stores the original bytes in `math3d.project.v1.payload.<project-id>.migration-source` in the same rollback protected write as the Project. Mobile preview records keep `migrationOriginal` when directly importing a legacy workspace or handoff.

Existing named Project JSON and packages are parsed as their own formats. Legacy scene projects (`math3d.scene-project`), Workbook sessions and handoff v1 have separate existing readers and are not promoted into this named Project path. Unknown/future envelope versions, unknown Project fields, corrupt JSON, missing required fields, invalid hashes, divergent replay and unverified package source bytes are refused. A Project with unavailable optional artifacts may still be previewed with those artifacts shown unavailable. Missing required source sidecars prevent a full workspace open.

## Supported portability subset

The verified round trip covers a checkpointed Graph workspace with no external source sidecar: historical workspace → desktop import preview → canonical Project JSON → browser import preview → mobile saved preview/export → desktop import preview. The checks compare Project and document identities, checkpoint content and serialized Project bytes. Mobile retains its imported legacy bytes in its saved preview record. Browser UI verification checks review, original download and library preservation. Resource-bearing package import/export follows the existing Project package validator; this work does not claim general mobile editing or full platform parity for every module and external quantum/scientific scene.

## Corpus and verification

`tests/fixtures/migration-1x/` pins a captured 1.x workspace and truncated, missing-field and future-version refusal inputs. `tests/unit/projectMigrationCorpus.test.ts` also checks a valid and tampered Graph handoff. `tests/unit/projectMigrationPortability.test.ts` exercises the supported cross-platform format path. The browser acceptance case is in `tests/graph2d-web/unifiedProjects.spec.ts`.
