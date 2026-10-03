import { instantiateMath3DProjectTemplate, serializeMath3DProject, structuralHash } from "@math3d/core";
import { importMobileProjectPreview } from "../models/mobileProjectPreview";
import { Directory, File, Paths } from "expo-file-system";
import { readMobileGraph, storeMobileGraph } from "../models/mobileGraphProject";
import { createMobileSceneStorage, createStoredProjectFromScene, decodeMobileSceneStorage, MobileSceneStorageError, MOBILE_SCENE_STORAGE_SCHEMA_VERSION } from "./mobileSceneStorage";

// Never accept a directory or filename from the UI. All intentional damage is confined here.
const directory = new Directory(Paths.document, "math3d-mobile-recovery-check");
const files = ["scene-projects.json", "scene-projects.backup.json", "scene-projects.tmp", "scene-projects.backup.tmp"];
const file = (name: string) => new File(directory, name);
const primary = () => file(files[0]!);
const backup = () => file(files[1]!);
const reportFile = () => file("recovery-check.json");
const store = () => createMobileSceneStorage(directory);
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const same = (actual: unknown, expected: unknown) => assert(structuralHash(actual) === structuralHash(expected), "Recovered project contents changed.");
const fixture = () => {
  const named = instantiateMath3DProjectTemplate("catenary-study", "native-storage-recovery-v1");
  const graph = named.workspace.entries.find(entry => entry.module === "graph2d")!.checkpoint;
  const record = storeMobileGraph(graph as Parameters<typeof storeMobileGraph>[0], 10, named.workspace, named);
  readMobileGraph(record);
  return [record, createStoredProjectFromScene({ id: "recovery-saddle", title: "Recovery saddle", createdAt: 1, updatedAt: 2,
    surfaces: [{ id: "saddle", kind: "explicit", expression: "x*x-y*y", resolution: 18, domain: { xSpan: 2, ySpan: 2 } }] }, 3),
    importMobileProjectPreview(serializeMath3DProject(instantiateMath3DProjectTemplate("scene-topology-study", "native-preview-recovery")), [], "recovery-preview.json", "desktop", 2)];
};
const reset = () => {
  directory.create({ idempotent: true, intermediates: true });
  for (const name of files) { const target = file(name); if (target.exists) target.delete(); }
};
const write = (target: File, text: string) => { target.create({ overwrite: true, intermediates: true }); target.write(text, { encoding: "utf8" }); };
const libraryFingerprint = async () => {
  const library = new Directory(Paths.document, "math3d-mobile");
  const result: Record<string, string | null> = {};
  for (const name of files) {
    const target = new File(library, name);
    result[name] = target.exists ? structuralHash(await target.text()) : null;
  }
  return result;
};
type Check = { name: string; passed: boolean; error?: string };
export type RecoveryCheckReport = { format: "math3d.mobile-storage-recovery.v1"; phase: "restart-pending" | "complete";
  startedAt: string; finishedAt?: string; fixtureHash: string; checks: Check[];
  libraryBefore: Record<string, string | null>; libraryAfter?: Record<string, string | null>; libraryUnchanged?: boolean };
let busy = false;
const exclusive = async <T>(action: () => Promise<T>): Promise<T> => {
  if (busy) throw new Error("Recovery check is already running.");
  busy = true; try { return await action(); } finally { busy = false; }
};
const saveReport = (report: RecoveryCheckReport) => write(reportFile(), JSON.stringify(report, null, 2));
const check = async (report: RecoveryCheckReport, name: string, action: () => Promise<void>) => {
  try { await action(); report.checks.push({ name, passed: true }); }
  catch (error) { report.checks.push({ name, passed: false, error: String((error as Error).message ?? error) }); }
};
const rejectsDamagedSave = async (storage: ReturnType<typeof store>) => {
  try { await storage.save([]); } catch (error) {
    assert(error instanceof MobileSceneStorageError && error.code === "recovery-required", "Unexpected save error."); return;
  }
  throw new Error("Saving replaced a damaged store.");
};

