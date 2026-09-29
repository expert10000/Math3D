import { canonicalJsonStringify, createMixedWorkspaceDocument, createGraph2DWorkspaceProject, createWorkspaceProjectHandoff, graph2DCompanionCheckpoint,
  instantiateGraph2DPreset, mergeGraph2DHandoffCheckpoint, parseMixedWorkspaceDocument, parseWorkspaceProjectHandoff,
  serializeMixedWorkspaceDocument, serializeWorkspaceProjectHandoff, serializeGraph2DDocument,
  inspectGraph2DPersonalPreset, forkGraph2DPersonalPreset, type Graph2DPersonalPresetPreview,
  type Graph2DPreset, type MixedWorkspaceDocument } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { forkGraph2DWorkspaceProject, Graph2DPointTableStore } from "@math3d/core";
import { GRAPH_GALLERY_PREFERENCES_KEY,parseGraphGalleryPreferences,recordGraphGalleryRecent } from "./graph2dGalleryPreferences";

export const GRAPH_GALLERY_CHECKPOINT_INDEX = "math3d.mixed-workspace.v1.gallery-checkpoints";
const WORKSPACE_KEY = "math3d.mixed-workspace.v1", HANDOFF_KEY = "math3d.graph2d-handoff.v2";
const prefix = "math3d.mixed-workspace.v1.gallery-checkpoint.";
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
export type GraphGalleryCheckpoint = Readonly<{ id: string; title: string }>;
type Origin = Readonly<{ presetId: string; version: number; digest: string }>;
const originKey = "math3d.graph2d.gallery-origin";
const readOrigin = (value: unknown): Origin | null => {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join("|") !== "digest|presetId|version" ||
    typeof v.presetId !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(v.presetId) ||
    !Number.isSafeInteger(v.version) || Number(v.version) < 1 || typeof v.digest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(v.digest)) return null;
  return v as Origin;
};
const storedOrigin = (storage: Storage): (Origin & { documentId: string }) | null => {
  try {
    const value = JSON.parse(storage.getItem(originKey) ?? "null");
    if (!value || Object.keys(value).sort().join("|") !== "digest|documentId|presetId|version" ||
      typeof value.documentId !== "string" || !value.documentId.startsWith("math3d:graph2d:") || value.documentId.length >= 200) return null;
    const { documentId, ...raw } = value, origin = readOrigin(raw); return origin ? { ...origin, documentId } : null;
  } catch { return null; }
};
export type GraphGalleryPresetCopy = GraphGalleryCheckpoint & { presetId: string; version: number; active: boolean };
/** Host-local discovery only; no source inference or portable provenance extension. */
export const listGraphGalleryPresetCopies = (storage: Storage, activeId: string, activeTitle: string): GraphGalleryPresetCopy[] => {
  const copies: GraphGalleryPresetCopy[] = [], active = storedOrigin(storage);
  if (active?.documentId === activeId) copies.push({ id: activeId, title: activeTitle, presetId: active.presetId, version: active.version, active: true });
  else if (active) {
    // After an app restart the in-memory graph begins empty; the last durable
    // gallery workspace is still an edited copy, not a request for fresh defaults.
    try {
      const raw = storage.getItem(WORKSPACE_KEY), saved = raw ? graph(parseMixedWorkspaceDocument(raw)) : null;
      if (saved?.identity.id === active.documentId) copies.push({ id: active.documentId, title: saved.metadata.title,
        presetId: active.presetId, version: active.version, active: false });
    } catch { /* Explicit reopen validation reports corrupt saved bytes. */ }
  }
  for (const checkpoint of listGraphGalleryCheckpoints(storage)) {
    if (checkpoint.id === activeId || copies.some(copy => copy.id === checkpoint.id)) continue;
    try {
      const value = JSON.parse(storage.getItem(prefix + checkpoint.id) ?? "null"), origin = readOrigin(value?.origin);
      if (value?.format === "math3d.graph2d-gallery-checkpoint" && value.version === 2 && origin)
        copies.push({ ...checkpoint, presetId: origin.presetId, version: origin.version, active: false });
    } catch { /* A corrupt copy remains an explicit Resume error, never a fresh overwrite. */ }
  }
  return copies;
};
export const freshGraphGalleryLaunchToken = () => crypto.randomUUID?.() ??
  Array.from(crypto.getRandomValues(new Uint32Array(4)),value=>value.toString(16).padStart(8,"0")).join("-");
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
  return { workspace:mergeGraph2DHandoffCheckpoint(matching?.project ?? null,graph2DCompanionCheckpoint(checkpoint)),baseRevision:matching?.baseRevision ?? null };
};
const activate = (capture: () => MixedWorkspaceDocument, incoming: MixedWorkspaceDocument, baseRevision: string|null,
  storage: Storage, sidecars: Graph2DPreset["sidecars"] = [], origin?: {presetId:string;version:number;digest:string}) => {
  const current=currentCheckpoint(capture,storage), before=graph(current.workspace), next=graph(incoming);
  verifyMixedWorkspaceReplay(incoming);
  const index=listGraphGalleryCheckpoints(storage).filter(entry=>entry.id!==before.identity.id && entry.id!==next.identity.id);
  if(index.length>=32)throw new Error("32 Graph checkpoints are preserved. Export saved work before adding another; current work remains open.");
  const oldOrigin=storedOrigin(storage);
  const preservedOrigin=oldOrigin?.documentId===before.identity.id ? {presetId:oldOrigin.presetId,version:oldOrigin.version,digest:oldOrigin.digest} : null;
  const checkpoint={format:"math3d.graph2d-gallery-checkpoint",version:2,workspace:current.workspace,baseRevision:current.baseRevision,origin:preservedOrigin};
  const manifest=createWorkspaceProjectHandoff(incoming,{
    producer:{platform:typeof window!=="undefined" && "appRuntime" in window ? "desktop":"browser",name:"Math3D",version:"1.5.0"},baseRevision});
  const writes: [string,string][]=[
    [prefix+before.identity.id,JSON.stringify(checkpoint)],
    [GRAPH_GALLERY_CHECKPOINT_INDEX,JSON.stringify([{id:before.identity.id,title:before.metadata.title},...index])],
    ...sidecars.map(s=>[`math3d.graph2d.table.${s.id}`,canonicalJsonStringify(s.rows)] as [string,string]),
    [WORKSPACE_KEY,serializeMixedWorkspaceDocument(incoming)], [HANDOFF_KEY,serializeWorkspaceProjectHandoff(manifest)],
    [originKey,JSON.stringify(origin ? {documentId:next.identity.id,...origin} : null)],
  ];
  if(origin) {
    const preferences=recordGraphGalleryRecent(parseGraphGalleryPreferences(storage.getItem(GRAPH_GALLERY_PREFERENCES_KEY)),origin.presetId);
    writes.push([GRAPH_GALLERY_PREFERENCES_KEY,JSON.stringify(preferences)]);
  }
  writeTransaction(storage,writes);
  return incoming;
};
export const launchGraphGalleryPreset = (capture: () => MixedWorkspaceDocument, preset: Graph2DPreset, token: string, storage: Storage) => {
  const launch=instantiateGraph2DPreset(preset,token);
  const workspace=createGraph2DWorkspaceProject(launch.document);
  return activate(capture,workspace,null,storage,launch.sidecars,launch.origin);
};
export const resumeGraphGalleryCheckpoint = (capture: () => MixedWorkspaceDocument, id: string, storage: Storage) => {
  if(!listGraphGalleryCheckpoints(storage).some(entry=>entry.id===id)) {
    const origin=storedOrigin(storage),raw=storage.getItem(WORKSPACE_KEY);
    if(!raw)throw new Error("Graph checkpoint is unavailable.");
    const workspace=parseMixedWorkspaceDocument(raw);
    if(graph(workspace).identity.id!==id)throw new Error("Graph checkpoint is unavailable for this identity.");
    const handoff=storage.getItem(HANDOFF_KEY),manifest=handoff?parseWorkspaceProjectHandoff(handoff):null;
    return activate(capture,workspace,manifest?.projectId===id?manifest.baseRevision:null,storage,[],
      origin?.documentId === id ? {presetId:origin.presetId,version:origin.version,digest:origin.digest} : undefined);
  }
  const raw=storage.getItem(prefix+id);if(!raw)throw new Error("Graph checkpoint is unavailable.");
  const value=JSON.parse(raw);
  if(!value || Object.keys(value).sort().join("|")!==(value.version===2?"baseRevision|format|origin|version|workspace":"baseRevision|format|version|workspace") ||
    value.format!=="math3d.graph2d-gallery-checkpoint"||![1,2].includes(value.version) ||
    value.version===2 && value.origin!==null && !readOrigin(value.origin))throw new Error("Invalid Graph checkpoint.");
  const workspace=parseMixedWorkspaceDocument(JSON.stringify(value.workspace));
  if(graph(workspace).identity.id!==id)throw new Error("Graph checkpoint identity mismatch.");
  return activate(capture,workspace,value.baseRevision,storage,[],value.version===2 ? readOrigin(value.origin) ?? undefined : undefined);
};

