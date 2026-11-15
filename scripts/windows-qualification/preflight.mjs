import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {validateManifest,validateUpgrade,verifyFile,confined,requireComplete} from './provenance.mjs';
const [mode,...args]=process.argv.slice(2);
if(mode==='check') {
 const [candidateFile,oldFile,source,oldSource]=args;
 const candidate=validateManifest(JSON.parse(await readFile(candidateFile)),source);
 const old=validateManifest(JSON.parse(await readFile(oldFile)),oldSource);validateUpgrade(old,candidate);
 await verifyFile(confined(path.dirname(candidateFile),candidate.installer.path),candidate.installer);
 await verifyFile(confined(path.dirname(oldFile),old.installer.path),old.installer);
 console.log('Package hashes, exact sources and same-product/channel upgrade boundary verified. No installer executed.');
} else if(mode==='complete') {
 const file=args[0],receipt=JSON.parse(await readFile(file));requireComplete(receipt);console.log('All required Windows installed journeys actually passed. Signing remains separate.');
} else if(mode==='manifest') {
 const [file,source,repository,version,applicationId,productName,channel,signing,installer,executable,worker]=args;
 const {fileIdentity}=await import('./provenance.mjs');const root=path.dirname(path.resolve(file));
 const relative=x=>path.relative(root,path.resolve(x)).split(path.sep).join('/');
 const m={schema:'math3d.windows-qualification-package/v1',repository,sourceCommit:source,version,applicationId,productName,channel,signing,installerKind:'nsis'};
 for(const [key,value] of Object.entries({installer,executable,worker})) m[key]={path:relative(value),...await fileIdentity(value)};
 m.executable.installPath=path.basename(executable);m.worker.installPath='resources/python-worker/'+path.basename(worker);
 validateManifest(m,source);await writeFile(file,JSON.stringify(m,null,2)+'\n');
} else throw new Error('Use check, manifest or complete; missing inputs never mean PASS');
