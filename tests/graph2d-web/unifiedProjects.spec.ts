import { additionalRepresentationFixture, exerciseAdditionalEditors, checkReopenedAdditionalHistory } from "../e2e/helpers/additionalProjectRepresentations";
import { exerciseRepresentationStarters } from "../e2e/helpers/projectRepresentationStarters";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { runNamedProjectRoundTrip } from "../e2e/helpers/namedProjectRoundTrip";
import { inspectMeshPackage, meshResourceFixture, pointResourceFixture, scalarVolumeResourceFixture, inspectScalarVolumePackage } from "../e2e/helpers/meshProjectResources";
import { projectFreezeFixture, inspectFreezePackage, editFreezeProject, freezeControls, checkFreezeHistory } from "../e2e/helpers/projectFreeze";

test("PRJ18 browser freezes all eight modules and resources across fresh profiles and reload", async ({ page, browser }) => {
  test.setTimeout(600_000);
  const fixture = projectFreezeFixture();
  await page.goto("/"); await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); }); await page.reload();
  const saved = await editFreezeProject(page, fixture), download = page.waitForEvent("download");
  await page.getByTestId("project-export-resources").click();
  const raw = readFileSync((await (await download).path())!, "utf8"), snapshot = inspectFreezePackage(raw);
  expect(snapshot.project.workspace.entries.map((entry: any) => entry.expected)).toEqual(saved.workspace.entries.map((entry: any) => entry.expected));
  for (const sidecar of inspectFreezePackage(fixture.raw).resources.filter((item) => item.kind !== "mesh-buffers")) expect(snapshot.resources).toContainEqual(sidecar);
  const destinationOptions = { baseURL: new URL(page.url()).origin,
    locale: await page.evaluate(() => navigator.language), timezoneId: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone) };
  // Close the source renderer before opening an independent destination, as on desktop.
  await page.close();
  const context = await browser.newContext(destinationOptions);
  try {
    const other = await context.newPage(); await other.goto("/");
    await other.evaluate(() => localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1")); await other.reload();
    let controls = freezeControls(other); await controls.importOpen(raw);
    expect((await controls.save()).workspace.entries.map((entry: any) => entry.expected)).toEqual(saved.workspace.entries.map((entry: any) => entry.expected));
    await other.reload(); controls = freezeControls(other); await controls.reopen(saved.identity.id);
    expect((await controls.save()).workspace.entries.map((entry: any) => entry.expected)).toEqual(saved.workspace.entries.map((entry: any) => entry.expected));
    await checkFreezeHistory(other, fixture);
    await other.setViewportSize({ width: 390, height: 844 }); await controls.show();
    const bounds = await controls.panel.boundingBox(); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
    await controls.panel.screenshot({ path: test.info().outputPath("combined-project-phone.png") });
  } finally { await context.close(); }
});

test("PRJ16 built-in source starters preview, edit and transfer with restored history", async ({ page, browser }) => {
  test.setTimeout(240_000);
  await page.goto("/"); await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); }); await page.reload();
  const { originalDocument, saved } = await exerciseRepresentationStarters(page);
  const download = page.waitForEvent("download"); await page.getByTestId("project-export").click();
  const exported = readFileSync((await (await download).path())!, "utf8"); expect(JSON.parse(exported).workspace).toEqual(saved.workspace);
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin,
    locale: await page.evaluate(() => navigator.language), timezoneId: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone) });
  try {
    const other = await context.newPage(); await other.goto("/");
    await other.evaluate(() => localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1")); await other.reload();
    await other.getByTestId("projects-toggle").click(); const panel = other.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-import-file").setInputFiles({ name: "starter.json", mimeType: "application/json", buffer: Buffer.from(exported) });
    await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
    await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved"); await other.reload();
    await other.getByTestId("projects-toggle").click(); await panel.getByTestId("project-view-saved").click(); await panel.getByTestId("project-restore-saved").click();
    await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
    await checkReopenedAdditionalHistory(other, originalDocument);
    await other.setViewportSize({ width: 390, height: 844 });
    expect(await other.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await other.getByTestId("project-source-editor").screenshot({ path: test.info().outputPath("source-starter-phone.png") });
  } finally { await context.close(); }
});