/** Real Expo files, production reader/writer, public fixtures; user-library files are read only. */
export const prepareMobileStorageRecoveryCheck = () => exclusive(async () => {
  const projects = fixture();
  const report: RecoveryCheckReport = { format: "math3d.mobile-storage-recovery.v1", phase: "restart-pending",
    startedAt: new Date().toISOString(), fixtureHash: structuralHash(projects), checks: [], libraryBefore: await libraryFingerprint() };
  await check(report, "first-save-backup", async () => {
    reset(); const storage = store(); await storage.save(projects); same((await storage.load()).projects, projects);
    same(JSON.parse(await backup().text()).projects, projects);
  });
  for (const damage of ["truncated", "missing", "blank"] as const) {
    await check(report, `${damage}-primary-repair`, async () => {
      reset(); const storage = store(); await storage.save(projects);
      if (damage === "missing") primary().delete(); else write(primary(), damage === "blank" ? " \n" : '{"schemaVersion":2,"projects":');
      const recovered = await storage.load(); assert(recovered.source === "backup", "Expected backup recovery."); same(recovered.projects, projects);
      const next = await store().load(); assert(next.source === "primary" && !next.issues.length, "Primary was not repaired."); same(next.projects, projects);
    });
  }
  await check(report, "damaged-backup-healthy-primary", async () => {
    reset(); const storage = store(); await storage.save(projects); write(backup(), "{broken-backup");
    const loaded = await storage.load(); assert(loaded.source === "primary" && !loaded.issues.length, "Healthy primary rejected."); same(loaded.projects, projects);
  });
  await check(report, "both-damaged-preserved", async () => {
    reset(); write(primary(), "{broken-primary"); write(backup(), "{broken-backup"); const storage = store();
    assert((await storage.load()).source === "invalid", "Damage reported as empty library."); await rejectsDamagedSave(storage);
    assert(await primary().text() === "{broken-primary" && await backup().text() === "{broken-backup", "Damaged files overwritten.");
  });
  await check(report, "blank-files-are-not-first-run", async () => {
    for (const contents of [[" \n", null], [null, " \n"], [" \n", " \n"]] as const) {
      reset();
      if (contents[0] !== null) write(primary(), contents[0]);
      if (contents[1] !== null) write(backup(), contents[1]);
      const storage = store(); assert((await storage.load()).source === "invalid", "Blank files reported as first run.");
      await rejectsDamagedSave(storage);
      assert(primary().exists === (contents[0] !== null) && backup().exists === (contents[1] !== null), "Blank files replaced.");
      if (primary().exists) assert(await primary().text() === contents[0], "Blank primary overwritten.");
      if (backup().exists) assert(await backup().text() === contents[1], "Blank backup overwritten.");
    }
  });
  await check(report, "newer-schema-preserved", async () => {
    reset(); const storage = store(); await storage.save(projects);
    const newer = JSON.stringify({ schemaVersion: 99, projects }); write(primary(), newer);
    assert((await storage.load()).source === "invalid", "Newer schema downgraded."); await rejectsDamagedSave(storage);
    assert(await primary().text() === newer, "Newer schema overwritten."); same(JSON.parse(await backup().text()).projects, projects);
  });
  await check(report, "legacy-array-migration", async () => {
    reset(); write(primary(), JSON.stringify(projects)); const storage = store(); same((await storage.load()).projects, projects);
    assert(JSON.parse(await primary().text()).schemaVersion === MOBILE_SCENE_STORAGE_SCHEMA_VERSION, "Legacy migration did not persist.");
  });
  await check(report, "recovery-save-queue", async () => {
    reset(); const storage = store(); await storage.save(projects); write(primary(), "{broken");
    const updated = projects.map(project => ({ ...project, lastOpenedAt: project.lastOpenedAt + 100 }));
    const loading = storage.load(); const saving = storage.save(updated); same((await loading).projects, projects); await saving;
    same((await store().load()).projects, updated);
  });
  // Leave actual damaged files on disk for a force-stop/relaunch before the second button.
  reset(); await store().save(projects); write(primary(), "{interrupted-primary");
  // Template result timestamps vary; persist the exact public fixture used in this run.
  write(file("fixture.json"), JSON.stringify({ schemaVersion: 2, projects }));
  write(file(files[2]!), JSON.stringify({ schemaVersion: 2, projects: [] })); write(file(files[3]!), "{interrupted-backup");
  report.libraryAfter = await libraryFingerprint(); report.libraryUnchanged = structuralHash(report.libraryBefore) === structuralHash(report.libraryAfter);
  assert(report.libraryUnchanged, "User library changed during diagnostic."); saveReport(report); return report;
});

export const finishMobileStorageRecoveryCheck = () => exclusive(async () => {
  const report = JSON.parse(await reportFile().text()) as RecoveryCheckReport;
  assert(report.format === "math3d.mobile-storage-recovery.v1" && report.phase === "restart-pending", "Prepare a new recovery check first.");
  const fixtureData = decodeMobileSceneStorage(await file("fixture.json").text());
  if (!fixtureData.ok) throw new Error("Recovery fixture failed validation.");
  const projects = fixtureData.projects; same(structuralHash(projects), report.fixtureHash);
  await check(report, "cold-launch-repair-ignores-uncommitted-staging", async () => {
    const recovered = await store().load(); assert(recovered.source === "backup", "Expected backup after restart."); same(recovered.projects, projects);
    const reloaded = await store().load(); assert(reloaded.source === "primary" && !reloaded.issues.length, "Repair did not persist."); same(reloaded.projects, projects);
  });
  report.libraryAfter = await libraryFingerprint(); report.libraryUnchanged = structuralHash(report.libraryBefore) === structuralHash(report.libraryAfter);
  report.phase = "complete"; report.finishedAt = new Date().toISOString(); saveReport(report); return report;
});

export const exportMobileStorageRecoveryCheck = async () => {
  const raw = await reportFile().text();
  const destination = await Directory.pickDirectoryAsync();
  const output = destination.createFile(`math3d-storage-recovery-${Date.now()}.json`, "application/json");
  output.write(raw, { encoding: "utf8" }); assert(await output.text() === raw, "Export verification failed.");
};
