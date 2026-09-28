import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { fitGraph2DViewport, GRAPH2D_DEFAULT_VIEWPORT, graph2DWorldToScreen, pickGraph2DProbe,
  resolveGraph2DViewport, sampleGraph2DScene, selectionForGraph2DObject, clipGraph2DLineOverlay, Graph2DPointTableStore, type Graph2DDocument, type Graph2DViewport } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { MobileGraphGesture, mobileGraphProbeRadius, type GraphTouch } from "./models/mobileGraphGestures";
import { mobileGraphCapabilities } from "./models/mobileGraphProject";
import { mobileGraphSamplingPolicy, mobileGraphDisplayScene, MOBILE_GRAPH_DEFAULT_OVERLAYS } from "./models/mobileGraphDisplay";
import { MobileGraphDisplayPanel } from "./MobileGraphDisplayPanel";
import { mobileGraphAreaRects } from "./viewer/mobileGraphOverlays";
import { editMobileGraphProbes } from "./models/mobileGraphProbes";
import { MobileGraphProbesPanel } from "./MobileGraphProbesPanel";
import { MobileGraphFunctionsPanel } from "./MobileGraphFunctionsPanel";
import { applyMobileGraphAuthoring, type MobileGraphEditor } from "./models/mobileGraphAuthoring";
import { mobileGraphKindAction, type MobileGraphAdvancedEditor } from "./models/mobileGraphAdvancedAuthoring";
import { mobileGraphPointTables, pickMobileGraphPointText } from "./services/mobileGraphPointTables";
import { mobileGraphAdvancedGeometry } from "./viewer/mobileGraphAdvancedProjection";
import { MobileGraphAnalysisPanel } from "./MobileGraphAnalysisPanel";
import { mobileGraphAnalysisDraft, runMobileGraphAnalysis, isMobileGraphAnalysisCurrent, mobileGraphAnalysisProbe,
  type MobileGraphAnalysis } from "./models/mobileGraphAnalysis";
import { clipMobileGraphLine, mobileGraphTicks, projectMobileGraphLines, type MobileGraphLine } from "./viewer/mobileGraphProjection";

const touches = (event: GestureResponderEvent): GraphTouch[] => event.nativeEvent.touches.map((touch) =>
  ({ id: touch.identifier, x: touch.locationX, y: touch.locationY }));
const Line = ({ a, b, color, width }: MobileGraphLine) => <View pointerEvents="none" style={{ position: "absolute",
  left: (a.x + b.x) / 2 - Math.hypot(b.x - a.x, b.y - a.y) / 2, top: (a.y + b.y) / 2 - width / 2,
  width: Math.hypot(b.x - a.x, b.y - a.y), height: width, backgroundColor: color,
  transform: [{ rotate: `${Math.atan2(b.y - a.y, b.x - a.x)}rad` }] }} />;

