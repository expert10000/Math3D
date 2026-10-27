import {expect,test} from "@playwright/test";
import {cp,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import {launchRepoElectron} from "./helpers/electronLauncher";

const cwd=resolve(__dirname,"..","..");
const fixture=resolve(__dirname,"..","fixtures","quantum-scene","fixture-hofstadter-edge-1-5-two-grid-edge.qscene");
const producer=JSON.parse(readFileSync(resolve(__dirname,"..","fixtures","quantum-scene","hofstadter-edge-convergence-producer-results.json"),"utf8"));

test("two-grid edge flow reopens with exact source samples and seam diagnostics",async()=>{
  test.setTimeout(150_000);const root=await mkdtemp(join(tmpdir(),"m3d-hof-grid-"));
  try{for(let launch=0;launch<2;launch++){
    const app=await launchRepoElectron({args:[".","--quantum-scene",fixture],cwd,
      env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"profile")}});
    try{const page=await app.firstWindow(),profile=page.getByTestId("hofstadter-bulk-edge-profile");
      await expect(profile).toContainText("Five independent hash-verified");
      await expect(page.getByTestId("hofstadter-edge-convergence-profile")).toContainText("periodic seam");
      await expect(page.getByTestId("hofstadter-edge-convergence-profile")).toContainText("right phase 2");
      await profile.getByRole("button",{name:"Inspect first sample of grid-17-18"}).click();
      const crossing=producer.study.convergence.widths[0].coarseCrossings[0];
      await expect(page.getByTestId("quantum-scalar-selection")).toContainText(
        `Value: ${crossing.overlap.toPrecision(10)} squared eigenvector overlap`);
      await expect(page.getByTestId("hofstadter-bulk-edge-selection")).toContainText(
        producer.study.sources[3].role);
    }finally{await app.close();}
  }}finally{if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-hof-grid-"))throw new Error("Unsafe cleanup");await rm(root,{recursive:true,force:true});}
});

test("changed two-grid source data is refused",async()=>{
  test.setTimeout(150_000);const root=await mkdtemp(join(tmpdir(),"m3d-hof-grid-")),source=join(root,"changed.qscene");
  try{await cp(fixture,source,{recursive:true});const file=join(source,"grid-17-18-overlap.f64"),bytes=await readFile(file);
    bytes[0]^=1;await writeFile(file,bytes);
    const app=await launchRepoElectron({args:[".","--quantum-scene",source],cwd,
      env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"profile")}});
    try{const page=await app.firstWindow();await expect(page.getByTestId("hofstadter-edge-convergence-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();}finally{await app.close();}
  }finally{if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-hof-grid-"))throw new Error("Unsafe cleanup");await rm(root,{recursive:true,force:true});}
});
