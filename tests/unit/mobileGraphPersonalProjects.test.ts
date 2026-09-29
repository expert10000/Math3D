import { expect, it } from "vitest";
import { createGraph2DWorkspaceProject,createWorkspaceProjectHandoff,instantiateGraph2DPreset,getGraph2DPresetCatalog,
  inspectGraph2DPersonalPreset,serializeGraph2DDocument,serializeWorkspaceProjectHandoff } from "@math3d/core";
import { planMobilePersonalGraph, planMobilePersonalGraphImport, previewMobilePersonalGraphImport } from "../../apps/mobile/src/models/mobileGraphPersonalProjects";
import { storeMobileGraph,readMobileGraph,readMobileGraphWorkspace } from "../../apps/mobile/src/models/mobileGraphProject";
import { serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";
it("preserves active unsaved edits while opening another saved Graph through one library plan",()=>{
  const a=instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!,"a").document,b=instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison")!,"b").document;
  const current={...a,metadata:{title:"Unsaved title"}},projects=[storeMobileGraph(a),storeMobileGraph(b)];
  const open=planMobilePersonalGraph(projects,{graph:current},b.identity.id,null,()=>true);
  expect(readMobileGraph(open.projects.find(p=>p.id===a.identity.id)!)).toEqual(current);expect(readMobileGraph(open.project)).toEqual(b);
  const copy=planMobilePersonalGraph(projects,{graph:current},a.identity.id,{token:"new",title:"Reusable"},()=>true);
  expect(copy.project.id).not.toBe(a.identity.id);expect(readMobileGraph(copy.project).source).toEqual(a.source);
  expect(readMobileGraphWorkspace(copy.project)!.relations[0]!.operation).toBe("graph2d.personal-copy");
  expect(readMobileGraph(projects[0]!)).toEqual(a);
});
it("refuses a reusable data project whose original sidecar is unavailable",()=>{
  const d=instantiateGraph2DPreset(getGraph2DPresetCatalog().get("piecewise-data-gaps")!,"data").document,p=storeMobileGraph(d);
  expect(()=>planMobilePersonalGraph([p],{},p.id,{token:"new",title:"Data copy"},()=>false)).toThrow(/sidecar/);
});
it("previews portable Graphs without mutation and plans an independent native import",()=>{
  const original=instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison")!,"portable-native").document;
  const current=instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!,"current-native").document;
  const projects=[storeMobileGraph(current)],preview=previewMobilePersonalGraphImport(serializeGraph2DDocument(original),()=>true);
  expect(preview.document.identity.id).toBe(original.identity.id);expect(projects).toHaveLength(1);
  const plan=planMobilePersonalGraphImport(projects,{graph:{...current,metadata:{title:"Unsaved edit"}}},preview,"new-native",()=>true);
  expect(plan.project.id).not.toBe(original.identity.id);
  expect(readMobileGraph(plan.project).source).toEqual(original.source);
  expect(readMobileGraph(plan.projects.find(p=>p.id===current.identity.id)!).metadata.title).toBe("Unsaved edit");
  expect(readMobileGraph(projects[0]!)).toEqual(current);
});
it("rejects a personal preset import with unavailable external data",()=>{
  const original=instantiateGraph2DPreset(getGraph2DPresetCatalog().get("piecewise-data-gaps")!,"portable-data-native").document;
  const preview=previewMobilePersonalGraphImport(serializeGraph2DDocument(original),()=>false);
  expect(preview.missingTables).toHaveLength(1);
  expect(()=>planMobilePersonalGraphImport([],{},preview,"new-native",()=>false)).toThrow(/sidecar/);
});
it("uses the same checked handoff in native-to-desktop and desktop-to-native model paths",()=>{
  const graph=instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison")!,"cross-host").document;
  const nativeBytes=serializeMobileProjectHandoff(storeMobileGraph(graph));
  expect(inspectGraph2DPersonalPreset(nativeBytes,()=>true).document.source).toEqual(graph.source);
  const desktopBytes=serializeWorkspaceProjectHandoff(createWorkspaceProjectHandoff(createGraph2DWorkspaceProject(graph),
    {producer:{platform:"desktop",name:"Math3D",version:"1.5.0"}}));
  const preview=previewMobilePersonalGraphImport(desktopBytes,()=>true);
  const imported=planMobilePersonalGraphImport([],{},preview,"native-copy",()=>true).project;
  expect(imported.id).not.toBe(graph.identity.id);
  expect(readMobileGraph(imported).source).toEqual(graph.source);
});
