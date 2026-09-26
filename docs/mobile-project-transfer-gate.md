# MOB68 project-transfer gate

The checked-in golden fixtures in `tests/fixtures/projectHandoffGolden.ts` and focused Vitest matrix cover legacy scene-project migration; project/handoff future versions and corrupt hashes; semantic formulas, domains, resolution, metadata, IDs and mobile edits on the return leg; mesh-only compatibility warning; diverged revision copy/replace behavior; storage failure and picker cancellation; native export read-back and share invocation. Existing `mobileMeshImport`, `mobileSceneObjectImport`, and `mobileProjectComposition` suites cover OBJ/STL/PLY/GLB/glTF parsing and collision-safe remapping.

Run the local gate with:

```powershell
npx vitest run tests/unit/projectHandoff.test.ts tests/unit/projectTransferMatrix.test.ts tests/unit/mobileProjectHandoff.test.ts tests/unit/mobileProjectTransfer.test.ts tests/unit/mobileProjectTransferService.test.ts tests/unit/mobileSceneStorage.test.ts tests/unit/mobileMeshImport.test.ts tests/unit/mobileSceneObjectImport.test.ts tests/unit/mobileProjectComposition.test.ts
npm --prefix apps/mobile run typecheck
```

The iOS companion workflow runs the import/share model and golden matrix tests before its unsigned simulator build. It is an iOS build/model gate, not evidence that a native document picker or share sheet was operated on iOS hardware. That native interaction remains a separate release-signoff check.

## Android USB smoke — 2026-09-26

Samsung SM-A566B (`RZCY71087BY`) on USB. An internal `1.5.1` (`150007`) APK was signed with the established internal certificate and installed over `com.math3d.mobile.internal` using `adb install -r`. The app launched with existing data intact. From Projects, Export opened the Android document-provider directory picker; selecting Documents wrote a `.math3d.handoff.json` file. New Project → Desktop project opened the document picker, read that file, displayed project/revision and conflict options, and **Import as copy** created a separate project without replacing the original. Share opened Android's native share sheet with the handoff filename. No `AndroidRuntime` or `ReactNativeJS` fatal/error entries appeared in the sampled logcat output. This verifies the platform I/O paths; it is not a full manual semantic-edit round trip.
