import React, { useMemo, useRef, useState } from "react";
import { AccessibilityInfo, findNodeHandle, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { GRAPH2D_PRESET_CATEGORIES, getGraph2DInteractivePreset, getGraph2DGuidedConcepts, getGraph2DGuidedPreset,
  graph2DPresetPreviewKey, sampleGraph2DScene, type Graph2DGuidedConcept,
  type Graph2DPersonalPresetPreview, type Graph2DPreset, type Graph2DPresetCategory } from "@math3d/core";
import manifest from "../../../packages/core/fixtures/graph2d/gallery-previews.json";
import { mobileGraphGalleryAssets } from "./data/mobileGraphGalleryAssets";
import { mobileGraphGalleryItems, mobileGraphGalleryLayout } from "./models/mobileGraphGallery";
import type { Graph2DDocument } from "@math3d/core";
import type { MobileStoredSceneProject } from "./models/mobileScene";
import { mobileGraphPointTables } from "./services/mobileGraphPointTables";
import { projectMobileGraphLines, type MobileGraphLine } from "./viewer/mobileGraphProjection";

const PreviewLine = ({ line }: { line: MobileGraphLine }) => <View pointerEvents="none" style={{ position: "absolute",
  left: (line.a.x + line.b.x) / 2 - Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y) / 2,
  top: (line.a.y + line.b.y) / 2 - line.width / 2,
  width: Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y), height: line.width, backgroundColor: line.color,
  transform: [{ rotate: `${Math.atan2(line.b.y - line.a.y, line.b.x - line.a.x)}rad` }] }} />;