/** My Graphs indexes existing checkpoints, without another project payload store. */
export const listPersonalGraphProjects = (storage: Storage, activeId: string, activeTitle: string) => {
  const items = [{ id: activeId, title: activeTitle, active: true }, ...listGraphGalleryCheckpoints(storage).filter(p => p.id !== activeId).map(p => ({ ...p, active: false }))];
  const saved = storage.getItem(WORKSPACE_KEY);
  if (saved) { const d = graph(parseMixedWorkspaceDocument(saved));
    if (!items.some(p => p.id === d.identity.id)) items.push({ id: d.identity.id, title: d.metadata.title, active: false }); }
  return items;
};
const readPersonalGraphWorkspace = (capture: () => MixedWorkspaceDocument, id: string, storage: Storage) => {
  const live = currentCheckpoint(capture, storage).workspace;
  let source = live;
  if (graph(live).identity.id !== id) {
    const raw = storage.getItem(prefix + id);
    if (raw) { const checkpoint = JSON.parse(raw);
      if (checkpoint.format !== "math3d.graph2d-gallery-checkpoint" || ![1, 2].includes(checkpoint.version)) throw new Error("Invalid saved Graph project.");
      source = parseMixedWorkspaceDocument(JSON.stringify(checkpoint.workspace));
    } else { const saved = storage.getItem(WORKSPACE_KEY); if (!saved) throw new Error("Saved Graph project unavailable."); source = parseMixedWorkspaceDocument(saved); }
    if (graph(source).identity.id !== id) throw new Error("Saved Graph identity mismatch.");
  }
  return source;
};
const tableStore = (storage: Storage) => new Graph2DPointTableStore({ read: tableId => storage.getItem(`math3d.graph2d.table.${tableId}`),
  write: () => { throw new Error("Read-only table validation."); } });
