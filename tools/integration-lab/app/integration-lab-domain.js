// Integration evidence extends the existing runs / changesets / reviews collections.
const LAB_RESULTS=['passed','failed','blocked','missing','cancelled','incomplete','skipped'];
const LAB_SHA=/^[a-f0-9]{40}$/i;
function labOutcome(run){
 if(!run)return 'missing';if(run.result!=='passed')return LAB_RESULTS.includes(run.result)?run.result:'missing';
 const e=run.integration;if(!e)return 'passed';const c=e.counts;
 if(!c||!Number.isSafeInteger(c.expected)||c.expected<1)return 'incomplete';
 if(c.failed)return 'failed';if(c.cancelled)return 'cancelled';if(c.missing)return 'missing';
 if(c.skipped)return 'skipped';if(c.incomplete||c.passed!==c.expected)return 'incomplete';return 'passed';
}
function labFullPass(r){return labOutcome(r)==='passed'&&(!r.integration||r.integration.coverage==='full')}
function labRuns(d){return d.runs.filter(r=>r.integration)}
function labLatest(d,runs=labRuns(d)){
 const map=new Map();for(const r of latestItems(runs)){const e=r.integration,key=[r.repository,r.commit,e.target,e.workflow,e.scopeKey,r.environment].join('|');const old=map.get(key);if(!old||e.attempt>old.integration.attempt)map.set(key,r)}return [...map.values()];
}
function labScopeDiff(a,b){const x=new Set(a?.integration?.scopeTests||[]),y=new Set(b?.integration?.scopeTests||[]);return {common:[...x].filter(v=>y.has(v)),onlyA:[...x].filter(v=>!y.has(v)),onlyB:[...y].filter(v=>!x.has(v)),sameCommit:!!a&&!!b&&a.commit===b.commit,sameEnvironment:!!a&&!!b&&a.environment===b.environment,sameTarget:!!a&&!!b&&a.integration.target===b.integration.target}}
function labGate(d,target=null){const all=latestItems(labRuns(d).filter(r=>r.integration.gate==='windows-signing'&&(!target||r.repository===target.repository))),r=target?all.find(r=>r.commit===target.commit)||all[0]:all[0];const exact=!target||r?.commit===target.commit;return {status:r&&exact&&labOutcome(r)==='passed'?'passed':r?'blocked':'missing',runId:r?.id||null,reason:r&&!exact?'Signing evidence does not cover this exact target. '+(r.integration.recoveryCondition||'Run the real signed installer gate for the accepted commit.'):r?.integration.recoveryCondition||'A successful signed Windows installer observation has not been recorded.'}}
function labBaselineAssessment(d,p,checkIds){const checks=checkIds.map(id=>({id,summary:assessCheck(d,d.checks.find(c=>c.id===id),p)}));return {accepted:checkIds.length>0&&checks.every(x=>x.summary.accepted&&x.summary.result==='passed'),checks,gate:labGate(d,p)}}
function validateLab(d){
 const ref=(ids,kind)=>Array.isArray(ids)&&new Set(ids).size===ids.length&&ids.every(id=>d[kind].some(r=>r.id===id));
 for(const r of labRuns(d)){
  const e=r.integration;if(e.version!==1||!['head','merge','direct'].includes(e.target)||e.targetCommit!==r.commit||!LAB_SHA.test(e.targetCommit)||!['scoped','full','observation'].includes(e.coverage)||!Number.isSafeInteger(e.attempt)||e.attempt<1||typeof e.workflow!=='string'||!e.workflow.trim()||typeof e.scopeKey!=='string'||!e.scopeKey.trim())throw Error('Invalid Integration Lab provenance: '+r.id);
  for(const k of ['workflowCommit','treeSha','baseCommit'])if(e[k]&& !LAB_SHA.test(e[k]))throw Error('Invalid SHA '+k);
  if(!ref(e.checkIds,'checks')||!ref(e.testIds,'tests')||!ref(e.taskIds,'backlog')||!Array.isArray(e.scopeTests)||e.scopeTests.some(s=>typeof s!=='string'||!s.trim()))throw Error('Invalid shared evidence links: '+r.id);
  if(e.counts!==null){if(!e.counts||['expected','passed','failed','skipped','missing','cancelled','incomplete'].some(k=>!Number.isSafeInteger(e.counts[k])||e.counts[k]<0))throw Error('Invalid execution counts');const c=e.counts;if(c.passed+c.failed+c.skipped+c.missing+c.cancelled+c.incomplete!==c.expected)throw Error('Execution counts do not cover the expected scope')}
  if(!Array.isArray(e.attachments)||e.attachments.some(a=>!a||typeof a.name!=='string'||a.name.length>300||!/^sha256:[a-f0-9]{64}$/.test(a.sha256)||!Number.isSafeInteger(a.byteLength)||a.byteLength<0||!safeURL(a.url)))throw Error('Invalid evidence attachment');
  if(!Array.isArray(e.tags)||e.tags.some(t=>typeof t!=='string'))throw Error('Invalid journey tags');
 }
 for(const r of d.reviews.filter(x=>x.kind==='baseline')){
  if(r.archived||!r.milestone?.trim()||!r.reviewer?.trim()||!r.rationale?.trim()||!/^[-\w.]+\/[-\w.]+$/.test(r.repository)||r.changeSetId!==null&&!d.changesets.some(c=>c.id===r.changeSetId)||r.decision!=='accepted'||!LAB_SHA.test(r.commit)||!['head','merge','direct'].includes(r.target)||!ref(r.checkIds,'checks')||!r.checkIds.length||!ref(r.runIds,'runs')||!r.checkSnapshot?.length||r.checkSnapshot.some(c=>!c.accepted||c.result!=='passed')||!Array.isArray(r.environments)||!r.environments.length||!Number.isInteger(r.recordedSequence)||!r.recordedAt||!r.gateSnapshot)throw Error('Invalid milestone acceptance baseline');
 }
}
function validateLabChanges(d,previous){
 for(const r of d.reviews.filter(x=>x.kind==='baseline'&&!previous?.reviews.some(p=>p.id===x.id))){const assessment=labBaselineAssessment(d,{repository:r.repository,commit:r.commit,environments:r.environments,changeSetId:r.changeSetId,target:r.target},r.checkIds);if(!assessment.accepted||canonical(r.checkSnapshot)!==canonical(assessment.checks.map(x=>({id:x.id,accepted:x.summary.accepted,result:x.summary.result})))||canonical(r.gateSnapshot)!==canonical(assessment.gate))throw Error('Baseline requires current complete executed acceptance and the real release gate snapshot')}
}
function labRunSignature(r){const x=clone(r);for(const k of ['revision','updatedAt','recordedAt','recordedSequence'])delete x[k];return canonical(x)}
function labImport(d,report){
 if(report?.format!=='math3d.integration-evidence'||report.version!==1)throw Error('Unsupported Integration Lab report');const next=clone(d);
 for(const [key,kind] of [['tests','tests'],['changesets','changesets'],['runs','runs']])for(const row of report[key]||[]){const old=next[kind].find(r=>r.id===row.id);if(old){if(labRunSignature(old)!==labRunSignature(row)&&kind==='runs')throw Error('Immutable evidence ID collision: '+row.id);continue}next[kind].push(clone(row))}
 validateState(next);return next;
}
function labReportCounts(report){
 if(report?.stats){const s=report.stats,expected=(s.expected||0)+(s.unexpected||0)+(s.skipped||0)+(s.flaky||0);return {expected,passed:s.expected||0,failed:s.unexpected||0,skipped:s.skipped||0,missing:0,cancelled:0,incomplete:s.flaky||0}}
 if(Number.isInteger(report?.numTotalTests)){const passed=report.numPassedTests||0,failed=report.numFailedTests||0,skipped=report.numPendingTests||0;return {expected:report.numTotalTests,passed,failed,skipped,missing:Math.max(0,report.numTotalTests-passed-failed-skipped),cancelled:0,incomplete:0}}
 throw Error('Attach a Playwright JSON or Vitest JSON report, or import the Integration Lab report format');
}

function labReportScope(report){if(Array.isArray(report.testResults))return [...new Set(report.testResults.map(r=>r.name).filter(Boolean))];const found=[];function visit(s){for(const p of s.specs||[])found.push((p.file||s.file||'')+' :: '+p.title);for(const nested of s.suites||[])visit(nested)}visit(report);return found}
