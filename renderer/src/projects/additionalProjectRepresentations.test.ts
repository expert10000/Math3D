import { describe, expect, it } from "vitest";
import { canonicalJsonStringify, createMath3DProject, createMixedWorkspaceDocument, createSurfaceDocument, createCommandEnvelope, createDocumentIdentity, projectCommandTransaction, curveCommandDefinitions, type CanonicalJsonValue } from "@math3d/core";
import { CurveDocumentAdapter } from "../curveAnalysis/curveDocumentAdapter";
import { additionalRepresentationFixture } from "../../../tests/fixtures/unified-projects/additionalRepresentations";
import { additionalRepresentationView, replaceAdditionalSource, type AdditionalDocument } from "./additionalProjectRepresentations";
import { AdditionalProjectSession, additionalReplayEditable } from "./additionalProjectSession";
import { inspectProjectCompatibility, exportProjectFile, previewProjectImport } from "./projectTransfer";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { meshResourceFixture } from "../../../tests/fixtures/unified-projects/meshResources";
import { parseProjectPackage } from "./projectResources";

const fixture=additionalRepresentationFixture(),context={documents:new Map(fixture.docs.map((d)=>[d.identity.id,d]))};
const title=(document:AdditionalDocument)=>"metadata"in document?document.metadata.title:document.source.kind;
const modified=(document:AdditionalDocument):CanonicalJsonValue=>{
  const source=JSON.parse(JSON.stringify(document.source));
  if(document.format==="math3d.curve-document") {
    if(source.definition.points)source.definition.points[0][0]+=1;
    else if(source.definition.controlPoints)source.definition.controlPoints[0][0]-=1;
    else if(source.representation==="polar")source.definition.expressions.radius="3";
    else if(source.representation==="implicit")source.definition.expressions.formula="x*x+y*y-0.25";
    else if(source.representation==="curve-on-surface")source.definition.expressions.v="t";
    else source.definition.expressions.y="2*t";
  } else if(document.format==="math3d.surface-document") {
    if(source.representation==="constructed")source.parameters.angle=1;
    else if(source.representation==="spline") { const settings=JSON.parse(source.definition.settings.splineSettings),key=Object.keys(settings).find((key)=>key.endsWith("ControlGridText"))!,grid=JSON.parse(settings[key]);grid[0][0][2]=0.5;settings[key]=JSON.stringify(grid);source.definition.settings.splineSettings=JSON.stringify(settings); }
    else if(source.representation==="implicit")source.definition.expressions.formula="x*x+y*y+z*z-0.25";
    else if(source.representation==="explicit")source.definition.expressions.formula="x-y";
    else if(source.representation==="weierstrass")source.definition.expressions.phi="2";
    else source.definition.expressions.z="2*v";
  } else if(document.format==="math3d.geometry-document")source.geometry.points[1].x=6;
  else if(source.kind==="cw-complex")source.model.vertices.push({id:"extra"});
  else source.model.vertexIds.push("extra");
  return source;
};

