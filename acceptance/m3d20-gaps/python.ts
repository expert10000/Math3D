import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import { getPythonWorker,runPythonWorkerStartupCheck,stopPythonWorker } from '@target/src/main/python/pythonWorker';
import {recordPythonWorkerStartup,getPythonWorkerDiagnosticsSnapshot} from '@target/src/main/python/pythonWorkerDiagnostics';
import {MeshDocumentAdapter} from '@target/renderer/src/mesh/meshDocumentAdapter';
import {captureProjectResources,exportProjectPackage,parseProjectPackage,projectResourceInventory} from '@target/renderer/src/projects/projectResources';
import {createMath3DProject,createMixedWorkspaceDocument,canonicalJsonStringify,sha256Checksum} from '@math3d/core';
export async function run(report:any){
 const check=(name:string,details:any={})=>{report.checks.push({name,status:'passed',...details});console.log('PASS '+name);};
 const python=process.env.MATH3D_PYTHON||execFileSync('which',['python'],{encoding:'utf8'}).trim();process.env.MATH3D_PYTHON=python;process.env.MATH3D_WORKER_MODE='python';process.env.MATH3D_WORKER_FAILURE_INJECTION='none';
 const startup=await runPythonWorkerStartupCheck();assert.equal(startup.ok,true,JSON.stringify(startup));recordPythonWorkerStartup(startup);const worker=await getPythonWorker();
 const dependency=JSON.parse(execFileSync(python,['python/worker/main.py','--health'],{encoding:'utf8'}));assert.equal(dependency.ok,true);assert.equal(dependency.dependencies.vtk.available??dependency.dependencies.vtk.ok,true,JSON.stringify(dependency));check('real Python/VTK protocol and dependency discovery',{startup,dependency});
 const request=()=>({jobId:'recovery-'+crypto.randomUUID(),positions:new Float32Array([0,0,0,1,0,0,0,1,0]),indices:new Uint32Array([0,1,2]),options:{computeNormals:true}});
 const first=await worker.vtkMesh('vtk_clean_normals',request());assert.equal(first.ok,true,JSON.stringify(first));if(!first.ok)throw Error('vtk failed');assert.equal(first.vertexCount,3);assert.equal(first.triCount,1);check('actual VTK computation',{vertexCount:first.vertexCount,triCount:first.triCount});
 const adapter=MeshDocumentAdapter.fromMesh({label:'Real VTK retained result',source:{kind:'import',format:'obj',filename:'real-vtk.obj'},positions:new Float32Array(first.positions),indices:new Uint32Array(first.indices),...(first.normals?{normals:new Float32Array(first.normals)}:{})});adapter.commitSelection(['mesh-face:0']);const replay=adapter.replayBundle();
 const project=createMath3DProject(createMixedWorkspaceDocument({entries:[{module:'mesh',checkpoint:replay.checkpoint.document,expected:adapter.document().identity,replay:{format:'math3d.mesh-replay.v1',payload:replay as never}}],activeDocumentIds:[adapter.document().identity.id],results:[],relations:[],artifacts:[],constructions:[],committedSelection:null}),{stableKey:'real-offline-runtime-recovery'});
 const resources=captureProjectResources(project,item=>adapter.resources.bytes(item.reference as never));const bytes=exportProjectPackage(project,resources),file=resolve('output/acceptance-gaps/retained-vtk.package.json');writeFileSync(file,bytes);const digest=sha256Checksum(new TextEncoder().encode(bytes));
 const proc=(worker as any).proc;const exit=once(proc,'exit');const pending=assert.rejects(worker.health(15000),/exited|closed|write|EPIPE/i);process.kill(proc.pid,'SIGKILL');await exit;await pending;const offline=await getPythonWorkerDiagnosticsSnapshot();assert.equal(offline.available,false);check('real process death rejects in-flight request and invalidates startup capabilities',{offline});
 process.env.MATH3D_PYTHON=resolve('output/acceptance-gaps/missing-python');const unavailable=await runPythonWorkerStartupCheck();assert.equal(unavailable.ok,false);recordPythonWorkerStartup(unavailable);check('actual unavailable interpreter refuses new work',{unavailable});
 const reopened=parseProjectPackage(readFileSync(file,'utf8'));assert.equal(canonicalJsonStringify(reopened.project),canonicalJsonStringify(project));assert.deepEqual(reopened.resources.sidecars(),resources.sidecars());assert.equal(sha256Checksum(readFileSync(file)),digest);const restored=MeshDocumentAdapter.restoreReplay({...replay,resources:projectResourceInventory(project).map(item=>({reference:item.reference as never,bytes:reopened.resources.bytes(item)!}))});assert.deepEqual(restored.selection(),['mesh-face:0']);check('offline disk reopen preserves identity, hash, selection and actual computed VTK bytes',{projectId:project.identity.id,packageSha256:digest,resources:resources.sidecars().map(({data,...s}:any)=>s)});
 process.env.MATH3D_PYTHON=python;const recovered=await runPythonWorkerStartupCheck();assert.equal(recovered.ok,true,JSON.stringify(recovered));recordPythonWorkerStartup(recovered);assert.equal((await getPythonWorkerDiagnosticsSnapshot()).available,true);const retry=await (await getPythonWorker()).vtkMesh('vtk_clean_normals',request());assert.equal(retry.ok,true);if(!retry.ok)throw Error('retry failed');assert.deepEqual(new Uint8Array(retry.positions),new Uint8Array(first.positions));assert.deepEqual(new Uint8Array(retry.indices),new Uint8Array(first.indices));assert.equal(readFileSync(file,'utf8'),bytes);check('fresh protocol handshake and explicit retry after reconnect preserve original saved result',{recovered});stopPythonWorker();
}

// Assertion failures must not leave a real child process keeping CI alive.
export { stopPythonWorker as cleanup };
