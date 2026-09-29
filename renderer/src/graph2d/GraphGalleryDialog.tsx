import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getGraph2DPresetCatalog, getGraph2DInteractivePreset, GRAPH2D_PRESET_CATEGORIES, graph2DPresetPreviewKey,
  type Graph2DPreset, type Graph2DPresetCategory } from "@math3d/core";
import manifest from "../../../packages/core/fixtures/graph2d/gallery-previews.json";
import { listGraphGalleryCheckpoints, listGraphGalleryPresetCopies } from "./graph2dGallerySession";
import { GRAPH_GALLERY_PREFERENCES_KEY,emptyGraphGalleryPreferences,parseGraphGalleryPreferences,toggleGraphGalleryFavorite } from "./graph2dGalleryPreferences";
import "./graphGallery.css";

const assets=import.meta.glob("../../../packages/core/assets/graph2d-gallery/*.svg",{query:"?url",import:"default",eager:true}) as Record<string,string>;
const previewURL = (preset: Graph2DPreset) => {
  const entry=manifest.entries.find(item=>item.id===preset.id);
  if(!entry||entry.key!==graph2DPresetPreviewKey(preset)||entry.presetDigest!==preset.digest)return undefined;
  return assets[`../../../packages/core/assets/graph2d-gallery/${entry.svg}`];
};
type Props={onClose:()=>void;onOpen:(preset:Graph2DPreset)=>void;onResume:(id:string)=>void;error:string|null;activeId:string;activeTitle:string};
export function GraphGalleryDialog({onClose,onOpen,onResume,error,activeId,activeTitle}:Props) {
  const ref=useRef<HTMLDialogElement>(null),titleId=useId(),catalog=useMemo(getGraph2DPresetCatalog,[]);
  const searchRef=useRef<HTMLInputElement>(null);
  const [query,setQuery]=useState(""),[category,setCategory]=useState<Graph2DPresetCategory|"All">("All"),[collection,setCollection]=useState("Featured");
  const [preferences,setPreferences]=useState(()=>{try{return {value:parseGraphGalleryPreferences(localStorage.getItem(GRAPH_GALLERY_PREFERENCES_KEY)),error:null as string|null};}
    catch(error){return {value:emptyGraphGalleryPreferences(),error:(error as Error).message};}});
  const featured=collection==="Featured";
  const favorite=(id:string)=>{try{const value=toggleGraphGalleryFavorite(preferences.value,id);localStorage.setItem(GRAPH_GALLERY_PREFERENCES_KEY,JSON.stringify(value));setPreferences({value,error:null});}
    catch(error){setPreferences(prev=>({...prev,error:(error as Error).message}));}};
  const [selected,setSelected]=useState<Graph2DPreset|null>(null);
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
      <div className="graph-gallery-tabs" aria-label="Gallery collection">{["Featured","All scenes","Favorites","Recent"].map(tab=><button key={tab} type="button" aria-pressed={collection===tab}
        onClick={()=>{setCollection(tab);setCategory("All");setQuery("");setSelected(null);}}>{tab}</button>)}</div></div>
    <div className="graph-gallery-categories" aria-label="Graph categories">{["All",...GRAPH2D_PRESET_CATEGORIES].map(c=><button type="button" key={c} aria-pressed={category===c}
      onClick={()=>{setCategory(c as Graph2DPresetCategory|"All");if(featured)setCollection("All scenes");setSelected(null);}}>{c}</button>)}</div>
    {selected?<section className="graph-gallery-detail" aria-label={`${selected.title} details`}>
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
