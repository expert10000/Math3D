import {expect,test} from "@playwright/test";
import {cp,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import {launchRepoElectron} from "./helpers/electronLauncher";

test("real Theory Lab Landau scene saves as a Math3D Study and withholds changed source",async()=>{
  test.setTimeout(240_000);
  const root=await mkdtemp(join(tmpdir(),"m3d-ute2-landau-study-"));
  const fixture=resolve(__dirname,"..","fixtures","quantum-ute2","ute2-landau-385f86e1c78131452a2ea145.qscene");
  const source=join(root,"landau.qscene"),profile=join(root,"profile");
  await cp(fixture,source,{recursive:true});
  const launch=()=>launchRepoElectron({args:[".","--quantum-scene",source],cwd:resolve(__dirname,"..",".."),
    env:{...process.env,MATH3D_E2E_PROFILE_ROOT:profile}});
  let app=await launch();
  try {
    let page=await app.firstWindow();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible({timeout:60_000});
    await page.getByTestId("quantum-scene-close").click();
    await page.getByTestId("projects-toggle").click();
    let projects=page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-attach-quantum-scene").click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved",{timeout:60_000});
    const fingerprint=await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.project.v1")!).quantumScenes[0].sceneFingerprint as string);
    await projects.getByTestId(`project-admit-quantum-scene-${fingerprint}`).click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("staged in Project contents");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved",{timeout:60_000});
    await projects.getByTestId(`quantum-study-template-${fingerprint}`).click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("layout staged");
    await projects.getByTestId("project-save").click();
    await expect.poll(async()=>page.evaluate(()=>{
      const raw=localStorage.getItem("math3d.project.v1");
      return raw ? JSON.parse(raw).workspace.quantumStudies?.[0]?.templateId : undefined;
    }),{timeout:60_000}).toBe("ute2-landau");
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.quantumStudies[0].templateId).toBe("ute2-landau");
    expect(saved.workspace.studies[0].members).toHaveLength(1);
    const studyId=saved.workspace.studies[0].id as string;
    if(!await projects.getByTestId("project-research-nav-studies").count())
      await projects.getByTestId("project-gallery-layout-toggle").first().click();
    if(!await projects.getByTestId("project-studies-panel").count())await projects.getByTestId("project-detail-toggle").click();
    await projects.getByRole("button",{name:"Studies",exact:true}).click();
    await projects.getByTestId(`project-study-open-${studyId}`).click();
    await expect(projects.getByTestId("project-study-quantum-selection")).toBeVisible();
    await projects.getByTestId("project-study-landau-index").fill("3");
    await projects.getByTestId("project-study-pin-landau").click();
    await expect(projects.getByTestId("project-study-value-stationary")).toContainText('"globalMinimum":true',{timeout:60_000});
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved",{timeout:60_000});
    const id=saved.identity.id as string;
    await app.close();
    app=await launchRepoElectron({args:["."],cwd:resolve(__dirname,"..",".."),
      env:{...process.env,MATH3D_E2E_PROFILE_ROOT:profile}});
    page=await app.firstWindow();
    await page.getByTestId("projects-toggle").click();
    projects=page.getByTestId("project-explorer-panel");
    await projects.getByTestId(`project-open-saved-${id}`).click();
    if(!await projects.getByTestId("project-research-nav-studies").count())
      await projects.getByTestId("project-gallery-layout-toggle").first().click();
    await projects.getByRole("button",{name:"Studies",exact:true}).click();
    await projects.getByTestId(`project-study-open-${studyId}`).click();
    await expect(projects.getByTestId("project-study-value-stationary")).toContainText('"globalMinimum":true',{timeout:60_000});
    const file=join(source,"stationary-positions.f64"),bytes=await readFile(file);bytes[0]^=1;await writeFile(file,bytes);
    await projects.getByTestId("project-study-export-quantum-evidence").click();
    await expect(projects.getByTestId("project-study-quantum-withheld")).toBeVisible({timeout:60_000});
    await expect(projects.getByTestId("project-study-evidence-omission")).toContainText(/verification failed|integrity|changed/i);
  } finally {
    await app.close();
    if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-ute2-landau-study-"))throw new Error("Unsafe UTe2 cleanup path");
    await rm(root,{recursive:true,force:true});
  }
});
