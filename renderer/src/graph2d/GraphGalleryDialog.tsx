import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getGraph2DPresetCatalog, getGraph2DInteractivePreset, GRAPH2D_PRESET_CATEGORIES, graph2DPresetPreviewKey,
  type Graph2DPreset, type Graph2DPresetCategory } from "@math3d/core";
import { Graph2DPointTableStore, renderGraph2DDocumentPreview, type Graph2DPersonalPresetPreview } from "@math3d/core";
import { parseGraph2DProjectFavorites, emptyGraph2DProjectFavorites, toggleGraph2DProjectFavorite } from "@math3d/core";
import manifest from "../../../packages/core/fixtures/graph2d/gallery-previews.json";
import { listGraphGalleryCheckpoints, listGraphGalleryPresetCopies, listPersonalGraphProjects } from "./graph2dGallerySession";
import { GRAPH_GALLERY_PREFERENCES_KEY,emptyGraphGalleryPreferences,parseGraphGalleryPreferences,toggleGraphGalleryFavorite } from "./graph2dGalleryPreferences";
import "./graphGallery.css";

const assets=import.meta.glob("../../../packages/core/assets/graph2d-gallery/*.svg",{query:"?url",import:"default",eager:true}) as Record<string,string>;
const previewURL = (preset: Graph2DPreset) => {
  const entry=manifest.entries.find(item=>item.id===preset.id);
  if(!entry||entry.key!==graph2DPresetPreviewKey(preset)||entry.presetDigest!==preset.digest)return undefined;
  return assets[`../../../packages/core/assets/graph2d-gallery/${entry.svg}`];
};
type Props={onClose:()=>void;onOpen:(preset:Graph2DPreset)=>void;onResume:(id:string)=>void;onCopy:(id:string,title:string)=>void;
  onExportProject?:(id:string)=>{bytes:string;title:string;externalTableCount:number;missingTableCount:number;resultCount:number};
  onCopyDefinition?:(id:string)=>string;onPreviewImport?:(raw:string)=>Graph2DPersonalPresetPreview;
  onImportProject?:(preview:Graph2DPersonalPresetPreview)=>void;error:string|null;activeId:string;activeTitle:string};
