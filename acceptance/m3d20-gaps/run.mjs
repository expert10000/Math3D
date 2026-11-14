import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=resolve(process.env.MATH3D_SOURCE_ROOT||'acceptance-gaps'), mode=process.argv[2]||'python';
const req=createRequire(import.meta.url), esbuild=req(resolve(root,'renderer/node_modules/esbuild'));
const filename=resolve(import.meta.dirname,mode+'.ts');
const {outputFiles}=await esbuild.build({entryPoints:[filename],bundle:true,platform:'node',format:'cjs',write:false,nodePaths:[resolve(root,'node_modules'),resolve(root,'renderer/node_modules')],alias:{'@target':root,'@math3d/core':resolve(root,'packages/core/src/index.ts'),'@math3d/kernel':resolve(root,'packages/kernel/src/index.ts')},plugins:[{name:'electron-host-shell-only',setup(b){b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'host-shell'}));b.onLoad({filter:/.*/,namespace:'host-shell'},()=>({contents:`export const app={isPackaged:false,getVersion:()=>"2.0.0",getAppPath:()=>${JSON.stringify(root)},getPath:()=>${JSON.stringify(resolve(root,'output/acceptance-gaps/profile'))}};export const ipcMain={handle(){}};`,loader:'js'}));}}]});
const Module=req('node:module').Module,m=new Module(filename);m.paths=req('node:module')._nodeModulePaths(root);m._compile(outputFiles[0].text,filename);
globalThis.window=globalThis;
const old=process.cwd();process.chdir(root);
const report={format:'math3d.acceptance-gap-evidence.v1',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),mode,startedAt:new Date().toISOString(),testBundleSha256:createHash('sha256').update(outputFiles[0].text).digest('hex'),harnessFiles:{},harnessCommit:process.env.MATH3D_HARNESS_SHA||null,containerImage:process.env.MATH3D_SAGE_IMAGE_ID||null,scope:'Real production owners and transport; Electron app-path shell stub only. No native UI claim.',checks:[]};
for(const f of ['run.mjs',mode+'.ts'])report.harnessFiles[f]=createHash('sha256').update(readFileSync(resolve(import.meta.dirname,f))).digest('hex');
try{await m.exports.run(report);report.result='passed';}catch(e){report.result='failed';report.error=String(e.stack||e);process.exitCode=1;}finally{if(m.exports.cleanup){try{await m.exports.cleanup();}catch(e){report.cleanupError=String(e);report.result='failed';process.exitCode=1;}}report.finishedAt=new Date().toISOString();mkdirSync(resolve(root,'output/acceptance-gaps'),{recursive:true});writeFileSync(resolve(root,'output/acceptance-gaps',mode+'.json'),JSON.stringify(report,null,2)+'\n');process.chdir(old);console.log(JSON.stringify({mode,result:report.result,checks:report.checks.length,error:report.error}));}
