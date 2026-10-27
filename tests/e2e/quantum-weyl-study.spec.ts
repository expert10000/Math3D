import {expect,test} from "@playwright/test";
import {cp,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import {launchRepoElectron} from "./helpers/electronLauncher";

const fixture=resolve(__dirname,"..","fixtures","quantum-scene","run-f8bf5412469c49b7bb878b8001d341cf-weyl.qscene");

test("Weyl local cone retains producer values and exact selection after restart",async()=>{
  test.setTimeout(150_000);
  const root=await mkdtemp(join(tmpdir(),"m3d-weyl-"));
  try{
    for(let launch=0;launch<2;launch++){
      const app=await launchRepoElectron({args:[".","--quantum-scene",fixture],cwd:resolve(__dirname,"..",".."),
        env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"profile")}});
      try{
        const page=await app.firstWindow();
        await expect(page.getByTestId("weyl-study-profile")).toContainText("Local node chirality: 1");
        await expect(page.getByTestId("weyl-study-profile")).toContainText("Occupied-band enclosing-sphere Chern: -1");
        await expect(page.getByTestId("weyl-study-profile")).toContainText("no lattice partner");
        await page.getByRole("button",{name:"Inspect first sample of weyl-samples"}).click();
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText("radial-berry");
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText("-0.5000000000");
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText("qx:");
      }finally{await app.close();}
    }
  }finally{
    if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-weyl-"))throw new Error("Unsafe test cleanup");
    await rm(root,{recursive:true,force:true});
  }
});

test("Weyl scene refuses changed dataset on selection and subsequent open",async()=>{
  test.setTimeout(150_000);
  const root=await mkdtemp(join(tmpdir(),"m3d-weyl-")),source=join(root,"altered.qscene");
  try{
    await cp(fixture,source,{recursive:true});
    const app=await launchRepoElectron({args:[".","--quantum-scene",source],cwd:resolve(__dirname,"..",".."),
      env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"profile")}});
    try{
      const page=await app.firstWindow();
      await expect(page.getByTestId("weyl-study-profile")).toBeVisible();
      const file=join(source,"radial-berry.f64"),bytes=await readFile(file);
      bytes[0]^=1;await writeFile(file,bytes);
      await page.getByRole("button",{name:"Inspect first sample of weyl-samples"}).click();
      await expect(page.getByRole("alert")).toContainText(/refused|integrity|hash/i);
      await expect(page.getByTestId("quantum-scalar-selection")).toHaveCount(0);
    }finally{await app.close();}
    const refused=await launchRepoElectron({args:[".","--quantum-scene",source],cwd:resolve(__dirname,"..",".."),
      env:{...process.env,MATH3D_E2E_PROFILE_ROOT:join(root,"retry")}});
    try{
      const page=await refused.firstWindow();
      await expect(page.getByTestId("weyl-study-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();
    }finally{await refused.close();}
  }finally{
    if(!root.startsWith(resolve(tmpdir())+sep)||!root.includes("m3d-weyl-"))throw new Error("Unsafe test cleanup");
    await rm(root,{recursive:true,force:true});
  }
});