export const copyPersonalGraphProject = (capture: () => MixedWorkspaceDocument, id: string, token: string, title: string, storage: Storage) => {
  const source = readPersonalGraphWorkspace(capture, id, storage);
  const tables = tableStore(storage);
  for (const o of graph(source).source.objects) if (o.kind === "point-series" && !tables.resolve(o.table)) throw new Error("Original data sidecar is missing or corrupt. Import it before making a reusable copy.");
  return activate(capture, forkGraph2DWorkspaceProject(source, token, title), null, storage);
};

/** The existing handoff is the portable file; point-table rows remain explicit external sidecars. */
export const exportPersonalGraphProject = (capture: () => MixedWorkspaceDocument, id: string, storage: Storage) => {
  const source = readPersonalGraphWorkspace(capture, id, storage), document = graph(source);
  const manifest = createWorkspaceProjectHandoff(source, { producer: { platform: typeof window !== "undefined" && "appRuntime" in window ? "desktop" : "browser",
    name: "Math3D", version: "1.5.0" }, baseRevision: null });
  const bytes = serializeWorkspaceProjectHandoff(manifest);
  const preview = inspectGraph2DPersonalPreset(bytes, reference => !!tableStore(storage).resolve(reference));
  return { bytes, title: document.metadata.title, externalTableCount: preview.externalTableCount,
    missingTableCount: preview.missingTables.length, resultCount: preview.resultCount };
};
export const personalGraphDefinition = (capture: () => MixedWorkspaceDocument, id: string, storage: Storage) =>
  serializeGraph2DDocument(graph(readPersonalGraphWorkspace(capture, id, storage)));
export const previewPersonalGraphImport = (raw: string, storage: Storage): Graph2DPersonalPresetPreview => {
  const tables = tableStore(storage);
  return inspectGraph2DPersonalPreset(raw, reference => !!tables.resolve(reference));
};
export const importPersonalGraphProject = (capture: () => MixedWorkspaceDocument, preview: Graph2DPersonalPresetPreview,
  token: string, storage: Storage) => {
  const tables = tableStore(storage);
  for (const object of preview.document.source.objects) if (object.kind === "point-series" && !tables.resolve(object.table))
    throw new Error("Required point-table sidecar is missing or corrupt. Import it before accepting this preset.");
  const incoming = forkGraph2DPersonalPreset(preview, token);
  if (listPersonalGraphProjects(storage, graph(currentCheckpoint(capture, storage).workspace).identity.id, "").some(item => item.id === graph(incoming).identity.id))
    throw new Error("Imported Graph identity already exists. Try again.");
  return activate(capture, incoming, null, storage);
};
