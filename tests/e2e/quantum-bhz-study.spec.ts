import {expect,test} from "@playwright/test";
import {cp,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import {launchRepoElectron} from "./helpers/electronLauncher";

const fixture=resolve(__dirname,"..","fixtures","quantum-scene","run-b918512202b94cfaa0e181c9afd1f158-bands.qscene");

test("producer-backed BHZ example shows four exact bands and qualified Z2 without computing in Math3D",async()=>{
  test.setTimeout(120_000);
  const root=await mkdtemp(join(tmpdir(),"m3d-q08-bhz-"));
  const app=await launchRepoElectron({args:["."],cwd:resolve(__dirname,"..",".."),
    env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"profile")}});
  try{
    const page=await app.firstWindow();
    await page.getByRole("button",{name:"Palette",exact:true}).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...").fill("Verified quantum examples");
    await page.getByRole("button",{name:"Verified quantum examples",exact:true}).click();
    await page.getByTestId("quantum-example-bhz-bands").click();
    const profile=page.getByTestId("bhz-study-profile");
    await expect(profile).toContainText("Four stored band surfaces");
    await expect(profile).toContainText("Spin-conserved Z2 parity: 1");
    await expect(profile).toContainText("producer status verified");
    await expect(profile).toContainText("Edge states");
    await expect(page.getByTestId("quantum-band-legend")).toContainText("Partner occupied");
    await page.getByRole("button",{name:"Inspect first band sample band-0"}).click();
    await expect(page.getByTestId("quantum-band-selection")).toContainText("Stored datasets");
  }finally{
    await app.close();
    if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-q08-bhz-"))throw new Error("Unsafe BHZ cleanup");
    await rm(root,{recursive:true,force:true});
  }
});

test("changed BHZ source bytes are refused before the read-only view opens",async()=>{
  test.setTimeout(120_000);
  const root=await mkdtemp(join(tmpdir(),"m3d-q08-bhz-"));
  try{
    const source=join(root,"altered.qscene");await cp(fixture,source,{recursive:true});
    const file=join(source,"band-energy-0.f64"),bytes=await readFile(file);bytes[0]^=1;await writeFile(file,bytes);
    const app=await launchRepoElectron({args:[".","--quantum-scene",source],cwd:resolve(__dirname,"..",".."),
      env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"profile")}});
    try{
      const page=await app.firstWindow();
      await expect(page.getByTestId("bhz-study-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();
    }finally{await app.close();}
  }finally{
    if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-q08-bhz-"))throw new Error("Unsafe BHZ cleanup");
    await rm(root,{recursive:true,force:true});
  }
});
