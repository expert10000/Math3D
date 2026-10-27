import {expect,test} from "@playwright/test";
import {cp,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import {launchRepoElectron} from "./helpers/electronLauncher";

const cwd=resolve(__dirname,"..","..");
const fixture=resolve(__dirname,"..","fixtures","quantum-scene","fixture-hofstadter-flux-pq4-butterfly.qscene");
const producer=JSON.parse(readFileSync(resolve(__dirname,"..","fixtures","quantum-scene","hofstadter-flux-producer-result.json"),"utf8"));
test("verified butterfly reopens after restart with exact flux, energy and source lineage",async()=>{
  test.setTimeout(150_000);const root=await mkdtemp(join(tmpdir(),"m3d-hof-butterfly-"));
  try{for(let launch=0;launch<2;launch++){
    const app=await launchRepoElectron({args:[".","--quantum-scene",fixture],cwd,
      env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"profile")}});
    try{
      const page=await app.firstWindow();
      const profile=page.getByTestId("hofstadter-butterfly-profile");
      await expect(profile).toContainText("verified flux sweep");
      await expect(profile).toContainText(producer.points[1].resultSha256);
      await page.getByRole("button",{name:"Inspect first sample of flux-1"}).click();
      const sample=page.getByTestId("quantum-scalar-selection");
      await expect(sample).toContainText(`Value: ${producer.points[1].energies[0][0].toPrecision(10)} hopping energy`);
      await expect(sample).toContainText("flux p/q: 0.25000000 flux quanta per plaquette");
      await expect(page.getByTestId("hofstadter-butterfly-selection")).toContainText(producer.points[1].runId);
    }finally{await app.close();}
  }}finally{if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-hof-butterfly-"))throw new Error("Unsafe cleanup");await rm(root,{recursive:true,force:true});}
});
test("changed butterfly energy bytes are refused",async()=>{
  test.setTimeout(150_000);const root=await mkdtemp(join(tmpdir(),"m3d-hof-butterfly-")),source=join(root,"changed.qscene");
  try{await cp(fixture,source,{recursive:true});const file=join(source,"flux-1-energy.f64"),bytes=await readFile(file);
    bytes[0]^=1;await writeFile(file,bytes);
    const app=await launchRepoElectron({args:[".","--quantum-scene",source],cwd,
      env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"profile")}});
    try{const page=await app.firstWindow();await expect(page.getByTestId("hofstadter-butterfly-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();}finally{await app.close();}
  }finally{if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-hof-butterfly-"))throw new Error("Unsafe cleanup");await rm(root,{recursive:true,force:true});}
});
