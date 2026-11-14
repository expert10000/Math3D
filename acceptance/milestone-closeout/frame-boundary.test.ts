import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { createCrossModuleAdapterRegistry, createPlatformCapabilitySnapshot, PLATFORM_FACILITIES,
 migrateProjectScientificSelections, parseMath3DProject, listProjectScientificSelections,
 viewerSourceFromDocument, referenceFromScientificSelection, qualifyCrossModuleAdapter } from '@math3d/core';
const adapter=JSON.parse(readFileSync('packages/core/fixtures/cross-module/current-v1.json','utf8'));
const project=migrateProjectScientificSelections(parseMath3DProject(readFileSync('tests/fixtures/scientific-selection/gf01-legacy-project.math3d','utf8')));
const saved=listProjectScientificSelections(project).find(s=>s.geometry.kind==='point'&&s.source?.kind==='document')!;
if(saved.source?.kind!=='document')throw Error('Missing fixture source');
const entry=project.workspace.entries.find(e=>e.expected.id===saved.source!.documentId)!;
const source=viewerSourceFromDocument(entry.checkpoint);
const pinned={...saved,source:{...saved.source,checkpoint:{revision:source.revision,structuralHash:source.structuralHash}}};
const bound=referenceFromScientificSelection(pinned,source,entry.module,adapter.sourceFrame,'point');
if(!bound.ok)throw Error(bound.errors.join(' '));
const registry=createCrossModuleAdapterRegistry([adapter]);
const platform=createPlatformCapabilitySnapshot({runtime:'desktop',adapterId:'acceptance-host',adapterVersion:'1',facilities:Object.fromEntries(PLATFORM_FACILITIES.map(k=>[k,{available:true,reason:null}])) as any});
const qualify=(side:string,frame:any)=>qualifyCrossModuleAdapter(registry,{adapterId:adapter.id,selection:side==='source'?{...bound.value,frame}:bound.value,targetModule:'graph2d',currentSource:source,targetFrame:side==='target'?frame:adapter.targetFrame,platform,operationAvailable:()=>true,mappingAvailable:()=>true});
describe('AC06 coordinate-frame boundary against unchanged production owners',()=>{
 it('qualifies matching frames without converting a mapping declaration into a transform',()=>{expect(qualify('target',adapter.targetFrame).enabled).toBe(true)});
 for(const side of ['source','target'])for(const change of ['frame-id','axis-order','dimension','unit'])it(`rejects ${side} ${change} even when operation and mapping are declared available`,()=>{
  const frame=structuredClone(side==='source'?adapter.sourceFrame:adapter.targetFrame);
  if(change==='frame-id')frame.frameId+='-different';
  if(change==='axis-order')frame.axes.reverse();
  if(change==='dimension')frame.axes[0].dimension='incompatible-dimension';
  if(change==='unit')frame.axes[0].unit='incompatible-unit';
  const result=qualify(side,frame);expect(result.enabled).toBe(false);expect(result.disabled.map(d=>d.code)).toContain(side+'-frame-mismatch');
 });
});
