export default {async fetch(request,env){
 const url=new URL(request.url),json=(v,status=200,extra={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...extra}});
 if(url.pathname==='/acceptance/batch01.md')return new Response(acceptanceBatchReport,{headers:{'Content-Type':'text/markdown; charset=utf-8'}});
 if(url.pathname==='/acceptance/batch01.json')return json(acceptanceBatchEvidence);
 if(url.pathname==='/reviews/pr34/blockers.json')return json(remainingBlockerEvidence,200,{'Content-Disposition':'attachment; filename=M3D20_PR34_BLOCKER_RESULTS.json'});
 if(url.pathname==='/reviews/pr34/blockers.md')return new Response(remainingBlockerReport,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename=PR34_REMAINING_BLOCKERS.md'}});
 if(url.pathname==='/reviews/pr34/ci-readiness.json')return json(ciNarrowingEvidence,200,{'Content-Disposition':'attachment; filename=M3D20_PR34_CI_READINESS.json'});
 if(url.pathname==='/reviews/pr34/ci-readiness.md')return new Response(ciNarrowingReport,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename=PR34_CI_NARROWING_REVIEW.md'}});
 if(url.pathname==='/reviews/pr34/performance-evidence.json')return json(performanceEvidence,200,{'Content-Disposition':'attachment; filename=M3D20_PR34_PERFORMANCE_EVIDENCE.json'});
 if(url.pathname==='/reviews/pr34/performance.md')return new Response(performanceReport,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename=PR34_PERFORMANCE_VERIFICATION.md'}});
 if(url.pathname==='/reviews/pr34/workbook-audit-evidence.json')return json(workbookAuditEvidence,200,{'Content-Disposition':'attachment; filename=M3D20_WORKBOOK_AUDIT_EVIDENCE.json'});
 if(url.pathname==='/reviews/pr33/extended-evidence.json')return json(pr33ExtendedEvidence,200,{'Content-Disposition':'attachment; filename=M3D20_PR33_EXTENDED_CI_EVIDENCE.json'});
 if(url.pathname==='/reviews/pr33/evidence.json')return json(pr33Evidence,200,{'Content-Disposition':'attachment; filename=M3D20_PR33_SCOPED_CI_EVIDENCE.json'});
 if(url.pathname==='/reviews/pr33.md')return new Response(pr33Report,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename=PR33_IMPACT_AND_RERUN.md'}});
 if(url.pathname==='/phase0/report.md')return new Response(phase0Report,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename="MATH3D_PHASE0_RECONCILIATION_2026-11-07.md"'}});
 if(url.pathname==='/phase0/reconciliation.json')return json(phase0Audit);
 if(url.pathname==='/phase1/report.md')return new Response(phase1Report,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename="MATH3D_PHASE1_IMPLEMENTATION.md"'}});
 if(url.pathname==='/phase1/verification.json')return json(phase1Verification);
 if(url.pathname==='/phase2/report.md')return new Response(phase2Report,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename="MATH3D_PHASE2_IMPLEMENTATION.md"'}});
 if(url.pathname==='/phase2/verification.json')return json(phase2Verification);
 if(url.pathname==='/phase3/report.md')return new Response(phase3Report,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename="MATH3D_PHASE3_IMPLEMENTATION.md"'}});
 if(url.pathname==='/phase3/verification.json')return json(phase3Verification);
 if(url.pathname==='/api/integration-seed')return json(integrationLabSeed);
 const evidence=url.pathname.match(/^\/api\/evidence\/([a-f0-9]{64})$/);
 if(evidence){
  if(!env.BUCKET)return json({error:'Storage unavailable'},503);
  const key='integration/evidence/'+evidence[1];
  if(request.method==='GET'){const obj=await env.BUCKET.get(key);return obj?new Response(await obj.arrayBuffer(),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="evidence-'+evidence[1]+'.json"','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}}):json({error:'Evidence missing'},404)}
  if(request.method!=='PUT')return json({error:'Method not allowed'},405);
  if(request.headers.get('Origin')!==url.origin)return json({error:'Origin mismatch'},403);
  if(Number(request.headers.get('Content-Length'))>8*1024*1024)return json({error:'Evidence exceeds 8 MiB'},413);
  const bytes=await request.arrayBuffer();if(bytes.byteLength>8*1024*1024)return json({error:'Evidence exceeds 8 MiB'},413);
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==evidence[1])return json({error:'Evidence digest mismatch'},422);
  try{JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{return json({error:'Evidence must be valid JSON'},422)}
  if(!await env.BUCKET.get(key))await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'application/json'}});
  return json({sha256:'sha256:'+digest,byteLength:bytes.byteLength},201);
 }
 if(url.pathname==='/api/state'){
  if(!env.BUCKET)return json({error:'Storage unavailable'},503);
  if(request.method==='GET'){let obj=await env.BUCKET.get('integration/state.json');return new Response(obj?await obj.text():'null',{headers:{'Content-Type':'application/json','Cache-Control':'no-store',ETag:obj?.etag||'new'}})}
  if(request.method!=='PUT')return json({error:'Method not allowed'},405,{'Allow':'GET, PUT'});
  // Owner-private Sites gate authorizes visitors and supported service access; preserve that audience.
  if(request.headers.get('Origin')!==url.origin)return json({error:'Origin mismatch'},403);
  let tag=request.headers.get('If-Match');if(!tag)return json({error:'Revision precondition required'},428);
  let text=await request.text();if(new TextEncoder().encode(text).length>MAX_STATE_BYTES)return json({error:'Payload too large'},413);
  let oldObj=await env.BUCKET.get('integration/state.json');let oldTag=oldObj?.etag||'new';
  if(tag!==oldTag)return json({error:'Revision conflict',revision:oldObj?JSON.parse(await oldObj.text()).revision:0},409);
  let previous,d;try{const rawPrevious=oldObj?JSON.parse(await oldObj.text()):null;previous=rawPrevious?toV2(rawPrevious):null;d=toV2(JSON.parse(text));validateState(d);let action;try{action=decodeURIComponent(request.headers.get('X-Workspace-Action')||'Saved workspace')}catch{throw Error('Invalid action encoding')};if(action.length>300)throw Error('Action too long');d=serverRevision(d,previous,request.headers.get('oai-authenticated-user-id')||'owner-private-service',action,rawPrevious)}catch(e){return json({error:e.message},422)}
  const obj=await env.BUCKET.put('integration/state.json',JSON.stringify(d),{onlyIf:tag==='new'?{etagDoesNotMatch:'*'}:{etagMatches:tag},httpMetadata:{contentType:'application/json'}});
  if(!obj)return json({error:'Revision conflict'},409);
  return json(d,200,{ETag:obj.etag});
 }
 if(url.pathname.startsWith('/api/'))return json({error:'Not found'},404);
 return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}});
}};
