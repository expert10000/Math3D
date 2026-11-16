import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {checkSageHealth,runSageOperation} from '@target/renderer/src/integrations/sage/sageClient';
import {createSageExecutionRegistry} from '@target/renderer/src/services/sageOperationExecution';
import {createComplexSageJobAdapter} from '@target/renderer/src/math/complexSageJob';
import {acceptanceComplexDocument} from '@target/tests/fixtures/unified-projects/complexSource';
import {createInProcessScientificJobService} from '@math3d/kernel';
import {createComplexSagePayload,createComplexSageJobRequest,publishComplexSageResult,viewerSourceFromDocument,createMath3DProject,createMixedWorkspaceDocument,serializeMath3DProject,parseMath3DProject,sha256Checksum} from '@math3d/core';
export async function run(report:any){
 const check=(name:string,details:any={})=>{report.checks.push({name,status:'passed',...details});console.log('PASS '+name);};
 const container=process.env.MATH3D_RECOVERY_CONTAINER;if(!container||!/^m3d20-recovery-[a-z0-9-]+$/.test(container))throw Error('Explicit dedicated recovery container required; never stop another service');
 const registry=createSageExecutionRegistry();const online=await registry.probeBackend('docker');assert.equal(online.manifest.availability,'available');assert.ok(online.manifest.sageVersion);assert.ok(online.operations.length>0);check('actual Sage Docker capability discovery',{manifest:online.manifest});
 const doc=acceptanceComplexDocument('z*z'),source=viewerSourceFromDocument(doc),payload=createComplexSagePayload({document:doc,operation:'derivative'});
 const service=createInProcessScientificJobService({adapters:[createComplexSageJobAdapter(runSageOperation)],resolveSource:()=>source});
 const request=()=>createComplexSageJobRequest({jobId:'real-recovery-'+crypto.randomUUID(),source,payload,limits:{deadlineAt:Date.now()+45000,maxInputBytes:1_000_000,maxOutputBytes:1_000_000,maxMemoryBytes:4_000_000,maxWorkUnits:1_000_000}});
 const initial=await service.submit(request());assert.equal(initial.ok,true,JSON.stringify(initial));assert.equal((initial as any).output.value.replace(/\s/g,''),'2*z');const result=publishComplexSageResult({jobResult:initial,currentSource:source,expectedPayload:payload});assert.equal(result.status,'exact');assert.equal(result.provenance.engine.name,'SageMath');
 const project=createMath3DProject(createMixedWorkspaceDocument({entries:[{module:'complex',checkpoint:doc,expected:doc.identity,replay:null}],activeDocumentIds:[doc.identity.id],results:[result],artifacts:[],constructions:[],relations:[],committedSelection:null}),{stableKey:'real-sage-offline-recovery'});
 const raw=serializeMath3DProject(project),file=resolve('output/acceptance-gaps/sage-retained.math3d.json');writeFileSync(file,raw);const hash=sha256Checksum(new TextEncoder().encode(raw));check('actual Sage result published through existing Job and AnalysisResult owners',{resultId:result.id,engine:result.provenance.engine});
 execFileSync('docker',['stop','--time','10',container],{timeout:30000});
 try{
  const offline=await registry.probeBackend('docker');assert.equal(offline.manifest.availability,'unavailable');assert.equal(offline.operations.length,0);assert.deepEqual(offline.manifest.reportedOperations,[]);check('real stopped Sage service removes advertised operations',{manifest:offline.manifest});
  const denied=await registry.run({operation:'sage.polynomial.factor',backend:'docker',params:{polynomial:'x^2-1',variables:['x']},jobId:'offline-'+crypto.randomUUID()}).promise;assert.equal(denied.broker.ok,false);assert.equal(denied.response.success,false);check('broker refuses work while actual Sage service is offline',{broker:denied.broker});
  const reopened=parseMath3DProject(readFileSync(file,'utf8'));assert.deepEqual(reopened,project);assert.deepEqual(reopened.workspace.results,[result]);assert.equal(sha256Checksum(readFileSync(file)),hash);check('offline disk reopen preserves Project identity, result provenance and historical references',{projectId:project.identity.id,projectHash:hash});
 }finally{execFileSync('docker',['start',container],{timeout:30000});}
 let recovered:any;for(let i=0;i<60;i++){recovered=await registry.probeBackend('docker');if(recovered.manifest.availability==='available')break;await new Promise(r=>setTimeout(r,1000));}
 assert.equal(recovered.manifest.availability,'available');assert.equal(recovered.manifest.sageVersion,online.manifest.sageVersion);assert.deepEqual(recovered.manifest.reportedOperations,online.manifest.reportedOperations);check('real reconnect refreshes capability manifest',{manifest:recovered.manifest});
 const retry=await registry.run({operation:'sage.polynomial.factor',backend:'docker',params:{polynomial:'x^2-1',variables:['x']},jobId:'retry-'+crypto.randomUUID()}).promise;assert.equal(retry.broker.ok,true,JSON.stringify(retry));assert.equal(retry.response.success,true);const again=await service.submit(request());assert.equal(again.ok,true);const {elapsedMs:_a,...a}=(again as any).output;const {elapsedMs:_b,...b}=(initial as any).output;assert.deepEqual(a,b);assert.equal(readFileSync(file,'utf8'),raw);check('explicit new Job retry succeeds without rewriting saved historical result',{retry:retry.response});
}
