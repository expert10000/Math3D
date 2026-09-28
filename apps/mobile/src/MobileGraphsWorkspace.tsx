import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { fitGraph2DViewport, GRAPH2D_DEFAULT_VIEWPORT, graph2DWorldToScreen, pickGraph2DProbe,
  resolveGraph2DViewport, sampleGraph2DScene, selectionForGraph2DObject, type Graph2DDocument, type Graph2DViewport } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { MobileGraphGesture, mobileGraphProbeRadius, type GraphTouch } from "./models/mobileGraphGestures";
import { mobileGraphCapabilities } from "./models/mobileGraphProject";
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
  const [destination, setDestination] = useState<"Graph" | "Functions" | "Analyze">("Graph");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const viewport = preview ?? document.display.viewport;
  const cancel = () => { gesture.current.cancel(); setPreview(null); };
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => { if (state !== "active") cancel(); });
    return () => { listener.remove(); gesture.current.cancel(); };
  }, []);
  const series = useMemo(() => {
    // Advanced definitions stay untouched in the saved source; their mobile UI comes in MOB-G09.
    const indices = document.source.objects.flatMap((object, index) => object.kind === "explicit-cartesian" ? [index] : []);
    const limited = { ...document, source: { ...document.source, objects: indices.map((index) => document.source.objects[index]!) },
      display: { ...document.display, objects: indices.map((index) => document.display.objects[index]!),
        sampling: { ...document.display.sampling, maxSamples: preview ? 256 : 1024, maxDepth: 8, tolerancePx: preview ? 3 : 1.5 } } };
    return sampleGraph2DScene({ document: limited, viewport, ...size, interaction: !!preview });
  }, [document.source, document.display, preview, viewport, size]);
  const lines = useMemo(() => projectMobileGraphLines(series, viewport, size, document.selection.objectId), [series, viewport, size, document.selection.objectId]);
  const ticks = mobileGraphTicks(viewport, size);
  const bounds = resolveGraph2DViewport(viewport, size);
  const probe = document.selection.probe;
  const marker = probe ? graph2DWorldToScreen(viewport, size, probe) : null;
  const history = adapter.history();
  const commit = (action: () => Graph2DDocument | null) => {
    cancel(); try { const next = action(); if (next) onChange(next); setError(""); }
    catch (caught) { setError((caught as Error).message); }
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
  return <View style={s.root} testID="mobile-graphs-workspace">
    <Text style={s.title} numberOfLines={1}>{document.metadata.title}</Text>
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
        {document.display.axes.x && axis({ x: bounds.xMin, y: 0 }, { x: bounds.xMax, y: 0 })}
        {document.display.axes.y && axis({ x: 0, y: bounds.yMin }, { x: 0, y: bounds.yMax })}
        {document.display.axes.grid && ticks.x.map((x) => {
          const point = graph2DWorldToScreen(viewport, size, { x, y: 0 });
          return <View key={`x${x}`} style={{ position: "absolute", left: point.x, height: "100%", width: 1, backgroundColor: "#e2e8f0" }}>
            {document.display.axes.labels && <Text style={{ fontSize: 10, top: size.height - 14 }}>{Number(x.toPrecision(3))}</Text>}</View>;
        })}
        {document.display.axes.grid && ticks.y.map((y) => {
          const point = graph2DWorldToScreen(viewport, size, { x: 0, y });
          return <View key={`y${y}`} style={{ position: "absolute", top: point.y, width: "100%", height: 1, backgroundColor: "#e2e8f0" }}>
            {document.display.axes.labels && <Text style={{ fontSize: 10 }}>{Number(y.toPrecision(3))}</Text>}</View>;
        })}
        {lines.map((line, index) => <Line key={index} {...line} />)}
        {marker && marker.x >= 0 && marker.x <= size.width && marker.y >= 0 && marker.y <= size.height &&
          <View style={{ position: "absolute", left: marker.x - 7, top: marker.y - 7, width: 14, height: 14,
            borderRadius: 7, borderWidth: 2, borderColor: "#0f172a", backgroundColor: "#fff" }} />}
      </View>
      {!document.source.objects.length && <Text pointerEvents="none" style={s.empty}>Empty graph. Import a desktop Graph project or open the Line graph starter.</Text>}
    </View>
    <Text accessibilityLiveRegion="polite" style={s.readout} numberOfLines={2} testID="mobile-graph-probe">{probe ?
      `${document.source.objects.find((object) => object.id === probe.objectId)?.label}: x=${probe.x.toPrecision(6)}, y=${probe.y.toPrecision(6)}` : "Tap a curve to probe. Tap overlaps again to cycle."}</Text>
    {error || message ? <Text accessibilityLiveRegion="polite" numberOfLines={2} style={s.readout}>{error || message}</Text> : null}
    {destination !== "Graph" && <ScrollView style={s.sheet} testID={`mobile-graph-${destination.toLowerCase()}-sheet`}>
      {destination === "Functions" ? document.source.objects.map((object) => <View key={object.id}>
        {button(`${object.label} · ${object.kind}`, () => commit(() => adapter.commitSelection(
          selectionForGraph2DObject(document, series, object.id))))}
        {object.kind === "explicit-cartesian" && <Text style={s.readout}>y = {object.expression.source}</Text>}
      </View>) : <><Text style={s.readout}>{mobileGraphCapabilities(document)}</Text>
        <Text style={s.readout}>Probe method: direct expression evaluation (floating point). Sampling is approximate.</Text>
        {series.some((item) => !item.artifact.converged) && <Text style={s.readout}>Sampling budget reached; unresolved regions are not a proof of absence.</Text>}
        {button("Clear probe", () => commit(() => adapter.commitSelection({ objectId: null, probe: null })))}
        {probe && button("Cycle overlap", () => tap(graph2DWorldToScreen(document.display.viewport, size, probe)))}
      </>}
    </ScrollView>}
    <View style={s.destinations} accessibilityRole="tablist">{(["Graph", "Functions", "Analyze"] as const).map((value) =>
      <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: destination === value }} style={s.button}
        onPress={() => { cancel(); setDestination(value); }}><Text>{value}</Text></Pressable>)}</View>
  </View>;
};

const s = StyleSheet.create({ root: { flex: 1, minHeight: 0, paddingHorizontal: 8 }, title: { fontSize: 18, fontWeight: "600" },
  toolbar: { flexDirection: "row" }, button: { minWidth: 44, minHeight: 44, padding: 10, justifyContent: "center" },
  plot: { flex: 1, minHeight: 48, backgroundColor: "#fff", overflow: "hidden", borderWidth: 1, borderColor: "#cbd5e1" },
  readout: { fontSize: 12, paddingVertical: 3 }, empty: { padding: 20, color: "#64748b" },
  sheet: { position: "absolute", bottom: 48, left: 8, right: 8, maxHeight: "45%", flexGrow: 0,
    backgroundColor: "#f8fafc", zIndex: 2, borderWidth: 1, borderColor: "#cbd5e1" },
  destinations: { flexDirection: "row", justifyContent: "space-around" } });
