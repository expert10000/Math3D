import { canonicalJsonStringify, createMixedWorkspaceDocument, createGraph2DWorkspaceProject, createWorkspaceProjectHandoff, graph2DCompanionCheckpoint,
  instantiateGraph2DPreset, mergeGraph2DHandoffCheckpoint, parseMixedWorkspaceDocument, parseWorkspaceProjectHandoff,
  serializeMixedWorkspaceDocument, serializeWorkspaceProjectHandoff, type Graph2DPreset, type MixedWorkspaceDocument } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

export const GRAPH_GALLERY_CHECKPOINT_INDEX = "math3d.mixed-workspace.v1.gallery-checkpoints";
const WORKSPACE_KEY = "math3d.mixed-workspace.v1", HANDOFF_KEY = "math3d.graph2d-handoff.v2";
const prefix = "math3d.mixed-workspace.v1.gallery-checkpoint.";
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
export type GraphGalleryCheckpoint = Readonly<{ id: string; title: string }>;
const graph = (workspace: MixedWorkspaceDocument) => {
  const entries=workspace.entries.filter(e=>e.module==="graph2d");
  if(entries.length!==1 || entries[0]!.checkpoint.format!=="math3d.graph2d-document") throw new Error("Expected one Graph workspace.");
  return entries[0]!.checkpoint;
};
export const listGraphGalleryCheckpoints = (storage: Storage): GraphGalleryCheckpoint[] => {
  const raw=storage.getItem(GRAPH_GALLERY_CHECKPOINT_INDEX); if(!raw)return [];
  const value: unknown=JSON.parse(raw);
  if(!Array.isArray(value)||value.length>32||!value.every(v=>v && typeof v==="object" && Object.keys(v).sort().join("|")==="id|title" &&
    typeof v.id==="string" && v.id.startsWith("math3d:graph2d:") && v.id.length<200 && typeof v.title==="string" && v.title.length<=160)||
    new Set(value.map(v=>v.id)).size!==value.length) throw new Error("Saved Graph checkpoint index is invalid. Export current work before repairing local storage.");
  return value as GraphGalleryCheckpoint[];
};

/** All mutations roll back on failure before the host replaces its live adapter/history. */
const writeTransaction = (storage: Storage, writes: readonly [string,string][]) => {
  const prior=writes.map(([key])=>[key,storage.getItem(key)] as const), changed: string[]=[];
  try { for(const [key,value] of writes) { storage.setItem(key,value);changed.push(key); } }
  catch(error) {
    // Remove newly-written values first to free quota before restoring existing values.
    for(const key of changed) storage.removeItem(key);
    for(const [key,value] of prior) if(changed.includes(key)&&value!==null)storage.setItem(key,value);
    throw error;
  }
};
const currentCheckpoint = (capture: () => MixedWorkspaceDocument, storage: Storage) => {
  const live=capture(), resolved=verifyMixedWorkspaceReplay(live);
  const checkpoint=createMixedWorkspaceDocument({...live,entries:live.entries.map(entry=>{
    const document=resolved.get(entry.expected.id)!;return {...entry,checkpoint:document,expected:document.identity,replay:null};
  })});
  const stored=storage.getItem(HANDOFF_KEY), session=stored ? parseWorkspaceProjectHandoff(stored) : null;
  const matching=session?.projectId===graph(checkpoint).identity.id ? session : null;
  return { workspace:mergeGraph2DHandoffCheckpoint(matching?.project ?? null,checkpoint),baseRevision:matching?.baseRevision ?? null };
};
const activate = (capture: () => MixedWorkspaceDocument, incoming: MixedWorkspaceDocument, baseRevision: string|null,
  storage: Storage, sidecars: Graph2DPreset["sidecars"] = [], origin?: {presetId:string;version:number;digest:string}) => {
  const current=currentCheckpoint(capture,storage), before=graph(current.workspace), next=graph(incoming);
  verifyMixedWorkspaceReplay(incoming);
  const index=listGraphGalleryCheckpoints(storage).filter(entry=>entry.id!==before.identity.id);
  if(index.length>=32)throw new Error("32 Graph checkpoints are preserved. Export saved work before adding another; current work remains open.");
  const checkpoint={format:"math3d.graph2d-gallery-checkpoint",version:1,workspace:current.workspace,baseRevision:current.baseRevision};
  const manifest=createWorkspaceProjectHandoff(graph2DCompanionCheckpoint(incoming),{
    producer:{platform:typeof window!=="undefined" && "appRuntime" in window ? "desktop":"browser",name:"Math3D",version:"1.5.0"},baseRevision});
  const writes: [string,string][]=[
    [prefix+before.identity.id,JSON.stringify(checkpoint)],
    [GRAPH_GALLERY_CHECKPOINT_INDEX,JSON.stringify([{id:before.identity.id,title:before.metadata.title},...index])],
    ...sidecars.map(s=>[`math3d.graph2d.table.${s.id}`,canonicalJsonStringify(s.rows)] as [string,string]),
    [WORKSPACE_KEY,serializeMixedWorkspaceDocument(incoming)], [HANDOFF_KEY,serializeWorkspaceProjectHandoff(manifest)],
  ];
  if(origin)writes.push(["math3d.graph2d.gallery-origin",JSON.stringify({documentId:next.identity.id,...origin})]);
  writeTransaction(storage,writes);
  return incoming;
};
export const launchGraphGalleryPreset = (capture: () => MixedWorkspaceDocument, preset: Graph2DPreset, token: string, storage: Storage) => {
  const launch=instantiateGraph2DPreset(preset,token);
  const workspace=createGraph2DWorkspaceProject(launch.document);
  return activate(capture,workspace,null,storage,launch.sidecars,launch.origin);
};
export const resumeGraphGalleryCheckpoint = (capture: () => MixedWorkspaceDocument, id: string, storage: Storage) => {
  if(!listGraphGalleryCheckpoints(storage).some(entry=>entry.id===id))throw new Error("Graph checkpoint is unavailable.");
  const raw=storage.getItem(prefix+id);if(!raw)throw new Error("Graph checkpoint is unavailable.");
  const value=JSON.parse(raw);
  if(!value || Object.keys(value).sort().join("|")!=="baseRevision|format|version|workspace" ||
    value.format!=="math3d.graph2d-gallery-checkpoint"||value.version!==1)throw new Error("Invalid Graph checkpoint.");
  const workspace=parseMixedWorkspaceDocument(JSON.stringify(value.workspace));
  if(graph(workspace).identity.id!==id)throw new Error("Graph checkpoint identity mismatch.");
  return activate(capture,workspace,value.baseRevision,storage);
};