function GallerySafeArea({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View testID="mobile-graph-gallery" style={[s.root, {
    paddingTop: insets.top, paddingRight: insets.right, paddingBottom: insets.bottom, paddingLeft: insets.left,
  }]}>{children}</View>;
}

export function MobileGraphGallery({ onClose, onOpen, busy = false, message = "", personalProjects = [], currentGraph, projectFavorites = [], favoritesError = "", onFavorite, onResetFavorites, onPersonalOpen,
  importPreview, onPreviewImport, onAcceptImport, onCancelImport, onExportPersonal, onShareDefinition }: {
  onClose: () => void; onOpen?: (preset: Graph2DPreset) => Promise<boolean>; busy?: boolean; message?: string;
  personalProjects?: readonly MobileStoredSceneProject[]; currentGraph?: Graph2DDocument | null; projectFavorites?: readonly string[]; favoritesError?: string;
  onFavorite?: (id:string)=>boolean; onResetFavorites?: ()=>void; onPersonalOpen?: (id:string,title?:string)=>Promise<boolean>;
  importPreview?: Graph2DPersonalPresetPreview | null; onPreviewImport?: ()=>Promise<boolean>; onAcceptImport?: ()=>Promise<boolean>;
  onCancelImport?: ()=>void; onExportPersonal?: (id:string)=>Promise<boolean>; onShareDefinition?: (id:string)=>Promise<boolean>;
}) {
  const window = useWindowDimensions(), [contentWidth, setContentWidth] = useState(window.width);
  const layout = mobileGraphGalleryLayout(contentWidth, window.height, window.fontScale);
  const [query, setQuery] = useState(""), [category, setCategory] = useState<Graph2DPresetCategory | "All">("All");
  const [featured, setFeatured] = useState(true), [selected, setSelected] = useState<Graph2DPreset | null>(null);
  const [learn,setLearn]=useState(false),[selectedGuide,setSelectedGuide]=useState<Graph2DGuidedConcept|null>(null);
  const [shown, setShown] = useState(false);
  const [myGraphs,setMyGraphs]=useState(false),[favoritesOnly,setFavoritesOnly]=useState(false),[copyTitle,setCopyTitle]=useState(`${currentGraph?.metadata.title.slice(0,140) ?? "Graph"} copy`);
  const projects=[...(currentGraph?[{id:currentGraph.identity.id,title:currentGraph.metadata.title}]:[]),...personalProjects.filter(p=>p.id!==currentGraph?.identity.id)];
  const filteredProjects=projects.filter(p=>p.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())&&(!favoritesOnly||projectFavorites.includes(p.id)));
  const previewWidth=Math.min(320,Math.max(180,contentWidth-40)),previewSize={width:previewWidth,height:previewWidth*9/16};
  const personalPlot=useMemo(()=>{if(!importPreview)return {lines:[] as MobileGraphLine[],warning:""};try{
    const document=importPreview.document,pointTables=Object.fromEntries(document.source.objects.flatMap(object=>
      object.kind==="point-series"?[[object.table.id,mobileGraphPointTables.resolve(object.table)]]:[]));
    const sampled=sampleGraph2DScene({document:{...document,display:{...document.display,sampling:{maxSamples:256,maxDepth:6,tolerancePx:3}}},
      viewport:document.display.viewport,...previewSize,interaction:true,pointTables,timeBudgetMs:150});
    return {lines:projectMobileGraphLines(sampled,document.display.viewport,previewSize,null,256),
      warning:sampled.some(item=>item.artifact.diagnostics.some(d=>d.code==="deadline"||d.code==="sample-limit"))?"Bounded preview is incomplete.":""};
  }catch(e){return {lines:[] as MobileGraphLine[],warning:`Plot preview unavailable: ${(e as Error).message}`};}},[importPreview,previewSize.width]);
  const heading = useRef<Text>(null);
  const items = useMemo(() => mobileGraphGalleryItems(query, category, featured), [query, category, featured]);
  const button = (label: string, action: () => void, active = false, disabled = busy, text = label) => <Pressable key={label}
    accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active, disabled }}
    disabled={disabled} onPress={action} style={[s.button, active && s.active, disabled && s.disabled]}><Text style={s.buttonText}>{text}</Text></Pressable>;
  const preview = (preset: Graph2DPreset, width = layout.cardWidth - 2) => {
    const entry = manifest.entries.find(item => item.id === preset.id);
    return entry?.key === graph2DPresetPreviewKey(preset) && entry.presetDigest === preset.digest && mobileGraphGalleryAssets[preset.id]
      ? <Image source={mobileGraphGalleryAssets[preset.id]} style={[s.image, { width, height: width * 9 / 16 }]} resizeMode="contain" accessibilityLabel={`${preset.title} graph preview`} />
      : <Text>Preview unavailable. The editable scene remains available.</Text>;
  };
  const interactive = selected ? getGraph2DInteractivePreset(selected) : undefined;
  return <Modal visible animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {
    if (busy) return;
    if (Keyboard.isVisible()) { Keyboard.dismiss(); return; }
    onClose();
  }}
    onShow={() => { setShown(true); const handle = findNodeHandle(heading.current); if (handle) AccessibilityInfo.setAccessibilityFocus(handle); }}>
    <SafeAreaProvider><KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <GallerySafeArea>
      <View style={s.header}><Text ref={heading} accessibilityRole="header" style={s.heading}>Graph Gallery</Text>{button("Close Graph Gallery", onClose, false, busy, "Close")}</View>
      {shown && <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.content}
        onLayout={event => { const width = event.nativeEvent.layout.width; if (width > 0) setContentWidth(width); }}>
        {!layout.compact && <Text style={s.intro}>Explore the mathematics. Open an editable copy. {onOpen ? "Current work is saved before switching. " : ""}Previews are available offline.</Text>}
        {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
        <Text style={s.label}>Search graphs</Text><TextInput accessibilityLabel="Search graphs" testID="mobile-graph-gallery-search"
          value={query} onChangeText={text => { setQuery(text); setFeatured(false); setLearn(false); setSelectedGuide(null); setSelected(null); }} maxLength={160}
          placeholder="Try roses, tangent or gaps" editable={!busy} style={s.search} returnKeyType="search" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
          {button("Featured", () => { setMyGraphs(false); setLearn(false); setFeatured(true); setQuery(""); setCategory("All"); setSelected(null); }, !myGraphs&&!learn&&featured)}
          {button("All scenes", () => { setMyGraphs(false); setLearn(false); setFeatured(false); setQuery(""); setCategory("All"); setSelected(null); }, !myGraphs&&!learn&&!featured)}
          {button("Learn",()=>{setMyGraphs(false);setLearn(true);setQuery("");setSelected(null);setSelectedGuide(null);},learn)}
          {onPersonalOpen&&button("My Graphs",()=>{setMyGraphs(true);setLearn(false);setQuery("");setSelected(null);},myGraphs)}
        </ScrollView>
        {!learn&&!myGraphs&&<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
          {(["All", ...GRAPH2D_PRESET_CATEGORIES] as const).map(value => button(value, () => { setCategory(value); setFeatured(false); setSelected(null); }, category === value))}
        </ScrollView>}
        {myGraphs?<View testID="mobile-graph-my-graphs"><Text>Existing saved Graph projects. Copies preserve data and companion lineage.</Text>
          {button("Choose personal Graph file",()=>{void onPreviewImport?.();},false,busy||!onPreviewImport)}
          {importPreview&&<View testID="mobile-graph-personal-import-preview" style={s.detail}>
            <Text accessibilityRole="header" style={s.title}>{importPreview.document.metadata.title}</Text>
            <View accessibilityLabel={`${importPreview.document.metadata.title} graph import plot preview`} style={{width:previewSize.width,height:previewSize.height,backgroundColor:"#f8fafc",overflow:"hidden"}}>
              {personalPlot.lines.map((line,index)=><PreviewLine key={index} line={line}/>)}
            </View>
            {personalPlot.warning?<Text style={s.message}>{personalPlot.warning}</Text>:null}
            <Text>{importPreview.format} · {importPreview.document.source.objects.length} Graph objects · {importPreview.companionCount} companions · {importPreview.resultCount} saved result descriptors.</Text>
            <Text>{importPreview.document.source.objects.map(object=>`${object.label} (${object.kind})`).join(" · ")||"Empty Graph"}</Text>
            <Text>{importPreview.externalTableCount} external point-table sidecars · {importPreview.externalArtifactCount} external artifact descriptors. The file does not embed their bytes. Saved results are copied observations.</Text>
            {importPreview.missingTables.length>0?<Text accessibilityLiveRegion="polite" style={s.message}>{importPreview.missingTables.length} required point-table sidecars missing or corrupt. Import them before accepting this Graph.</Text>:null}
            {button("Import as independent Graph",()=>{void onAcceptImport?.();},false,busy||!onAcceptImport||importPreview.missingTables.length>0)}
            {button("Cancel personal Graph import",()=>onCancelImport?.())}
          </View>}
          {favoritesError?<View><Text accessibilityLiveRegion="polite">{favoritesError}</Text>{button("Reset project favorites",()=>onResetFavorites?.())}</View>:null}
          {currentGraph&&<><Text>Reusable copy title</Text><TextInput accessibilityLabel="Reusable copy title" maxLength={160} editable={!busy} style={s.search} value={copyTitle} onChangeText={setCopyTitle}/>
            {button("Save current as reusable copy",()=>{void onPersonalOpen?.(currentGraph.identity.id,copyTitle);})}</>}
          {button("Project favorites only",()=>setFavoritesOnly(!favoritesOnly),favoritesOnly)}
          {filteredProjects.map(p=><View key={p.id} style={s.body}><Text accessibilityRole="header" style={s.title}>{p.title}</Text>
            {button(`Open project ${p.title}`,()=>{void onPersonalOpen?.(p.id);})}
            {button(`Copy project ${p.title}`,()=>{void onPersonalOpen?.(p.id,`${p.title.slice(0,140)} copy`);})}
            {button(`Export preset ${p.title}`,()=>{void onExportPersonal?.(p.id);},false,busy||!onExportPersonal)}
            {button(`Share graph definition ${p.title}`,()=>{void onShareDefinition?.(p.id);},false,busy||!onShareDefinition)}
            {button(`Favorite project ${p.title}`,()=>{onFavorite?.(p.id);},projectFavorites.includes(p.id),busy||!!favoritesError)}</View>)}
          {!filteredProjects.length&&<Text>No matching saved Graph projects.</Text>}
        </View>:learn ? (selectedGuide?<View style={s.detail} testID="mobile-graph-gallery-guide-detail">
          {button("Back to guided concepts",()=>setSelectedGuide(null))}
          <Text accessibilityRole="header" style={s.title}>{selectedGuide.title}</Text><Text style={s.description}>{selectedGuide.summary}</Text>
          <Text style={s.meta}>{selectedGuide.level} · {selectedGuide.steps.length} steps. Source-linked markers become stale after source edits; no analysis or animation runs automatically.</Text>
          {selectedGuide.steps.map((step,index)=><View key={step.heading} style={s.body}>
            <Text accessibilityRole="header" style={s.label}>{index+1}. {step.heading}</Text>
            <Text style={s.description}>{step.explanation}</Text><Text style={s.description}>Try this: {step.tryThis}</Text>
          </View>)}
          {onOpen&&button(`Open guided ${selectedGuide.title}`,()=>{void onOpen(getGraph2DGuidedPreset(selectedGuide.id));})}
        </View>:<View style={s.detail} testID="mobile-graph-gallery-guides">
          <Text accessibilityRole="header" style={s.title}>Guided concepts</Text>
          <Text style={s.description}>Study a concept, then open an independent editable graph with bounded source-linked markers.</Text>
          {getGraph2DGuidedConcepts().map(concept=><View key={concept.id} style={s.body}>
            <Text accessibilityRole="header" style={s.label}>{concept.title} · {concept.level}</Text><Text style={s.description}>{concept.summary}</Text>
            {button(`Study ${concept.title}`,()=>setSelectedGuide(concept))}</View>)}
        </View>) : selected ? <View style={s.detail} testID="mobile-graph-gallery-detail">
          {button("Back to gallery", () => setSelected(null))}{preview(selected, contentWidth - 40)}<Text accessibilityRole="header" style={s.title}>{selected.title}</Text>
          <Text style={s.description}>{selected.description}</Text>{selected.learningGoals.map(goal => <Text key={goal} style={s.description}>• {goal}</Text>)}
          <Text style={s.meta}>Approximate sampled preview · {selected.attribution.author} · {selected.attribution.license}</Text>
          {onOpen && button(busy ? "Opening graph…" : `Open ${selected.title}`, () => { void onOpen(selected); })}
          {interactive && <View style={s.detail} accessibilityLabel="Interactive copy controls"><Text style={s.label}>Interactive copy · sliders and opt-in animation</Text>
            <Text style={s.description}>{interactive.description}</Text><Text style={s.meta}>Preview shows default values. Requires {interactive.requiredCapabilities.join(" · ")}. Open, then choose Parameters. No autoplay.</Text>
            {onOpen && button(`Open interactive ${selected.title}`, () => { void onOpen(interactive); })}</View>}
        </View> : <>
          <Text accessibilityLiveRegion="polite" style={s.meta}>{items.length} scenes · {featured ? "hand-picked starting points" : "editable examples"}</Text>
          <View style={s.grid}>{items.map(preset => <View key={preset.id} style={[s.card, { width: layout.cardWidth }]} testID={`mobile-graph-gallery-card-${preset.id}`}>
            {preview(preset)}<View style={s.body}><Text style={s.meta}>{preset.category} · {preset.difficulty}</Text>
              <Text accessibilityRole="header" style={s.title}>{preset.title}</Text><Text style={s.description}>{preset.description}</Text>
              {getGraph2DInteractivePreset(preset) && <Text style={s.meta}>Interactive copy available in Preview</Text>}
              <View style={s.actions}>{onOpen && button(`Open ${preset.title}`, () => { void onOpen(preset); })}
                {button(`Preview ${preset.title}`, () => setSelected(preset))}</View></View>
          </View>)}</View>{!items.length && <Text style={s.description}>No scenes match these filters. Try another search or category.</Text>}
        </>}
      </ScrollView>}
    </GallerySafeArea></KeyboardAvoidingView></SafeAreaProvider>
  </Modal>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" }, header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", padding: 16, gap: 8 },
  heading: { fontSize: 24, fontWeight: "700", flex: 1, color: "#0f172a" }, content: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  intro: { color: "#334155", fontSize: 16 }, label: { color: "#0f172a", fontWeight: "600" }, search: { minHeight: 48, borderWidth: 1, borderColor: "#94a3b8", backgroundColor: "white", borderRadius: 10, padding: 12, fontSize: 16 },
  filters: { gap: 8 }, button: { minHeight: 48, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#94a3b8", backgroundColor: "white", justifyContent: "center" },
  buttonText: { color: "#1d4ed8", fontWeight: "600", fontSize: 14 }, active: { backgroundColor: "#dbeafe", borderColor: "#2563eb" }, disabled: { opacity: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, card: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, overflow: "hidden", backgroundColor: "white" },
  image: { backgroundColor: "#f8fafc" }, body: { padding: 14, gap: 10 }, meta: { color: "#475569", fontSize: 13 },
  title: { fontSize: 20, color: "#0f172a", fontWeight: "700" }, description: { fontSize: 15, color: "#334155" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  detail: { gap: 14 }, message: { fontSize: 15, color: "#9a3412" },
});
