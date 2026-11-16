import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
export const journeys = ['fresh-install','upgrade','runtime-recovery'];
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export async function fileIdentity(filename) {
  const hash=createHash('sha256'); for await(const chunk of createReadStream(filename)) hash.update(chunk);
  return {name:path.basename(filename),sha256:hash.digest('hex'),bytes:(await stat(filename)).size};
}
export function confined(root, relative) {
  assert(relative && !path.isAbsolute(relative) && !/^[A-Za-z]:|\\/.test(relative),'Use portable relative paths');
  const result=path.resolve(root,relative); assert(result.startsWith(path.resolve(root)+path.sep),'Path escapes qualification root');return result;
}
export function validateManifest(m, source) {
  assert.equal(m.schema,'math3d.windows-qualification-package/v1');assert.match(source,/^[a-f0-9]{40}$/);
  assert.equal(m.sourceCommit,source,'Package source must equal the exact requested source');
  assert.equal(m.repository,'expert10000/Math3D');assert.equal(m.installerKind,'nsis');
  for(const field of ['applicationId','productName','channel','version']) assert(m[field],`Missing ${field}`);
  for(const field of ['installer','executable','worker']) {
    assert(m[field]?.path);assert.match(m[field].sha256,/^[a-f0-9]{64}$/);assert(Number.isSafeInteger(m[field].bytes)&&m[field].bytes>0);
    confined('/qualification',m[field].path);
    if(field!=='installer') confined('/qualification',m[field].installPath);
  }
  assert(['signed','unsigned'].includes(m.signing),'Signing must be recorded explicitly');return m;
}
export function validateUpgrade(old, candidate) {
  for(const field of ['applicationId','channel','productName']) assert.equal(old[field],candidate[field],`Upgrade ${field} mismatch; Dev is not a stable upgrade`);
  assert.notEqual(old.version,candidate.version,'An upgrade must change versions');
}
export async function verifyFile(filename, expected) {
  const actual=await fileIdentity(filename);assert.equal(actual.sha256,expected.sha256,'Artifact hash mismatch');assert.equal(actual.bytes,expected.bytes,'Artifact size mismatch');return actual;
}
export function verifyResources(pack) {
  assert.equal(pack.format,'math3d.project-package');assert(pack.resources.length>0,'Missing real resource sidecars');
  for(const r of pack.resources) {const bytes=Buffer.from(r.data,'base64');assert.equal('sha256:'+sha256(bytes),r.checksum);assert.equal(bytes.length,r.byteLength);}
}
export function requireComplete(receipt) {
  assert.equal(receipt.status,'passed');assert.equal(receipt.platform,'win32');assert.match(receipt.sourceCommit,/^[a-f0-9]{40}$/);assert.match(receipt.harnessCommit,/^[a-f0-9]{40}$/);
  assert.equal(receipt.mergedPr61Commit,receipt.sourceCommit);assert.equal(receipt.releaseApproved,false);
  for(const name of journeys) assert.equal(receipt.journeys[name]?.status,'passed',`${name} not complete`);
  assert.equal(receipt.journeys['fresh-install'].seedFixtureStatus,'passed');
  assert.equal(receipt.journeys.upgrade.profileRetentionStatus,'passed');
  for(const key of ['computeSave','actualRuntimeLossRetainsProject','offlineColdReopen','reconnectCapabilityRefresh','successfulRetry']) assert.equal(receipt.journeys['runtime-recovery'].checks?.[key],'passed',key);
  assert.equal(receipt.executedAll,true);return true;
}