export function GraphGalleryDialog({onClose,onOpen,onResume,onCopy,onExportProject,onCopyDefinition,onPreviewImport,onImportProject,error,activeId,activeTitle}:Props) {
  const ref=useRef<HTMLDialogElement>(null),titleId=useId(),catalog=useMemo(getGraph2DPresetCatalog,[]);
  const searchRef=useRef<HTMLInputElement>(null);
  const [query,setQuery]=useState(""),[category,setCategory]=useState<Graph2DPresetCategory|"All">("All"),[collection,setCollection]=useState("Featured");
  const [preferences,setPreferences]=useState(()=>{try{return {value:parseGraphGalleryPreferences(localStorage.getItem(GRAPH_GALLERY_PREFERENCES_KEY)),error:null as string|null};}
    catch(error){return {value:emptyGraphGalleryPreferences(),error:(error as Error).message};}});
  const featured=collection==="Featured";
  const favorite=(id:string)=>{try{const value=toggleGraphGalleryFavorite(preferences.value,id);localStorage.setItem(GRAPH_GALLERY_PREFERENCES_KEY,JSON.stringify(value));setPreferences({value,error:null});}
    catch(error){setPreferences(prev=>({...prev,error:(error as Error).message}));}};
  const [selected,setSelected]=useState<Graph2DPreset|null>(null);
  const [importPreview,setImportPreview]=useState<Graph2DPersonalPresetPreview|null>(null),[importImage,setImportImage]=useState("");
  const [transferMessage,setTransferMessage]=useState("");
  const exportProject=(id:string)=>{try{
    if(!onExportProject)throw new Error("Project export is unavailable.");
    const result=onExportProject(id),url=URL.createObjectURL(new Blob([result.bytes],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download=`${result.title.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,64)||"Graph"}.math3d.handoff.json`;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    setTransferMessage(`Exported ${result.title}. ${result.externalTableCount} point-table sidecar(s) and ${result.resultCount} result descriptor(s) are external to the file.${result.missingTableCount?` ${result.missingTableCount} local sidecar(s) are already missing.`:""}`);
  }catch(e){setTransferMessage(`Export failed: ${(e as Error).message}`);}};
  const copyDefinition=async(id:string)=>{try{if(!onCopyDefinition)throw new Error("Graph definition is unavailable.");
    await navigator.clipboard.writeText(onCopyDefinition(id));setTransferMessage("Copied the Graph document definition. Companions, result descriptors and point-table rows are not included.");
  }catch(e){setTransferMessage(`Copy failed: ${(e as Error).message}`);}};
  const previewFile=async(file:File)=>{setImportPreview(null);setImportImage("");setTransferMessage("");try{
    if(file.size>32*1024*1024)throw new Error("Graph preset file exceeds the 32 MB import limit.");
    if(!onPreviewImport)throw new Error("Personal preset import is unavailable.");
    const prepared=onPreviewImport(await file.text());
    const tables=new Graph2DPointTableStore({read:id=>localStorage.getItem(`math3d.graph2d.table.${id}`),write:()=>{throw new Error("Read-only preview.");}});
    const pointTables=Object.fromEntries(prepared.document.source.objects.flatMap(object=>object.kind==="point-series"?[[object.table.id,tables.resolve(object.table)]]:[]));
    try{const image=renderGraph2DDocumentPreview(prepared.document,prepared.document.metadata.title,pointTables);
      setImportImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(image.svg)}`);
      if(image.diagnostics.some(item=>item.code==="deadline"))setTransferMessage("Preview is incomplete under the bounded sampling budget.");
    }catch(e){setTransferMessage(`Plot preview unavailable: ${(e as Error).message}. The source summary remains readable.`);}
    setImportPreview(prepared);
  }catch(e){setTransferMessage(`Import preview failed: ${(e as Error).message}`);}};
  const [copyTitle,setCopyTitle]=useState(`${activeTitle.slice(0, 140)} copy`), [favoritesOnly,setFavoritesOnly]=useState(false);
  const favoriteKey="math3d.graph2d.project-favorites.v1";
  const [projectFavorites,setProjectFavorites]=useState(()=>{try{return {value:parseGraph2DProjectFavorites(localStorage.getItem(favoriteKey)),error:null as string|null};}catch(e){return {value:emptyGraph2DProjectFavorites(),error:(e as Error).message};}});
  const projects=useMemo(()=>{try{return {items:listPersonalGraphProjects(localStorage,activeId,activeTitle),error:null};}catch(e){return {items:[],error:(e as Error).message};}},[activeId,activeTitle]);
  const projectFavorite=(id:string)=>{if(projectFavorites.error)return;try{const value=toggleGraph2DProjectFavorite(projectFavorites.value,id);localStorage.setItem(favoriteKey,JSON.stringify(value));setProjectFavorites({value,error:null});}catch(e){setProjectFavorites(p=>({...p,error:(e as Error).message}));}};
  const checkpoints=useMemo(()=>{try{return listGraphGalleryCheckpoints(localStorage).filter(item=>item.id!==activeId);}catch{return [];}},[activeId]);
  const copies=useMemo(()=>{try{return listGraphGalleryPresetCopies(localStorage,activeId,activeTitle);}catch{return [];}},[activeId,activeTitle]);
  const existing=(preset:Graph2DPreset)=>copies.find(copy=>copy.presetId===preset.id&&copy.version===preset.version);
  const open=(preset:Graph2DPreset)=>{const copy=existing(preset);if(copy?.active)onClose();else if(copy)onResume(copy.id);else onOpen(preset);};
  useEffect(()=>{const dialog=ref.current!;dialog.showModal();searchRef.current?.focus();return()=>dialog.close();},[]);
  const items=catalog.filter(query,category).filter(item=>featured?item.featuredOrder!==null:collection==="Favorites"?preferences.value.favorites.includes(item.id):collection==="Recent"?preferences.value.recent.includes(item.id):true)
    .sort((a,b)=>featured?(a.featuredOrder??0)-(b.featuredOrder??0):collection==="Recent"?preferences.value.recent.indexOf(a.id)-preferences.value.recent.indexOf(b.id):0);
  const unavailable=(collection==="Favorites"?preferences.value.favorites:collection==="Recent"?preferences.value.recent:[]).filter(id=>!catalog.get(id));
  const image=(preset:Graph2DPreset)=>{const src=previewURL(preset);return src?<img src={src} alt={`${preset.title} graph preview`} width={320} height={180}/>:<div className="graph-gallery-image-fallback">Preview unavailable. The editable scene can still be opened.</div>;};
  const interactive=(preset:Graph2DPreset)=>{
    const variant=getGraph2DInteractivePreset(preset);if(!variant)return null;
    return <section className="graph-gallery-interactive" aria-label={`${preset.title} interactive controls`}>
      <strong>Interactive copy · sliders and opt-in animation</strong><p>{variant.description}</p>
      <small>Preview shows default values. Requires {variant.requiredCapabilities.join(" · ")}. Open, then choose Parameters; nothing plays automatically.</small>
      {existing(variant)&&<p>Open returns to {existing(variant)!.active?"your current":"the most recently preserved"} edited interactive copy.</p>}
      <button type="button" onClick={()=>open(variant)}>Open interactive {preset.title}</button>
      {existing(variant)&&<button type="button" onClick={()=>onOpen(variant)}>Open fresh interactive copy of {preset.title}</button>}
    </section>;
  };
  return <dialog ref={ref} aria-labelledby={titleId} className="graph-gallery-dialog" data-testid="graph-gallery" onCancel={event=>{event.preventDefault();onClose();}}>
    <header className="graph-gallery-header"><div><p className="graph-gallery-eyebrow">MATH3D · GRAPHS</p><h2 id={titleId}>Graph Gallery</h2>
      <p>Open returns to an existing edited copy when available. Choose a fresh copy to start over. Your current workspace is preserved.</p></div><button type="button" aria-label="Close Graph Gallery" onClick={onClose}>Close</button></header>
    {error&&<p role="alert" className="graph-gallery-error">{error} Current work remains open.</p>}
    {preferences.error&&<div className="graph-gallery-error" role="alert">{preferences.error} <button type="button" onClick={()=>{try{const value=emptyGraphGalleryPreferences();localStorage.setItem(GRAPH_GALLERY_PREFERENCES_KEY,JSON.stringify(value));setPreferences({value,error:null});}catch(error){setPreferences(p=>({...p,error:(error as Error).message}));}}}>Reset local favorites/recent</button></div>}
    <div className="graph-gallery-controls"><label>Search graphs<input ref={searchRef} type="search" value={query} onChange={e=>{setQuery(e.target.value);if(featured)setCollection("All scenes");}} placeholder="Try roses, tangent or gaps"/></label>
      <div className="graph-gallery-tabs" aria-label="Gallery collection">{["Featured","All scenes","Favorites","Recent","My Graphs"].map(tab=><button key={tab} type="button" aria-pressed={collection===tab}
        onClick={()=>{setCollection(tab);setCategory("All");setQuery("");setSelected(null);}}>{tab}</button>)}</div></div>
    <div className="graph-gallery-categories" aria-label="Graph categories">{["All",...GRAPH2D_PRESET_CATEGORIES].map(c=><button type="button" key={c} aria-pressed={category===c}
      onClick={()=>{setCategory(c as Graph2DPresetCategory|"All");if(featured)setCollection("All scenes");setSelected(null);}}>{c}</button>)}</div>
    {collection==="My Graphs"?<section aria-label="My Graphs" data-testid="graph-gallery-my-graphs">
      <p>Open your saved graphs or make an independent copy. Copied analysis observations remain labeled and are not recalculated.</p>
      <label>Preview a personal Graph file before import <input type="file" accept="application/json,.json" data-testid="graph-personal-import-file"
        onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file)void previewFile(file);}} /></label>
      {transferMessage&&<p role="status" data-testid="graph-personal-transfer-message">{transferMessage}</p>}
      {importPreview&&<section aria-label="Personal Graph import preview" data-testid="graph-personal-import-preview">
        <h3>{importPreview.document.metadata.title}</h3>
        {importImage&&<img src={importImage} alt={`${importPreview.document.metadata.title} graph import preview`} width={320} height={180}/>}
        <p>{importPreview.format} · {importPreview.document.source.objects.length} Graph object(s) · {importPreview.companionCount} companion(s) · {importPreview.resultCount} saved result descriptor(s).</p>
        <p>{importPreview.document.source.objects.map(object=>`${object.label} (${object.kind})`).join(" · ")||"Empty Graph"}</p>
        <p>{importPreview.externalTableCount} external point-table sidecar(s) · {importPreview.externalArtifactCount} external artifact descriptor(s). The file does not embed their bytes. Saved results are copied observations, not recalculated.</p>
        {importPreview.missingTables.length>0&&<p role="alert">{importPreview.missingTables.length} required point-table sidecar(s) missing or corrupt. Import them before accepting this Graph.</p>}
        <button type="button" disabled={importPreview.missingTables.length>0||!onImportProject} onClick={()=>onImportProject?.(importPreview)}>Import as independent Graph</button>
        <button type="button" onClick={()=>{setImportPreview(null);setImportImage("");setTransferMessage("Import cancelled. Current work remains open.");}}>Cancel import</button>
      </section>}
      <label>Reusable copy title<input maxLength={160} value={copyTitle} onChange={e=>setCopyTitle(e.target.value)} /></label>
      <button type="button" onClick={()=>onCopy(activeId,copyTitle)}>Save current as reusable copy</button>
      <button type="button" aria-pressed={favoritesOnly} onClick={()=>setFavoritesOnly(!favoritesOnly)}>Project favorites only</button>
      {(projects.error||projectFavorites.error)&&<p role="alert">{projects.error||projectFavorites.error}</p>}
      {projectFavorites.error&&<button onClick={()=>{try{localStorage.removeItem(favoriteKey);setProjectFavorites({value:emptyGraph2DProjectFavorites(),error:null});}catch(e){setProjectFavorites(p=>({...p,error:(e as Error).message}));}}}>Reset project favorites</button>}
      {projects.items.filter(p=>p.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())&&(!favoritesOnly||projectFavorites.value.ids.includes(p.id))).map(p=><article key={p.id} className="graph-gallery-card-body">
        <h3>{p.title}</h3><p>{p.active?"Current workspace":"Saved workspace"}</p>
        <button onClick={()=>p.active?onClose():onResume(p.id)}>Open project {p.title}</button>
        <button onClick={()=>onCopy(p.id,`${p.title.slice(0,140)} copy`)}>Copy project {p.title}</button>
        <button onClick={()=>exportProject(p.id)}>Export preset {p.title}</button>
        <button onClick={()=>void copyDefinition(p.id)}>Copy graph definition {p.title}</button>
        <button aria-pressed={projectFavorites.value.ids.includes(p.id)} onClick={()=>projectFavorite(p.id)}>Favorite project {p.title}</button>
      </article>)}
      {!projects.items.some(p=>p.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())&&(!favoritesOnly||projectFavorites.value.ids.includes(p.id)))&&<p>No matching saved Graph projects.</p>}
    </section>:selected?<section className="graph-gallery-detail" aria-label={`${selected.title} details`}>
      <button type="button" onClick={()=>setSelected(null)}>Back to gallery</button>{image(selected)}<h3>{selected.title}</h3><p>{selected.description}</p>
      <ul>{selected.learningGoals.map(goal=><li key={goal}>{goal}</li>)}</ul>
      <p>{selected.template.source.objects.map(o=>o.label).join(" · ")}</p><small>Approximate sampled preview · {selected.attribution.author} · {selected.attribution.license}</small>
      {existing(selected)&&<p>Open returns to {existing(selected)!.active?"your current":"the most recently preserved"} edited copy: {existing(selected)!.title}.</p>}
      <button type="button" className="graph-gallery-open" onClick={()=>open(selected)}>Open {selected.title}</button>
      {existing(selected)&&<button type="button" onClick={()=>onOpen(selected)}>Open fresh copy of {selected.title}</button>}
      {interactive(selected)}
      <button type="button" aria-label={`Favorite ${selected.title}`} aria-pressed={preferences.value.favorites.includes(selected.id)} onClick={()=>favorite(selected.id)}>{preferences.value.favorites.includes(selected.id)?"Remove favorite":"Favorite"}</button>
    </section>:<><p role="status" className="graph-gallery-count">{items.length} {items.length===1?"scene":"scenes"}{featured?" · hand-picked starting points":" · editable, offline"}</p>
      <div className="graph-gallery-grid">{items.map(preset=><article key={preset.id} className="graph-gallery-card" data-testid={`graph-gallery-card-${preset.id}`}>
        {image(preset)}<div className="graph-gallery-card-body"><div className="graph-gallery-card-meta">{preset.category} · {preset.difficulty}</div><h3>{preset.title}</h3><p>{preset.description}</p>
          <small>{[...new Set(preset.template.source.objects.map(o=>o.kind))].join(" · ")}{getGraph2DInteractivePreset(preset)?" · interactive copy in Preview":""}</small>
          {existing(preset)&&<small>{existing(preset)!.active?"Current edited copy":"Saved edited copy available"} · Open resumes it; Preview offers a fresh copy.</small>}
          <div className="graph-gallery-card-actions"><button type="button" className="graph-gallery-open" aria-label={`Open ${preset.title}`} onClick={()=>open(preset)}>Open</button>
            <button type="button" aria-label={`Preview ${preset.title}`} onClick={()=>setSelected(preset)}>Preview</button>
            <button type="button" className="graph-gallery-favorite" aria-label={`Favorite ${preset.title}`} aria-pressed={preferences.value.favorites.includes(preset.id)} onClick={()=>favorite(preset.id)}><span aria-hidden="true">{preferences.value.favorites.includes(preset.id)?"★":"☆"}</span></button></div></div>
      </article>)}</div>{!items.length&&<p>{collection==="Favorites"?"No matching favorites. Bookmark a scene with its star button.":collection==="Recent"?"No matching recent scenes. Open a graph from the gallery to start.":"No scenes match these filters. Try another search or category."}</p>}
      {unavailable.length>0&&<section aria-label="Unavailable gallery entries"><p>These examples are unavailable in this catalog version. Your saved projects remain available.</p>{unavailable.map(id=><div key={id}>{id}{collection==="Favorites"&&<button type="button" onClick={()=>favorite(id)}>Remove favorite {id}</button>}</div>)}</section>}</>}
    {checkpoints.length>0&&<details className="graph-gallery-preserved"><summary>Preserved projects ({checkpoints.length})</summary>
      <p>Resume a previous Graph workspace. The current one is preserved before switching.</p>
      {checkpoints.map(entry=><button type="button" key={entry.id} onClick={()=>onResume(entry.id)}>Resume {entry.title}</button>)}</details>}
  </dialog>;
}