export const MobileGraphsWorkspace = ({ document, onChange, onSave, message, onHaptic }: {
  document: Graph2DDocument; onChange: (document: Graph2DDocument) => void;
  onSave: () => Promise<boolean>; message: string; onHaptic?: () => void;
}) => {
  const [adapter] = useState(() => new Graph2DCommandAdapter(document));
  const gesture = useRef(new MobileGraphGesture());
  const [size, setSize] = useState({ width: 320, height: 320 });
  const [preview, setPreview] = useState<Graph2DViewport | null>(null);
  const [destination, setDestination] = useState<"Graph" | "Functions" | "Analyze" | "Display">("Graph");
  const [overlays, setOverlays] = useState(MOBILE_GRAPH_DEFAULT_OVERLAYS);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<MobileGraphEditor | null>(null);
  const [advanced, setAdvanced] = useState<MobileGraphAdvancedEditor | null>(null);
  const [analysisDraft, setAnalysisDraft] = useState(() => mobileGraphAnalysisDraft(document));
  const [analysis, setAnalysis] = useState<MobileGraphAnalysis | null>(null);
  const viewport = preview ?? document.display.viewport;
  const cancel = () => { gesture.current.cancel(); setPreview(null); };
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => { if (state !== "active") cancel(); });
    return () => { listener.remove(); gesture.current.cancel(); };
  }, []);
  const series = useMemo(() => {
    const limited = { ...document, display: { ...document.display, sampling: mobileGraphSamplingPolicy(document, !!preview) } };
    const pointTables = Object.fromEntries(document.source.objects.flatMap((object) => object.kind === "point-series" ? [[object.table.id, mobileGraphPointTables.resolve(object.table)]] : []));
    return sampleGraph2DScene({ document: limited, viewport, ...size, interaction: !!preview, pointTables });
  }, [document.source, document.display, preview, viewport, size]);
  const geometry = useMemo(() => mobileGraphAdvancedGeometry(series, viewport, size), [series, viewport, size]);
  const lines = useMemo(() => projectMobileGraphLines(geometry.boundaries, viewport, size, document.selection.objectId), [geometry, viewport, size, document.selection.objectId]);
  const ticks = mobileGraphTicks(viewport, size);
  const bounds = resolveGraph2DViewport(viewport, size);
  const probe = document.selection.probe;
  const marker = probe ? graph2DWorldToScreen(viewport, size, probe) : null;
  const analysisCurrent = !!analysis && isMobileGraphAnalysisCurrent(analysis, document, analysisDraft);
  const history = adapter.history();
  const commit = (action: () => Graph2DDocument | null) => {
    cancel(); try { const next = action(); if (next) onChange(next); setError(""); return true; }
    catch (caught) { setError((caught as Error).message); return false; }
  };
  const tap = (screen: { x: number; y: number }) => commit(() => {
    const picked = pickGraph2DProbe({ document, series, viewport: document.display.viewport, size, screen,
      previous: document.selection, radiusPx: mobileGraphProbeRadius(size.width) });
    if (picked.selection.probe) onHaptic?.();
    return adapter.commitSelection(picked.selection);
  });
  const finish = () => {
    const result = gesture.current.finish(); setPreview(null);
    if (result.viewport) commit(() => adapter.commitViewport(result.viewport!));
    else if (result.tap) tap(result.tap);
  };
  const fit = () => {
    const points = series.flatMap((item) => item.artifact.segments.flatMap((segment) => segment.points));
    if (!points.length) { setError("No finite visible points to fit."); return; }
    commit(() => adapter.commitViewport(fitGraph2DViewport({ xMin: Math.min(...points.map((point) => point.x)),
      xMax: Math.max(...points.map((point) => point.x)), yMin: Math.min(...points.map((point) => point.y)),
      yMax: Math.max(...points.map((point) => point.y)) }, size)));
  };
  const axis = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const line = clipMobileGraphLine(graph2DWorldToScreen(viewport, size, a), graph2DWorldToScreen(viewport, size, b), size);
    return line ? <Line {...line} color="#64748b" width={1.5} /> : null;
  };
  const button = (label: string, action: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button"
    accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={action} style={s.button}>
    <Text style={{ color: disabled ? "#94a3b8" : "#1d4ed8" }}>{label}</Text></Pressable>;
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.root} testID="mobile-graphs-workspace">
    <View style={{ flexDirection: "row", alignItems: "center" }}><Text style={[s.title, { flex: 1 }]} numberOfLines={1}>{document.metadata.title}</Text>
      {button("Display", () => { cancel(); setDestination(destination === "Display" ? "Graph" : "Display"); })}</View>
    <ScrollView horizontal style={{ flexGrow: 0, maxHeight: 48 }} contentContainerStyle={s.toolbar}>{button("Reset", () => commit(() => adapter.commitViewport(GRAPH2D_DEFAULT_VIEWPORT)))}
      {button("Fit", fit)}{button("Undo", () => commit(() => adapter.undo()), history.undoDepth === 0)}
      {button("Redo", () => commit(() => adapter.redo()), history.redoDepth === 0)}
      {button(saving ? "Saving…" : "Save", () => { setSaving(true); void onSave().finally(() => setSaving(false)); }, saving)}</ScrollView>
    <View style={s.plot} testID="mobile-graph-plot" accessibilityLabel="Graph plot. Drag to pan, pinch to zoom, tap to probe."
      onLayout={(event) => { cancel(); const { width, height } = event.nativeEvent.layout; if (width > 0 && height > 0) setSize({ width, height }); }}
      onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
      onResponderGrant={(event) => gesture.current.begin(document.display.viewport, size, touches(event))}
      onResponderStart={(event) => setPreview(gesture.current.update(touches(event)))}
      onResponderMove={(event) => { try { setPreview(gesture.current.update(touches(event))); } catch { cancel(); } }}
      onResponderEnd={(event) => { if (event.nativeEvent.touches.length) setPreview(gesture.current.update(touches(event))); }}
      onResponderRelease={finish} onResponderTerminate={cancel} onResponderTerminationRequest={() => true}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {geometry.fills.map((rect, index) => <View key={`region${index}`} style={{ position: "absolute", ...rect, backgroundColor: rect.color, opacity: 0.18 }} />)}
        {overlays.area && analysisCurrent && analysis && document.display.objects.find((style) => style.objectId === analysisDraft.objectId)?.visible &&
          mobileGraphAreaRects(analysis, viewport, size).map((rect, index) => <View key={`area${index}`} style={{ position: "absolute", ...rect, backgroundColor: rect.color, opacity: 0.5 }} />)}
        {document.display.axes.x && axis({ x: bounds.xMin, y: 0 }, { x: bounds.xMax, y: 0 })}
        {document.display.axes.y && axis({ x: 0, y: bounds.yMin }, { x: 0, y: bounds.yMax })}
        {(document.display.axes.grid || document.display.axes.labels) && ticks.x.map((x) => {
          const point = graph2DWorldToScreen(viewport, size, { x, y: 0 });
          return <React.Fragment key={`x${x}`}>{document.display.axes.grid && <View style={{ position: "absolute", left: point.x, height: "100%", width: 1, backgroundColor: "#e2e8f0" }} />}
            {document.display.axes.labels && <Text style={{ position: "absolute", fontSize: 10, left: Math.max(0, Math.min(size.width - 26, point.x + 2)),
              top: size.height - 14 }}>{Number(x.toPrecision(3))}</Text>}</React.Fragment>;
        })}
        {(document.display.axes.grid || document.display.axes.labels) && ticks.y.map((y) => {
          const point = graph2DWorldToScreen(viewport, size, { x: 0, y });
          return <React.Fragment key={`y${y}`}>{document.display.axes.grid && <View style={{ position: "absolute", top: point.y, width: "100%", height: 1, backgroundColor: "#e2e8f0" }} />}
            {document.display.axes.labels && <Text style={{ position: "absolute", fontSize: 10, left: 2,
              top: Math.max(0, Math.min(size.height - 14, point.y + 2)) }}>{Number(y.toPrecision(3))}</Text>}</React.Fragment>;
        })}
        {lines.map((line, index) => <Line key={index} {...line} />)}
        {geometry.points.map((point, index) => <View key={`data${index}`} style={{ position: "absolute", left: point.x - 3, top: point.y - 3,
          width: 6, height: 6, borderRadius: 3, borderWidth: point.open ? 1 : 0, borderColor: point.color, backgroundColor: point.open ? "white" : point.color }} />)}
        {overlays.tangent && analysis && analysisCurrent && analysis.overlays.filter((overlay) =>
          document.display.objects.find((style) => style.objectId === overlay.objectId)?.visible).map((overlay) => {
          const points = clipGraph2DLineOverlay(overlay, viewport, size);
          return points && <Line key={overlay.artifactId} a={graph2DWorldToScreen(viewport, size, points[0])}
            b={graph2DWorldToScreen(viewport, size, points[1])} color="#b45309" width={2} />;
        })}
        {overlays.features && analysis && analysisCurrent && (analysis.kind === "features" || analysis.kind === "intersections") && analysis.rows.filter((row) =>
          row.probe && document.display.objects.find((style) => style.objectId === row.probe!.objectId)?.visible).slice(0, 128).map((row, index) => {
          const point = graph2DWorldToScreen(viewport, size, row.probe!);
          return point.x >= 0 && point.x <= size.width && point.y >= 0 && point.y <= size.height ? <View key={`feature${index}`} style={{ position: "absolute",
            left: point.x - 4, top: point.y - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: "#9333ea" }} /> : null;
        })}
        {(document.display.pinnedProbes ?? []).filter((probe) => probe.sourceHash === document.identity.structuralHash &&
          document.display.objects.find((style) => style.objectId === probe.objectId)?.visible).map((probe) => {
          const point = graph2DWorldToScreen(viewport, size, probe);
          if (point.x < 0 || point.x > size.width || point.y < 0 || point.y > size.height) return null;
          return <View key={probe.id} style={{ position: "absolute", left: point.x - 5, top: point.y - 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#b45309" }} /><Text style={{ fontSize: 11 }}>{probe.label}</Text></View>;
        })}
        {marker && marker.x >= 0 && marker.x <= size.width && marker.y >= 0 && marker.y <= size.height &&
          <View style={{ position: "absolute", left: marker.x - 7, top: marker.y - 7, width: 14, height: 14,
            borderRadius: 7, borderWidth: 2, borderColor: "#0f172a", backgroundColor: "#fff" }} />}
      </View>
      {!document.source.objects.length && <Text pointerEvents="none" style={s.empty}>Empty graph. Open Functions to add a graph object, or import a desktop Graph project.</Text>}
    </View>
    <Text accessibilityLiveRegion="polite" style={s.readout} numberOfLines={2} testID="mobile-graph-probe">{probe ?
      `${document.source.objects.find((object) => object.id === probe.objectId)?.label}: x=${probe.x.toPrecision(6)}, y=${probe.y.toPrecision(6)}${probe.parameter !== undefined ? `, parameter=${probe.parameter.toPrecision(6)}` : ""}${probe.rowId ? `, ${probe.rowId}` : ""}` : "Tap a curve to probe. Tap overlaps again to cycle."}</Text>
    {(geometry.truncated || series.some((item) => !item.artifact.converged)) && <Text style={s.readout}>Approximate/incomplete display. Check Display diagnostics; missing data requires its CSV/TSV sidecar.</Text>}
    {error || message ? <Text accessibilityLiveRegion="polite" numberOfLines={2} style={s.readout}>{error || message}</Text> : null}
    {destination !== "Graph" && <ScrollView keyboardShouldPersistTaps="handled" style={s.sheet} testID={`mobile-graph-${destination.toLowerCase()}-sheet`}>
      {destination === "Display" ? <MobileGraphDisplayPanel document={document} series={series} overlays={overlays} lineCount={lines.length}
        onOverlays={setOverlays} onAxis={(key) => commit(() => adapter.commitScene(mobileGraphDisplayScene(document, { type: "axis", key }), "style"))}
        onQuality={(quality) => commit(() => adapter.commitScene(mobileGraphDisplayScene(document, { type: "quality", quality }), "style"))} /> : destination === "Functions" ? <MobileGraphFunctionsPanel document={document} editor={editor} onEditor={setEditor}
        advanced={advanced} onAdvanced={setAdvanced}
        onApplyAdvanced={() => { if (!advanced) return; if (commit(() => {
          // Validate using a transient store before any persistent sidecar write or scene command.
          applyMobileGraphAuthoring(document, mobileGraphKindAction(advanced, new Graph2DPointTableStore()));
          const action = mobileGraphKindAction(advanced, mobileGraphPointTables);
          return adapter.commitScene(applyMobileGraphAuthoring(document, action), action.type);
        })) setAdvanced(null); }}
        onPick={() => { const pending = advanced; void pickMobileGraphPointText().then((data) => {
          if (data !== null) setAdvanced((current) => current && current === pending ? { ...current, draft: { ...current.draft, data } } : current);
        }).catch((caught: Error) => setError(caught.message)); }}
        onApply={(action) => commit(() => adapter.commitScene(applyMobileGraphAuthoring(document, action), action.type))}
        onSelect={(id) => commit(() => adapter.commitSelection(selectionForGraph2DObject(document, series, id)))} /> : <><Text style={s.readout}>{mobileGraphCapabilities(document)}</Text>
        <Text style={s.readout}>Probes: evaluated explicit/parametric/polar, interpolated contours, nearest data row. Sampling is approximate. Analysis and saved pins currently require explicit y(x).</Text>
        {series.some((item) => !item.artifact.converged) && <Text style={s.readout}>Sampling budget reached; unresolved regions are not a proof of absence.</Text>}
        {button("Clear probe", () => commit(() => adapter.commitSelection({ objectId: null, probe: null })))}
        {probe && button("Cycle overlap", () => tap(graph2DWorldToScreen(document.display.viewport, size, probe)))}
        <MobileGraphAnalysisPanel document={document} draft={analysisDraft} result={analysis} onDraft={setAnalysisDraft}
          onRun={() => { cancel(); try { setAnalysis(runMobileGraphAnalysis(document, analysisDraft)); setError(""); }
            catch (caught) { setError((caught as Error).message); } }}
          onLocate={(point) => commit(() => {
            if (!analysis || !isMobileGraphAnalysisCurrent(analysis, document, analysisDraft)) throw new TypeError("Result is stale; run analysis again.");
            return adapter.commitSelection({ objectId: point.objectId, probe: mobileGraphAnalysisProbe(document, point) });
          })} />
        <MobileGraphProbesPanel document={document} onAction={(action) => commit(() => adapter.commitScene({ source: document.source,
          selection: document.selection, display: { ...document.display, pinnedProbes: editMobileGraphProbes(document, action) } }, "pinned-probes"))}
          onLocate={(id) => commit(() => {
            const pinned = document.display.pinnedProbes?.find((entry) => entry.id === id);
            if (!pinned || pinned.sourceHash !== document.identity.structuralHash) throw new TypeError("Saved probe is stale.");
            return adapter.commitSelection({ objectId: pinned.objectId, probe: { objectId: pinned.objectId, x: pinned.x, y: pinned.y } });
          })} />
      </>}
    </ScrollView>}
    <View style={s.destinations} accessibilityRole="tablist">{(["Graph", "Functions", "Analyze"] as const).map((value) =>
      <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: destination === value }} style={s.button}
        onPress={() => { cancel(); setDestination(value); }}><Text>{value}</Text></Pressable>)}</View>
  </KeyboardAvoidingView>;
};

const s = StyleSheet.create({ root: { flex: 1, minHeight: 0, paddingHorizontal: 8 }, title: { fontSize: 18, fontWeight: "600" },
  toolbar: { flexDirection: "row" }, button: { minWidth: 44, minHeight: 44, padding: 10, justifyContent: "center" },
  plot: { flex: 1, minHeight: 48, backgroundColor: "#fff", overflow: "hidden", borderWidth: 1, borderColor: "#cbd5e1" },
  readout: { fontSize: 12, paddingVertical: 3 }, empty: { padding: 20, color: "#64748b" },
  sheet: { position: "absolute", bottom: 48, left: 8, right: 8, maxHeight: "45%", flexGrow: 0,
    backgroundColor: "#f8fafc", zIndex: 2, borderWidth: 1, borderColor: "#cbd5e1" },
  destinations: { flexDirection: "row", justifyContent: "space-around" } });
