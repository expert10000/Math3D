export const GRAPH_GALLERY_PREFERENCES_KEY = "math3d.graph2d.gallery-preferences.v1";
export type GraphGalleryPreferences = Readonly<{ format:"math3d.graph2d-gallery-preferences";version:1;favorites:readonly string[];recent:readonly string[] }>;
export const emptyGraphGalleryPreferences = (): GraphGalleryPreferences => ({format:"math3d.graph2d-gallery-preferences",version:1,favorites:[],recent:[]});
const id=(v:unknown):v is string=>typeof v==="string"&&/^[a-z][a-z0-9-]{0,79}$/.test(v);
export const parseGraphGalleryPreferences = (raw:string|null):GraphGalleryPreferences=>{
  if(raw===null)return emptyGraphGalleryPreferences();
  if(raw.length>32*1024)throw new Error("Gallery preferences exceed their size limit.");
  const v=JSON.parse(raw);
  if(!v||Object.keys(v).sort().join("|")!=="favorites|format|recent|version"||v.format!=="math3d.graph2d-gallery-preferences"||v.version!==1||
    !Array.isArray(v.favorites)||v.favorites.length>128||!v.favorites.every(id)||new Set(v.favorites).size!==v.favorites.length||
    !Array.isArray(v.recent)||v.recent.length>32||!v.recent.every(id)||new Set(v.recent).size!==v.recent.length)
    throw new Error("Gallery preferences are unsupported or corrupt. Reset local favorites/recent to continue.");
  return v;
};
export const toggleGraphGalleryFavorite = (preferences:GraphGalleryPreferences,presetId:string):GraphGalleryPreferences=>{
  if(!id(presetId))throw new Error("Invalid favorite ID.");
  const favorites=preferences.favorites.includes(presetId)?preferences.favorites.filter(v=>v!==presetId):[...preferences.favorites,presetId];
  return parseGraphGalleryPreferences(JSON.stringify({...preferences,favorites}));
};
export const recordGraphGalleryRecent = (preferences:GraphGalleryPreferences,presetId:string):GraphGalleryPreferences=>{
  if(!id(presetId))throw new Error("Invalid recent ID.");
  return parseGraphGalleryPreferences(JSON.stringify({...preferences,recent:[presetId,...preferences.recent.filter(v=>v!==presetId)].slice(0,32)}));
};
