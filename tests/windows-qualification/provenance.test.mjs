import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {sha256,fileIdentity,verifyFile,confined,validateManifest,validateUpgrade,verifyResources,requireComplete,journeys} from '../../scripts/windows-qualification/provenance.mjs';
const source='a'.repeat(40),asset={path:'Math3D.exe',installPath:'Math3D.exe',sha256:'b'.repeat(64),bytes:1};
const manifest=()=>({schema:'math3d.windows-qualification-package/v1',repository:'expert10000/Math3D',sourceCommit:source,installerKind:'nsis',applicationId:'same-id',productName:'Math3D',channel:'stable',version:'2.0.0',signing:'unsigned',installer:asset,executable:asset,worker:asset});
const run=promisify(execFile);
test('different source and missing hashes cannot be qualified',()=>{validateManifest(manifest(),source);assert.throws(()=>validateManifest(manifest(),'c'.repeat(40)));const bad=manifest();bad.worker={path:'worker.exe'};assert.throws(()=>validateManifest(bad,source));});
test('Dev and stable product/channel mismatches are not upgrade acceptance',()=>{const candidate=manifest(),old={...manifest(),version:'1.7.0'};validateUpgrade(old,candidate);assert.throws(()=>validateUpgrade({...old,channel:'dev'},candidate));assert.throws(()=>validateUpgrade({...old,applicationId:'dev-id'},candidate));assert.throws(()=>validateUpgrade({...old,productName:'Math3D Dev'},candidate));});
test('sidecar and byte hashing detect tampering, not just matching references',async()=>{for(const name of ['mesh','mixed']){const pack=JSON.parse(await readFile(new URL(`./fixture/${name}.resources.json`,import.meta.url)));verifyResources(pack);const broken=structuredClone(pack);broken.resources[0].data=Buffer.from('corrupt').toString('base64');assert.throws(()=>verifyResources(broken));}});
test('installer hashes reject changed bytes and sizes',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'m3d-qualification-'));try{const file=path.join(dir,'test.exe');await writeFile(file,'installer-v1');const expected=await fileIdentity(file);await verifyFile(file,expected);await writeFile(file,'installer-v2');await assert.rejects(verifyFile(file,expected));await assert.rejects(verifyFile(file,{...expected,bytes:0}));}finally{await rm(dir,{recursive:true});}});
test('package preflight checks all six artifact files before installation',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'m3d-qualification-preflight-'));
  const preflight=new URL('../../scripts/windows-qualification/preflight.mjs',import.meta.url);
  const oldSource='c'.repeat(40);
  try {
    const files={};
    for(const kind of ['candidate','old']) {
      const root=path.join(dir,kind);await mkdir(root);
      const entries={};
      for(const asset of ['installer','executable','worker']) {
        const filename=path.join(root,`${asset}.exe`);
        await writeFile(filename,`${kind}-${asset}-original`);
        entries[asset]={path:`${asset}.exe`,...await fileIdentity(filename)};
        if(asset!=='installer') entries[asset].installPath=`${asset}.exe`;
        files[`${kind}-${asset}`]=filename;
      }
      const m={...manifest(),...entries,version:kind==='candidate'?'2.0.0':'1.7.0',sourceCommit:kind==='candidate'?source:oldSource};
      await writeFile(path.join(root,`${kind}.json`),JSON.stringify(m));
    }
    const check=()=>run(process.execPath,[fileURLToPath(preflight),'check',path.join(dir,'candidate','candidate.json'),path.join(dir,'old','old.json'),source,oldSource]);
    await check();
    for(const name of Object.keys(files)) {
      const filename=files[name],original=await readFile(filename);
      await writeFile(filename,`${name}-tampered`);
      await assert.rejects(check(),`Accepted changed ${name}`);
      await writeFile(filename,original);
    }
    await rm(files['old-worker']);
    await assert.rejects(check(),'Accepted missing old worker');
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('a package preflight failure retains a failed receipt without starting an installer',{skip:process.platform!=='win32'},async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'m3d-qualification-receipt-'));
  const root=path.join(dir,'run');
  const script=fileURLToPath(new URL('../../scripts/windows-qualification/run.ps1',import.meta.url));
  try {
    await assert.rejects(run('pwsh',['-NoProfile','-File',script,'-CandidateManifest',path.join(dir,'missing-candidate.json'),'-OldManifest',path.join(dir,'missing-old.json'),'-SourceCommit',source,'-OldSourceCommit','c'.repeat(40),'-HarnessCommit','d'.repeat(40),'-MergedPr61Commit',source,'-RunRoot',root],{env:{...process.env,GITHUB_ACTIONS:'true',RUNNER_TEMP:dir}}));
    const receipt=JSON.parse(await readFile(path.join(root,'qualification.json'),'utf8'));
    assert.equal(receipt.status,'failed');
    assert.equal(receipt.stage,'package-preflight');
    assert.equal(receipt.releaseApproved,false);
    assert.equal(receipt.executedAll,false);
    assert.equal(receipt.journeys['fresh-install'].status,'missing');
    assert.equal(receipt.candidate,null);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('profile seed contains two existing Projects, nonempty results and a replay selection',async()=>{const seed=JSON.parse(await readFile(new URL('./fixture/profile-seed.json',import.meta.url)));assert.equal(seed.status,'prepared-not-executed');assert.equal(seed.packets.length,2);let selected=false;for(const p of seed.packets){const pack=JSON.parse(await readFile(new URL('./fixture/'+p.file,import.meta.url)));assert.equal(pack.project.identity.id,p.projectId);assert(pack.project.workspace.results.length);selected ||= JSON.stringify(pack.project.workspace.entries).includes('mesh-face:0');assert(pack.resources.length);}assert(selected);});
test('skipped, cancelled, missing, incomplete and failed journeys never pass qualification',()=>{const receipt={status:'passed',platform:'win32',sourceCommit:source,mergedPr61Commit:source,harnessCommit:'d'.repeat(40),releaseApproved:false,executedAll:true,journeys:{'fresh-install':{status:'passed',seedFixtureStatus:'passed'},upgrade:{status:'passed',profileRetentionStatus:'passed'},'runtime-recovery':{status:'passed',checks:Object.fromEntries(['computeSave','actualRuntimeLossRetainsProject','offlineColdReopen','reconnectCapabilityRefresh','successfulRetry'].map(k=>[k,'passed']))}}};requireComplete(receipt);for(const state of ['skipped','cancelled','missing','incomplete','failed'])for(const journey of journeys){const bad=structuredClone(receipt);bad.journeys[journey].status=state;assert.throws(()=>requireComplete(bad));}assert.throws(()=>requireComplete({...receipt,platform:'linux'}));assert.throws(()=>requireComplete({...receipt,mergedPr61Commit:'e'.repeat(40)}));assert.throws(()=>requireComplete({...receipt,status:'incomplete'}));});
test('manifest paths cannot escape into another profile or install root',()=>{assert.throws(()=>confined('/run','../elsewhere'));assert.throws(()=>confined('/run','C:\\Users\\someone'));assert.throws(()=>confined('/run','/tmp/elsewhere'));assert.equal(confined('/run','safe/Math3D.exe'),path.resolve('/run/safe/Math3D.exe'));});
