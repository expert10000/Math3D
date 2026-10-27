import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const cwd=resolve(__dirname,"..","..");
const fixture=resolve(__dirname,"..","fixtures","quantum-scene","run-6008c2747b6a48dca666c7072a6e3756-hofstadter.qscene");
const producer=JSON.parse(readFileSync(resolve(__dirname,"..","fixtures","quantum-scene","hofstadter-hall-producer-result.json"),"utf8"));

test("filled Harper Hall scene reopens with the exact source value and sample",async()=>{
  test.setTimeout(150_000);
  const root=await mkdtemp(join(tmpdir(),"m3d-hofstadter-hall-"));
  try{
    for(let launch=0;launch<2;launch++){
      const app=await launchRepoElectron({args:[".","--quantum-scene",fixture],cwd,
        env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"profile")}});
      try{
        const page=await app.firstWindow();
        const profile=page.getByTestId("hofstadter-hall-profile");
        await expect(profile).toContainText("Selected filling: 1 occupied magnetic bands");
        await expect(profile).toContainText("Ideal Hall conductance at 1 occupied bands (e²/h): -1");
        await expect(profile).toContainText(producer.analysis.filling.fineGlobalGap.toString());
        await expect(page.getByTestId("hofstadter-strip-profile")).toHaveCount(0);
        await page.getByRole("button",{name:"Inspect first band sample band-0"}).click();
        const selected=page.getByTestId("quantum-band-selection");
        await expect(selected).toContainText(`Energy: ${producer.analysis.bandEnergies[0][0].toPrecision(8)} hopping energy`);
        await expect(selected).toContainText(producer.runId);
      }finally{await app.close();}
    }
  }finally{
    if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-hofstadter-hall-"))throw new Error("Unsafe cleanup");
    await rm(root,{recursive:true,force:true});
  }
});

test("changed Hall source bytes are refused after restart",async()=>{
  test.setTimeout(150_000);
  const root=await mkdtemp(join(tmpdir(),"m3d-hofstadter-hall-")),source=join(root,"changed.qscene");
  try{
    await cp(fixture,source,{recursive:true});
    const file=join(source,"band-0-energy.f64"),bytes=await readFile(file);
    bytes[0]^=1;await writeFile(file,bytes);
    const app=await launchRepoElectron({args:[".","--quantum-scene",source],cwd,
      env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"profile")}});
    try{
      const page=await app.firstWindow();
      await expect(page.getByTestId("hofstadter-hall-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();
    }finally{await app.close();}
  }finally{
    if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-hofstadter-hall-"))throw new Error("Unsafe cleanup");
    await rm(root,{recursive:true,force:true});
  }
});
