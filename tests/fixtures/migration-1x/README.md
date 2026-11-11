# Release-tree migration specimens

`manifest.json` pins the exact SHA-256 bytes and Git blob ID of each checked-in artifact. For each row, `git rev-parse <release>:<path>` matched the blob in this checkout before the corpus was added. The 1.6.0 tree contains a Graph handoff whose own producer string says 1.5.0; that string is not treated as proof that a 1.5.0 Project export exists. The two named Projects occur unchanged in the v1.7.0 tree.

No saved Project export was found in the v1.4.x or v1.5.0 release trees. The later `platform-v1.5.0` regression fixture was not present in the v1.5.0 tag and is not relabeled as a historical Project. The named v1.7.0 artifacts lack Notes and Workbooks. Current-schema Study/Workbook/Note tests cover those fields separately, without claiming historical producer coverage.

Run `npx vitest run tests/unit/m3d20MigrationCorpus.test.ts --maxWorkers=1` and `npx playwright test tests/e2e/project-migration-corpus.spec.ts --reporter=list` from the repository root. A passing test preserves the semantic fields and refuses damaged inputs; it does not certify an installed 1.x to 2.0 application upgrade.
