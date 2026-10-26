import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const cwd=resolve(__dirname,"..","..");
const fixture=resolve(__dirname,"..","fixtures","quantum-scene","run-e02feae009f4467394f141d9291863bb-hofstadter-strip.qscene");
const producer=JSON.parse(readFileSync(resolve(__dirname,"..","fixtures","quantum-scene","hofstadter-strip-producer-result.json"),"utf8"));

test("verified open Harper strip reopens with exact left and right boundary samples",async()=>{
  test.setTimeout(150_000);
  const root=await mkdtemp(join(tmpdir(),"m3d-hofstadter-strip-"));
  try{
    for(let launch=0;launch<2;launch++){
      const app=await launchRepoElectron({args:[".","--quantum-scene",fixture],cwd,
        env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"profile")}});
      try{
        const page=await app.firstWindow();
        const profile=page.getByTestId("hofstadter-strip-profile");
        await expect(profile).toContainText("finite Harper strip");
        await expect(profile).toContainText("No filling, Hall response");
        await expect(page.getByTestId("hofstadter-chern-status")).toHaveCount(0);
        for(const side of ["left","right"] as const){
          await page.getByRole("button",{name:`Inspect first sample of strip-${side}`}).click();
          const selected=page.getByTestId("quantum-scalar-selection");
          await expect(selected).toContainText("dataset index: 0");
          await expect(selected).toContainText(`Value: ${producer.analysis.strip[side==="left"?"leftWeights":"rightWeights"][0][0].toPrecision(10)} probability weight`);
          await expect(selected).toContainText(`energy: ${producer.analysis.strip.energies[0][0].toPrecision(8)} hopping energy`);
          await expect(selected).toContainText(producer.runId);
        }
      }finally{await app.close();}
    }
  }finally{
    if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-hofstadter-strip-"))throw new Error("Unsafe cleanup");
    await rm(root,{recursive:true,force:true});
  }
});

test("changed strip weight bytes are refused on selection and restart",async()=>{
  test.setTimeout(150_000);
  const root=await mkdtemp(join(tmpdir(),"m3d-hofstadter-strip-")),source=join(root,"changed.qscene");
  try{
    await cp(fixture,source,{recursive:true});
    const app=await launchRepoElectron({args:[".","--quantum-scene",source],cwd,
      env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"profile")}});
    try{
      const page=await app.firstWindow();
      await expect(page.getByTestId("hofstadter-strip-profile")).toBeVisible();
      const file=join(source,"strip-left-weight.f64"),bytes=await readFile(file);
      bytes[0]^=1;await writeFile(file,bytes);
      await page.getByRole("button",{name:"Inspect first sample of strip-left"}).click();
      await expect(page.getByRole("alert")).toContainText(/refused|integrity|hash/i);
      await expect(page.getByTestId("quantum-scalar-selection")).toHaveCount(0);
    }finally{await app.close();}
    const refused=await launchRepoElectron({args:[".","--quantum-scene",source],cwd,
      env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"retry")}});
    try{
      const page=await refused.firstWindow();
      await expect(page.getByTestId("hofstadter-strip-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();
    }finally{await refused.close();}
  }finally{
    if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-hofstadter-strip-"))throw new Error("Unsafe cleanup");
    await rm(root,{recursive:true,force:true});
  }
});