describe("PRJ16 additional saved representations",()=>{
  it("reuses unchanged render buffers and invalidates source and missing-parent generations",()=>{
    const document=fixture.docs.find(d=>title(d)==="Saved extrusion")!;
    const entry=fixture.project.workspace.entries.find(e=>e.expected.id===document.identity.id)!;
    const documents=new Map(context.documents), session=new AdditionalProjectSession(entry,document,()=>({documents}));
    const initial=session.view();
    expect(session.view()).toBe(initial);
    session.commit(modified(document));
    const edited=session.view();expect(edited).not.toBe(initial);expect(session.view()).toBe(edited);
    session.undo();expect(session.view().bounds).toEqual(initial.bounds);
    const source=document.source as { definition: { sourceIds: string[] } };
    documents.delete(source.definition.sourceIds[0]!);
    expect(()=>session.view()).toThrow(/Missing|stale/);
  });
  for(const document of fixture.docs)it(`${title(document)} preserves source, edit history, independent export and reopen`,()=>{
    const entry=fixture.project.workspace.entries.find((e)=>e.expected.id===document.identity.id)!;
    const session=new AdditionalProjectSession(entry,document,()=>context),before=canonicalJsonStringify(document);
    expect(canonicalJsonStringify(session.document())).toBe(before);
    expect(session.view().sampleCount).toBeGreaterThan(0);
    session.commit(modified(document));session.undo();session.redo();
    const saved=session.document(),project=createMath3DProject(createMixedWorkspaceDocument({...fixture.project.workspace,entries:fixture.project.workspace.entries.map((e)=>e.expected.id===document.identity.id?session.entry():e)}),{stableKey:"matrix-export"});
    const imported=previewProjectImport(exportProjectFile(project));expect(imported.canOpenWorkspace).toBe(!["Construction parent","Second parent","Chart parent"].includes(title(document)));
    const resolved=verifyMixedWorkspaceReplay(imported.project.workspace),newEntry=imported.project.workspace.entries.find((e)=>e.expected.id===document.identity.id)!;
    const reopened=new AdditionalProjectSession(newEntry,resolved.get(document.identity.id) as AdditionalDocument,()=>context);
    expect(reopened.document()).toEqual(saved);expect(reopened.history().undoDepth).toBe(1);
    reopened.undo();expect(reopened.document().source).toEqual(document.source);
    const undoProject=createMath3DProject(createMixedWorkspaceDocument({...fixture.project.workspace,entries:fixture.project.workspace.entries.map((e)=>e.expected.id===document.identity.id?reopened.entry():e)}),{stableKey:"undo-export"});
    const undoResolved=verifyMixedWorkspaceReplay(undoProject.workspace);expect(undoResolved.get(document.identity.id)).toEqual(reopened.document());
    const again=new AdditionalProjectSession(reopened.entry(),reopened.document(),()=>context);again.redo();expect(again.document().source).toEqual(saved.source);
    again.undo(); const rejected=again.entry();expect(()=>again.commit({...modified(document) as object,invalid:true} as CanonicalJsonValue)).toThrow();expect(again.entry()).toEqual(rejected);expect(again.history().redoDepth).toBe(1);
    again.commit(modified(document));expect(again.document().identity.id).toBe(document.identity.id);
  });
  it("checks independent numerical and incidence oracles",()=>{
    const view=(name:string)=>additionalRepresentationView(fixture.docs.find((d)=>title(d)===name)!,context);
    expect(view("Saved polyline").bounds).toEqual({min:[3,0,0],max:[8,4,2]});
    expect(view("Saved polar").bounds?.max[0]).toBeCloseTo(2,8);expect(view("Saved polar").bounds?.min[1]).toBeCloseTo(-2,8);
    expect(view("Saved bezier").bounds?.max[1]).toBeCloseTo(1,8);expect(view("Saved nurbs").bounds?.max[1]).toBeCloseTo(4/3,8);
    expect(view("Saved chart Curve").bounds?.max).toEqual([1,1,2]);
    expect(view("Saved explicit Surface").bounds).toEqual({min:[-1,-2,-3],max:[1,2,3]});
    expect(view("Saved implicit Surface").bounds?.max[0]).toBeCloseTo(1,2);
    expect(view("Saved extrusion").bounds?.max[2]).toBeCloseTo(3,8);
    expect(view("Saved ruled-surface").bounds?.max[2]).toBeCloseTo(2,8);
    expect(view("Saved scene constructions").scene.points).toContainEqual({x:2,y:0,z:0});
    expect(view("Saved bezierSurface").bounds?.max).toEqual([1,1,1]);
    expect(view("Saved Weierstrass").bounds?.max[0]).toBeCloseTo(0.5,5);
    const topology=fixture.docs.find((d)=>d.format==="math3d.topology-document"&&d.source.kind==="simplicial-complex")!;
    expect(additionalRepresentationView(topology,context).qualification).toContain("3 vertices · 3 edges · 1 faces");
  });
  it("rejects incomplete splines, missing/stale parents, cycles and historical unsupported sources",()=>{
    const spline=fixture.docs.find((d)=>title(d)==="Saved nurbs")!,entry=fixture.project.workspace.entries.find((e)=>e.expected.id===spline.identity.id)!;
    const session=new AdditionalProjectSession(entry,spline,()=>context),source=JSON.parse(JSON.stringify(spline.source));delete source.definition.weights;
    expect(()=>session.commit(source)).toThrow("weights");
    const chart=fixture.docs.find((d)=>title(d)==="Saved chart Curve")!,missing={documents:new Map([[chart.identity.id,chart]])};expect(()=>additionalRepresentationView(chart,missing)).toThrow("exact");
    const patch=fixture.docs.find((d)=>title(d)==="Chart parent")!,stale={documents:new Map(context.documents)};stale.documents.set(patch.identity.id,{...patch,identity:{...patch.identity,revision:2}});expect(()=>additionalRepresentationView(chart,stale)).toThrow("exact");
    const implicit=fixture.docs.find((d)=>title(d)==="Saved implicit Curve")!,bad=JSON.parse(JSON.stringify(implicit.source));delete bad.definition.settings.xMin;expect(()=>additionalRepresentationView(replaceAdditionalSource(implicit,bad),context)).toThrow("domain");
    const surface=fixture.docs.find((d)=>title(d)==="Saved bSplineSurface")!,invalid=JSON.parse(JSON.stringify(surface.source));invalid.definition.settings.splineSettings='{}';expect(()=>additionalRepresentationView(replaceAdditionalSource(surface,invalid),context)).toThrow("grid");
    const replaySession=new AdditionalProjectSession(entry,spline,()=>context);replaySession.commit(modified(spline));replaySession.undo();const exported=replaySession.entry(),payload=JSON.parse(JSON.stringify(exported.replay!.payload));payload.transactions[0].forward.command.payload=source;
    expect(additionalReplayEditable({...exported,replay:{...exported.replay!,payload}},replaySession.document(),context)).toBe(false);
  });
  it("opens mesh-backed Surface only with verified referenced Mesh buffers",()=>{
    const mesh=meshResourceFixture(),parsed=parseProjectPackage(mesh.raw),documents=verifyMixedWorkspaceReplay(parsed.project.workspace),parent=documents.get(mesh.docs[0].identity.id)!;
    const surface=createSurfaceDocument({stableKey:"mesh-surface",source:{representation:"mesh-backed",domain:{kind:"mesh"},units:{length:"mm"},orientation:{sign:1},definition:{familyId:"snapshot",meshId:parent.identity.id},parameters:{meshGeneration:{documentId:parent.identity.id,revision:parent.identity.revision,structuralHash:parent.identity.structuralHash}},branchPolicy:null}});
    const entry={module:"surface" as const,checkpoint:surface,expected:surface.identity,replay:null};documents.set(surface.identity.id,surface);
    expect(additionalReplayEditable(entry,surface,{documents})).toBe(false);
    const session=new AdditionalProjectSession(entry,surface,()=>({documents,resources:parsed.resources}));expect(Array.from(session.view().meshes[0].positions)).toEqual([2,0,0,3,0,0,2,1,0]);
    session.commit({...surface.source,units:{length:"cm"}} as never);session.undo();session.redo();
    const restored=new AdditionalProjectSession(session.entry(),session.document(),()=>({documents,resources:parsed.resources}));expect(restored.document()).toEqual(session.document());
  });
  it("keeps a bounded 100-edit log and continues command IDs after pruning/reopen",()=>{
    for(const document of fixture.docs.filter((d)=>["Saved polyline","Saved explicit Surface","Saved scene constructions"].includes(title(d)))) {
      const entry=fixture.project.workspace.entries.find((e)=>e.expected.id===document.identity.id)!;
      const session=new AdditionalProjectSession(entry,document,()=>context);
      for(let i=0;i<105;i++){const source=JSON.parse(JSON.stringify(document.source));if(document.format==="math3d.curve-document")source.definition.points[0][0]=i+4;else if(document.format==="math3d.surface-document")source.definition.expressions.formula=`x+y+${i}`;else source.geometry.points[1].x=i+5;session.commit(source);}
      const reopened=new AdditionalProjectSession(session.entry(),session.document(),()=>context);expect(reopened.document()).toEqual(session.document());expect(reopened.history().undoDepth).toBe(100);reopened.undo();reopened.commit(modified(document));expect(verifyMixedWorkspaceReplay(createMixedWorkspaceDocument({...fixture.project.workspace,entries:[reopened.entry()],activeDocumentIds:[document.identity.id]})).get(document.identity.id)).toEqual(reopened.document());
    }
  });
  it("folds older Curve logs without changing current source or undo-generation contributions",()=>{
    const checkpoint=fixture.docs.find((d)=>title(d)==="Saved polyline")!;if(checkpoint.format!=="math3d.curve-document")throw Error();
    let state=checkpoint;const transactions=[];
    for(let i=1;i<=120;i++){
      const source={...checkpoint.source,definition:{...checkpoint.source.definition,points:[[i,0,0],[8,0,2]],pointCount:2}};
      const command=(suffix:string,payload:any)=>createCommandEnvelope({commandId:`curve/edit/${i}/${suffix}`,origin:{kind:"interactive",sourceId:"legacy"},command:{type:"curve.source.replace",payload}});
      const forward=command("forward",source),inverse=command("inverse",state.source),projected=projectCommandTransaction(state,[forward],curveCommandDefinitions,"replay");if(!projected.ok)throw Error();state=projected.state;transactions.push({forward,inverse});
    }
    const current=CurveDocumentAdapter.fromReplayBundle({checkpoint,transactions,cursor:10});
    expect(current.document().source.definition.points?.[0][0]).toBe(10);
    expect(current.document().identity.revision).toBe(checkpoint.identity.revision+230);
    expect(current.history().undoDepth).toBe(0);expect(current.history().redoDepth).toBe(100);
    const reopened=CurveDocumentAdapter.fromReplayBundle(current.replayBundle());expect(reopened.document()).toEqual(current.document());
    reopened.redo();expect(reopened.document().source.definition.points?.[0][0]).toBe(11);
  });
  it("keeps direct module redo intact when its kernel rejects a malformed source",()=>{
    const document=fixture.docs.find((d)=>title(d)==="Saved polyline")!;if(document.format!=="math3d.curve-document")throw Error();
    const adapter=new CurveDocumentAdapter(document);adapter.commitSource(modified(document) as never);adapter.undo();const before=adapter.replayBundle();
    expect(()=>adapter.commitSource({...document.source,dimension:9} as never)).toThrow();expect(adapter.replayBundle()).toEqual(before);adapter.redo();expect(adapter.document().source).toEqual(modified(document));
  });
});