test("PRJ16 browser additional source editors retain measured sources and history on reload", async ({page})=>{
  test.setTimeout(240_000);
  const fixture=additionalRepresentationFixture();await page.goto("/");await page.evaluate(()=>{localStorage.clear();localStorage.setItem("math3d.computeEngines.firstLaunchSeen","1");});await page.reload();
  const {selected,saved}=await exerciseAdditionalEditors(page,fixture);await page.reload();await page.getByTestId("projects-toggle").click();const panel=page.getByTestId("project-explorer-panel");
  await panel.getByTestId("project-view-saved").click();await panel.getByTestId("project-restore-saved").click();await expect(panel.getByTestId("project-import-open")).toBeEnabled();await panel.getByTestId("project-import-open").click();
  await panel.getByTestId("project-save").click();await expect(panel.getByTestId("project-message")).toContainText("Saved");expect((await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.project.v1")!))).workspace.entries.map((e:any)=>e.expected)).toEqual(saved.workspace.entries.map((e:any)=>e.expected));
  for(const document of selected)await checkReopenedAdditionalHistory(page,document);
});

test("PRJ16 browser samples verified dense Volume bytes and retains grid history on reload", async ({ page }) => {
  const fixture = scalarVolumeResourceFixture();
  await page.goto("/"); await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); }); await page.reload();
  await page.getByTestId("projects-toggle").click(); const panel = page.getByTestId("project-explorer-panel");
  await panel.getByTestId("project-import-file").setInputFiles({ name: "scalar.resources.json", mimeType: "application/json", buffer: Buffer.from(fixture.raw) });
  await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
  await expect(page.getByTestId("project-volume-payload")).toContainText("float32"); await page.getByRole("button", { name: "Close project explorer" }).click();
  await page.getByTestId("shared-inspector-tab-summary").click(); await expect(page.getByTestId("volume-details-card")).toContainText("1 … 8");
  await page.getByTestId("project-volume-editor").locator("summary").click();
  const changed = { ...fixture.docs[0].source.spatial, origin: [20,30,40] };
  await page.getByTestId("project-volume-spatial").fill(JSON.stringify(changed)); await page.getByTestId("project-volume-apply").click();
  await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved");
  const generations = (await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!))).workspace.entries.map((entry: any) => entry.expected);
  await page.reload(); await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-view-saved").click(); await panel.getByTestId("project-restore-saved").click();
  await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
  await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved");
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!))).workspace.entries.map((entry: any) => entry.expected)).toEqual(generations);
  const download = page.waitForEvent("download"); await panel.getByTestId("project-export-resources").click();
  const exported = readFileSync((await (await download).path())!, "utf8"), samples = inspectScalarVolumePackage(exported);
  expect(samples[0]!.document.source.spatial).toEqual(changed); expect(samples[0]!.values).toEqual([1,2,3,4,5,6,7,8]);
  expect(JSON.parse(exported).resources).toEqual(JSON.parse(fixture.raw).resources);
  await page.getByRole("button", { name: "Close project explorer" }).click(); await page.getByTestId("project-volume-undo").click();
  await page.getByTestId("project-volume-editor").locator("summary").click(); expect(JSON.parse(await page.getByTestId("project-volume-spatial").inputValue())).toEqual(fixture.docs[0].source.spatial);
});

test("PRJ15 browser verifies resource packages and preserves Mesh selection/history on reload", async ({ page }) => {
  const fixture = meshResourceFixture();
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
  await page.reload(); await page.getByTestId("projects-toggle").click();
  const panel = page.getByTestId("project-explorer-panel");
  await panel.getByTestId("project-import-file").setInputFiles({ name: "mesh.resources.json", mimeType: "application/json", buffer: Buffer.from(fixture.raw) });
  await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
  await expect(page.getByTestId("project-mesh-editor")).toContainText("First saved triangle");
  await page.getByRole("button", { name: "Close project explorer" }).click();
  await page.getByTestId("project-mesh-translate-0").fill("3"); await page.getByTestId("project-mesh-apply").click();
  await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)), generations = saved.workspace.entries.map((entry: any) => entry.expected);
  await page.reload(); await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-view-saved").click(); await panel.getByTestId("project-restore-saved").click();
  await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
  await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved");
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!))).workspace.entries.map((entry: any) => entry.expected)).toEqual(generations);
  const download = page.waitForEvent("download"); await panel.getByTestId("project-export-resources").click();
  const exported = readFileSync((await (await download).path())!, "utf8"), mesh = inspectMeshPackage(exported)[0]!;
  expect(mesh.positions).toEqual([5,0,0,6,0,0,5,1,0]); expect(mesh.selection).toEqual(["mesh-face:0"]);
  expect(mesh.document.source.origin).toEqual(fixture.docs[0].source.origin);
  await page.getByRole("button", { name: "Close project explorer" }).click(); await page.getByTestId("project-mesh-undo").click();
  await page.setViewportSize({ width: 390, height: 844 }); const bounds = await page.getByTestId("project-mesh-editor").boundingBox(); expect(bounds!.width).toBeLessThanOrEqual(391);
  await page.getByTestId("project-mesh-editor").screenshot({ path: test.info().outputPath("mesh-resource-editor-phone.png") });
});

test("PRJ15 imports Graph point-table bytes into an independent host and reopens their exact content after reload", async ({ page }) => {
  const fixture = pointResourceFixture();
  await page.goto("/"); await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); }); await page.reload();
  await page.getByTestId("projects-toggle").click(); const panel = page.getByTestId("project-explorer-panel");
  await panel.getByTestId("project-import-file").setInputFiles({ name: "point-table.resources.json", mimeType: "application/json", buffer: Buffer.from(fixture.raw) });
  await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
  await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved");
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("math3d.graph2d.table.")))).toEqual([]);
  await page.reload(); await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-view-saved").click(); await panel.getByTestId("project-restore-saved").click();
  await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
  const download = page.waitForEvent("download"); await panel.getByTestId("project-export-resources").click();
  const returned = JSON.parse(readFileSync((await (await download).path())!, "utf8")), original = JSON.parse(fixture.raw);
  expect(returned.project.workspace.entries[0].expected).toEqual(original.project.workspace.entries[0].expected);
  expect(returned.resources).toEqual(original.resources);
});

test("PRJ08 named project checkpoints survive browser/mobile transfer, restart and managed history", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
  await page.reload();
  await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
  await runNamedProjectRoundTrip(page, async (checkpoint) => {
    const download = page.waitForEvent("download");
    await page.getByTestId(checkpoint ? "project-export-checkpoint" : "project-export").click();
    return readFileSync((await (await download).path())!, "utf8");
  });
  await page.getByTestId("project-explorer-panel").screenshot({ path: test.info().outputPath("project-roundtrip-phone.png") });
});
