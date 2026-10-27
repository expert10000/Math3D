import {expect,test} from "@playwright/test";
import {cp,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import {launchRepoElectron} from "./helpers/electronLauncher";

const repo=resolve(__dirname,"..","..");
const fixture=resolve(__dirname,"..","fixtures","quantum-scene","run-c0be71581dc94fb599f4df7c7dab2031.qscene");
const resultFile=resolve(__dirname,"..","fixtures","quantum-scene","rice-mele-producer-result.json");

async function openExamples(page:import("@playwright/test").Page){
  await page.getByRole("button",{name:"Palette",exact:true}).click();
  await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...").fill("Verified quantum examples");
  await page.getByRole("button",{name:"Verified quantum examples",exact:true}).click();
}

test("Rice–Mele supplied bands and finite sites inspect exact values across restart",async()=>{
  test.setTimeout(180_000);
  const root=await mkdtemp(join(tmpdir(),"m3d-rice-mele-"));
  const profile=join(root,"profile");
  const launch=()=>launchRepoElectron({args:["."],cwd:repo,
    env:{...process.env,MATH3D_E2E_PROFILE_ROOT:profile}});
  const result=JSON.parse(await readFile(resultFile,"utf8"));
  let app=await launch();
  try{
    let page=await app.firstWindow();
    await openExamples(page);
    await page.getByTestId("quantum-example-rice-mele-bands").click();
    await expect(page.getByTestId("rice-mele-study-profile")).toContainText("static periodic bands");
    await expect(page.getByTestId("rice-mele-study-profile")).toContainText("no Hamiltonian, parameter cycle, invariant or Thouless pump");
    await page.getByRole("button",{name:"Inspect first band sample band-0"}).click();
    await expect(page.getByTestId("quantum-band-selection")).toContainText(result.analysis.lowerBand[0].toPrecision(8));
    await expect(page.getByTestId("quantum-band-selection")).toContainText(result.runId);
    await page.getByTestId("quantum-scene-close").click();
    await openExamples(page);
    await page.getByTestId("quantum-example-rice-mele-finite").click();
    await expect(page.getByTestId("rice-mele-study-profile")).toContainText("finite open-chain samples");
    await page.getByRole("button",{name:"Inspect first sample of middle-density"}).click();
    await expect(page.getByTestId("quantum-scalar-selection")).toContainText(result.analysis.middleDensity[0].toPrecision(10));
    await app.close();
    app=await launch();
    page=await app.firstWindow();
    await expect.poll(()=>page.evaluate(()=>typeof (window as any).quantumScenes?.reopenRecent)).toBe("function");
    const reopened=await page.evaluate(()=>(window as any).quantumScenes.reopenRecent());
    expect(reopened).toMatchObject({ok:true,remembered:true});
    await page.getByRole("button",{name:"Palette",exact:true}).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...").fill("Reopen recent quantum scene");
    await page.getByRole("button",{name:"Reopen recent quantum scene",exact:true}).click();
    await expect(page.getByTestId("rice-mele-study-profile")).toBeVisible();
    await page.getByRole("button",{name:"Inspect first sample of middle-density"}).click();
    await expect(page.getByTestId("quantum-scalar-selection")).toContainText(result.analysis.middleDensity[0].toPrecision(10));
  }finally{
    await app.close();
    if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-rice-mele-"))throw new Error("Unsafe Rice–Mele cleanup path");
    await rm(root,{recursive:true,force:true});
  }
});

test("Rice–Mele changed density is refused on inspection and reopened import",async()=>{
  test.setTimeout(150_000);
  const root=await mkdtemp(join(tmpdir(),"m3d-rice-mele-"));
  try{
    const altered=join(root,"altered.qscene");
    await cp(fixture,altered,{recursive:true});
    const density=join(altered,"middle-density.f64");
    const launch=()=>launchRepoElectron({args:[".","--quantum-scene",altered],cwd:repo,
      env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"profile")}});
    let app=await launch();
    try{
      const page=await app.firstWindow();
      await expect(page.getByTestId("rice-mele-study-profile")).toBeVisible();
      const changed=Buffer.from(await readFile(density));changed[0]^=1;await writeFile(density,changed);
      await page.getByRole("button",{name:"Inspect first sample of middle-density"}).click();
      await expect(page.getByRole("alert")).toContainText(/refused|integrity|hash/i);
      await expect(page.getByTestId("quantum-scalar-selection")).toHaveCount(0);
    }finally{await app.close();}
    app=await launch();
    try{
      const page=await app.firstWindow();
      await expect(page.getByTestId("rice-mele-study-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();
    }finally{await app.close();}
  }finally{
    if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-rice-mele-"))throw new Error("Unsafe Rice–Mele cleanup path");
    await rm(root,{recursive:true,force:true});
  }
});
