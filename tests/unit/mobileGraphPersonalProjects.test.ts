import { expect, it } from "vitest";
import { instantiateGraph2DPreset,getGraph2DPresetCatalog } from "@math3d/core";
import { planMobilePersonalGraph } from "../../apps/mobile/src/models/mobileGraphPersonalProjects";
import { storeMobileGraph,readMobileGraph,readMobileGraphWorkspace } from "../../apps/mobile/src/models/mobileGraphProject";
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
