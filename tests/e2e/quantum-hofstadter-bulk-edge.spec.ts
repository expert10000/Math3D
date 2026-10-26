import {expect,test} from "@playwright/test";
import {cp,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import {launchRepoElectron} from "./helpers/electronLauncher";

const cwd=resolve(__dirname,"..","..");
const fixture=resolve(__dirname,"..","fixtures","quantum-scene","fixture-hofstadter-edge-1-3-edge.qscene");
const producer=JSON.parse(readFileSync(resolve(__dirname,"..","fixtures","quantum-scene","hofstadter-edge-producer-results.json"),"utf8"));
test("verified bulk-edge sources reopen after restart with exact strip sample",async()=>{
  test.setTimeout(150_000);const root=await mkdtemp(join(tmpdir(),"m3d-hof-edge-"));
  try{for(let launch=0;launch<2;launch++){
    const app=await launchRepoElectron({args:[".","--quantum-scene",fixture],cwd,
      env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"profile")}});
    try{const page=await app.firstWindow();
      const profile=page.getByTestId("hofstadter-bulk-edge-profile");
      await expect(profile).toContainText("verified bulk–edge comparison");
      await expect(page.getByTestId("hofstadter-bulk-edge-status")).toContainText("consistent");
      await expect(profile).toContainText(producer.study.sources[1].resultSha256);
      await page.getByRole("button",{name:"Inspect first sample of strip-18-left"}).click();
      await expect(page.getByTestId("quantum-scalar-selection")).toContainText(
        `Value: ${producer.results[1].analysis.strip.leftWeights[0][0].toPrecision(10)} boundary probability`);
      await expect(page.getByTestId("hofstadter-bulk-edge-selection")).toContainText(producer.study.sources[1].runId);
    }finally{await app.close();}
  }}finally{if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-hof-edge-"))throw new Error("Unsafe cleanup");await rm(root,{recursive:true,force:true});}
});
test("changed paired-source strip weights are refused",async()=>{
  test.setTimeout(150_000);const root=await mkdtemp(join(tmpdir(),"m3d-hof-edge-")),source=join(root,"changed.qscene");
  try{await cp(fixture,source,{recursive:true});const file=join(source,"strip-18-left-weight.f64"),bytes=await readFile(file);
    bytes[0]^=1;await writeFile(file,bytes);
    const app=await launchRepoElectron({args:[".","--quantum-scene",source],cwd,
      env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"profile")}});
    try{const page=await app.firstWindow();await expect(page.getByTestId("hofstadter-bulk-edge-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();}finally{await app.close();}
  }finally{if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-hof-edge-"))throw new Error("Unsafe cleanup");await rm(root,{recursive:true,force:true});}
});
