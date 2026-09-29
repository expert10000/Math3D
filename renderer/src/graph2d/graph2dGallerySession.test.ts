import { describe, expect, it } from "vitest";
import { createGraph2DWorkspaceProject, createMixedWorkspaceDocument, createWorkspaceProjectHandoff, getGraph2DPresetCatalog,
  instantiateGraph2DPreset, serializeWorkspaceProjectHandoff, parseWorkspaceProjectHandoff, promoteGraph2DToCurve,
  analyzeGraph2DDerivative, type Graph2DDocument } from "@math3d/core";
import { launchGraphGalleryPreset, resumeGraphGalleryCheckpoint, listGraphGalleryCheckpoints, listGraphGalleryPresetCopies } from "./graph2dGallerySession";

const storage = () => {
  const values = new Map<string,string>(); let failKey: string|null=null;
  return { values, fail:(key:string)=>{failKey=key;}, getItem:(key:string)=>values.get(key)??null,
    setItem:(key:string,value:string)=>{if(key===failKey){failKey=null;throw new Error("quota unavailable");}values.set(key,value);}, removeItem:(key:string)=>{values.delete(key);} };
};
const scene = () => {
  const preset=getGraph2DPresetCatalog().get("parabola-tangent")!, doc=instantiateGraph2DPreset(preset,"current").document;
  const target=promoteGraph2DToCurve(doc,doc.source.objects[0]!.id),result=analyzeGraph2DDerivative({document:doc,objectId:doc.source.objects[0]!.id,x:1,order:1,tolerance:1e-5}).publication;
  const workspace=createMixedWorkspaceDocument({...createGraph2DWorkspaceProject(doc),
    entries:[...createGraph2DWorkspaceProject(doc).entries,{module:"curve",checkpoint:target.document,expected:target.document.identity,replay:null}],relations:[target.relation],results:[result]});
  return {workspace,doc};
};
describe("gallery checkpoint launch transaction",()=>{
  it("discovers active/preserved preset copies without mutation and restores their launch association",()=>{
    const s=storage(),old=scene(),preset=getGraph2DPresetCatalog().get("line-comparison")!;
    const first=launchGraphGalleryPreset(()=>old.workspace,preset,"remember-one",s),id=first.entries[0]!.expected.id;
    const before=[...s.values];
    expect(listGraphGalleryPresetCopies(s,id,"Edited slope")).toEqual([{id,title:"Edited slope",presetId:preset.id,version:1,active:true}]);
    expect([...s.values]).toEqual(before);
    const second=launchGraphGalleryPreset(()=>first,getGraph2DPresetCatalog().get("lissajous")!,"remember-two",s);
    expect(listGraphGalleryPresetCopies(s,second.entries[0]!.expected.id,"Lissajous loops").find(c=>c.id===id)).toMatchObject({presetId:preset.id,version:1,active:false});
    const restored=resumeGraphGalleryCheckpoint(()=>second,id,s);
    expect(restored.entries).toEqual(first.entries);
    expect(listGraphGalleryPresetCopies(s,id,"Edited slope")[0]).toMatchObject({id,presetId:preset.id,active:true});
    // Original v1 checkpoints remain readable; unknown origin is not guessed.
    const oldId=old.doc.identity.id,key=`math3d.mixed-workspace.v1.gallery-checkpoint.${oldId}`;
    const value=JSON.parse(s.getItem(key)!);delete value.origin;value.version=1;s.setItem(key,JSON.stringify(value));
    const legacy=resumeGraphGalleryCheckpoint(()=>restored,oldId,s);expect(legacy.entries).toEqual(old.workspace.entries);
    expect(listGraphGalleryPresetCopies(s,oldId,"Legacy").some(c=>c.active)).toBe(false);
  });
  it("resumes the last durable gallery copy after restart instead of treating it as another fresh launch",()=>{
    const s=storage(),old=scene(),preset=getGraph2DPresetCatalog().get("line-comparison")!;
    const first=launchGraphGalleryPreset(()=>old.workspace,preset,"restart",s),id=first.entries[0]!.expected.id;
    expect(listGraphGalleryPresetCopies(s,"math3d:graph2d:new-session","Empty")[0]).toMatchObject({id,presetId:preset.id,active:false});
    const restored=resumeGraphGalleryCheckpoint(()=>old.workspace,id,s);
    expect(restored.entries).toEqual(first.entries);
    expect(listGraphGalleryPresetCopies(s,id,preset.title)[0]).toMatchObject({id,active:true});
  });
  it("preserves imported companions/results/ancestry and clears ancestry for a fresh preset",()=>{
    const s=storage(),old=scene(),manifest=createWorkspaceProjectHandoff(old.workspace,{producer:{platform:"desktop",name:"Math3D",version:"1"}});
    s.setItem("math3d.graph2d-handoff.v2",serializeWorkspaceProjectHandoff({...manifest,baseRevision:manifest.projectRevision}));
    // Host exposes just its live Graph; retained imported companions must still survive.
    const next=launchGraphGalleryPreset(()=>createGraph2DWorkspaceProject(old.doc),getGraph2DPresetCatalog().get("lissajous")!,"new",s);
    expect(parseWorkspaceProjectHandoff(s.getItem("math3d.graph2d-handoff.v2")!).baseRevision).toBeNull();
    expect(listGraphGalleryCheckpoints(s)).toEqual([{id:old.doc.identity.id,title:old.doc.metadata.title}]);
    const restored=resumeGraphGalleryCheckpoint(()=>next,old.doc.identity.id,s);
    expect(restored.results).toEqual(old.workspace.results);expect(restored.relations).toEqual(old.workspace.relations);
    expect(restored.entries).toEqual(old.workspace.entries);
    expect(parseWorkspaceProjectHandoff(s.getItem("math3d.graph2d-handoff.v2")!).baseRevision).toBe(manifest.projectRevision);
  });
  it("stages point rows and restores all durable keys when any write fails",()=>{
    const old=scene(),preset=getGraph2DPresetCatalog().get("piecewise-data-gaps")!;
    for(const fail of ["math3d.mixed-workspace.v1.gallery-checkpoints",`math3d.graph2d.table.${preset.sidecars[0]!.id}`,"math3d.mixed-workspace.v1","math3d.graph2d-handoff.v2","math3d.graph2d.gallery-origin","math3d.graph2d.gallery-preferences.v1"]) {
      const s=storage();s.setItem("math3d.mixed-workspace.v1","prior data");const before=[...s.values];s.fail(fail);
      expect(()=>launchGraphGalleryPreset(()=>old.workspace,preset,"fail",s)).toThrow(/quota/);
      expect([...s.values].sort()).toEqual(before.sort());expect(old.doc.source.objects).toHaveLength(2);
    }
    const s=storage(),next=launchGraphGalleryPreset(()=>old.workspace,preset,"data",s);
    expect(JSON.parse(s.getItem(`math3d.graph2d.table.${preset.sidecars[0]!.id}`)!)).toEqual(preset.sidecars[0]!.rows);
    expect((next.entries[0]!.checkpoint as Graph2DDocument).source.objects).toHaveLength(2);
  });
  it("keeps independent projects and refuses missing/corrupt checkpoints",()=>{
    const old=scene(),s=storage(),preset=getGraph2DPresetCatalog().get("lissajous")!;
    const first=launchGraphGalleryPreset(()=>old.workspace,preset,"one",s),second=launchGraphGalleryPreset(()=>first,preset,"two",s);
    expect(second.entries[0]!.expected.id).not.toBe(first.entries[0]!.expected.id);
    expect(listGraphGalleryCheckpoints(s)).toHaveLength(2);
    expect(()=>resumeGraphGalleryCheckpoint(()=>second,"missing",s)).toThrow(/unavailable/);
    s.setItem(`math3d.mixed-workspace.v1.gallery-checkpoint.${old.doc.identity.id}`,"{}");
    expect(()=>resumeGraphGalleryCheckpoint(()=>second,old.doc.identity.id,s)).toThrow(/Invalid/);
  });
  it("allows resuming at capacity while refusing another fresh project without losing saved work",()=>{
    const s=storage(),old=scene(),preset=getGraph2DPresetCatalog().get("lissajous")!;
    let current=old.workspace;
    for(let i=0;i<32;i++) {
      const captured=current;
      current=launchGraphGalleryPreset(()=>captured,preset,`capacity-${i}`,s);
    }
    expect(listGraphGalleryCheckpoints(s)).toHaveLength(32);
    const before=[...s.values],captured=current;
    expect(()=>launchGraphGalleryPreset(()=>captured,preset,"overflow",s)).toThrow(/32 Graph checkpoints/);
    expect([...s.values]).toEqual(before);
    const restored=resumeGraphGalleryCheckpoint(()=>captured,old.doc.identity.id,s);
    expect(restored.entries).toEqual(old.workspace.entries);
    const index=listGraphGalleryCheckpoints(s);
    expect(index).toHaveLength(32);
    expect(index.some(entry=>entry.id===old.doc.identity.id)).toBe(false);
    expect(index.some(entry=>entry.id===captured.entries[0]!.expected.id)).toBe(true);
  });
});
