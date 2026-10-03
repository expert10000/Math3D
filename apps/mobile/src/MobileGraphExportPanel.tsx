import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { createGraph2DPublication, GRAPH2D_PUBLICATION_FORMATS, renderGraph2DPublicationArtifact, renderGraph2DCaptureRecipeArtifact, structuralHash,
  type Graph2DDocument, type Graph2DPublication, type Graph2DPublicationFormat } from "@math3d/core";
import { type MobileGraphAnalysis, type MobileGraphAnalysisDraft } from "./models/mobileGraphAnalysis";
import { mobileGraphPublicationRequest } from "./models/mobileGraphPublication";
import { mobileGraphPointTables } from "./services/mobileGraphPointTables";
import type { Graph2DPointTableStore } from "@math3d/core";
import { saveMobileGraphPublication, shareMobileGraphPublication } from "./services/mobileGraphPublicationService";

export function MobileGraphExportPanel({ document, analysis, draft, pointTables = mobileGraphPointTables }: {
  document: Graph2DDocument; analysis: MobileGraphAnalysis | null; draft: MobileGraphAnalysisDraft;
  pointTables?: Graph2DPointTableStore;
}) {
  const [units, setUnits] = useState({ x: "", y: "" }), [width, setWidth] = useState(640), [format, setFormat] = useState<Graph2DPublicationFormat>("svg");
  const [attribution, setAttribution] = useState("Math3D Graph publication"), screen = useWindowDimensions();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [prepared, setPrepared] = useState<Graph2DPublication | null>(null);
  const key = structuralHash({ document, analysis, draft, width, units }), latest = useRef(key); latest.current = key;
  const generation = useRef(0), mounted = useRef(true), phase = useRef("idle"), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cache = useRef<{ key: string; publication: Graph2DPublication } | null>(null);
  const cancel = () => { generation.current++; if (timer.current) clearTimeout(timer.current); timer.current = null; phase.current = "idle";
    if (mounted.current) { setBusy(false); setMessage("Export cancelled."); } };
  useEffect(() => { cancel(); cache.current = null; setPrepared(null); setMessage(""); }, [key]);
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener("change", state => { if (state !== "active" && phase.current === "preparing") cancel(); });
    return () => { mounted.current = false; cancel(); listener.remove(); };
  }, []);
  const run = (share: boolean, capture = false) => {
    if (busy || phase.current !== "idle" || AppState.currentState !== "active") return;
    const token = ++generation.current, isCurrent = () => mounted.current && generation.current === token && latest.current === key;
    phase.current = "preparing"; setBusy(true); setMessage("Preparing bounded export…");
    // Let the busy/cancel state paint first. Shared sample/raster budgets bound synchronous native work;
    // this is not a native worker or a hard real-time/preemptive cancellation guarantee.
    timer.current = setTimeout(() => { timer.current = null;
      void (async () => {
        try {
          if (!isCurrent()) return;
          const publication = cache.current?.key === key ? cache.current.publication : createGraph2DPublication(
            mobileGraphPublicationRequest(document, pointTables, analysis, draft, { width, height: width * .75 }, units));
          const artifact = capture ? renderGraph2DCaptureRecipeArtifact(document, publication, "light", attribution,
            { width: Math.round(screen.width), height: Math.round(screen.height) }) : renderGraph2DPublicationArtifact(publication, format);
          if (!isCurrent()) return;
          cache.current = { key, publication }; setPrepared(publication); phase.current = "native";
          if (share) { await shareMobileGraphPublication(artifact, isCurrent); if (isCurrent()) setMessage(`Share sheet closed · ${artifact.fileName}`); }
          else { const result = await saveMobileGraphPublication(artifact, isCurrent); if (isCurrent()) setMessage(result.status === "saved" ? `Saved and verified ${result.fileName}` : "Export cancelled."); }
        } catch (error) { if (isCurrent()) setMessage((error as Error).message); }
        finally { if (isCurrent()) { phase.current = "idle"; setBusy(false); } }
      })();
    }, 50);
  };
  const button = (label: string, action: () => void, disabled = false, selected?: boolean) => <Pressable key={label} accessibilityRole="button"
    accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={action} style={[s.button, selected && s.selected]}><Text>{label}</Text></Pressable>;
  return <View style={s.panel} testID="mobile-graph-publication-export"><Text accessibilityRole="header" style={s.title}>Graph publication export</Text>
    <Text>Local files, no upload. Uses the committed viewport and current analysis only. Static exports are not editable projects.</Text>
    <Text>Image size (an equal-aspect view may expand):</Text><View style={s.row}>{[320, 640, 1024].map(value => button(`${value} × ${value * .75}`, () => setWidth(value), busy, width === value))}</View>
    {(["x", "y"] as const).map(axis => <View key={axis}><Text>{axis.toUpperCase()} unit label</Text><TextInput style={s.input} accessibilityLabel={`${axis.toUpperCase()} unit label`}
      placeholder="Unspecified" maxLength={64} value={units[axis]} editable={!busy} onChangeText={text => setUnits(previous => ({ ...previous, [axis]: text }))} /></View>)}
    <Text>Labels only; no inference or unit conversion.</Text><View style={s.row}>{GRAPH2D_PUBLICATION_FORMATS.map(value => button(value === "html" ? "HTML report" : value.toUpperCase(), () => setFormat(value), busy, format === value))}</View>
    <Text>Capture attribution</Text><TextInput style={s.input} accessibilityLabel="Capture attribution" maxLength={256}
      value={attribution} editable={!busy} onChangeText={setAttribution} />
    <View style={s.row}>{button("Save publication", () => run(false), busy)}{button("Share publication", () => run(true), busy)}{busy && button("Cancel export", cancel)}</View>
    <View style={s.row}>{button("Save capture recipe JSON", () => run(false, true), busy)}{button("Share capture recipe JSON", () => run(true, true), busy)}</View>
    <Text accessibilityLiveRegion="polite">{message}</Text>
    {prepared && cache.current?.key === key && <><Text>Snapshot: {prepared.snapshotId}</Text>{prepared.metadata.warnings.map(warning => <Text key={warning}>• {warning}</Text>)}</>}
    <Text>CSV contains sampled points and analysis fields, not the raw dataset. PNG uses a compact numeric tick font; use SVG/report for scalable presentation.</Text>
  </View>;
}
const s = StyleSheet.create({ panel: { padding: 12, gap: 8 }, title: { fontSize: 18, fontWeight: "600" }, row: { flexDirection: "row", flexWrap: "wrap" },
  button: { minWidth: 44, minHeight: 44, padding: 10, borderRadius: 6, justifyContent: "center" }, selected: { backgroundColor: "#dbeafe" },
  input: { borderWidth: 1, borderColor: "#64748b", minHeight: 44, padding: 8, backgroundColor: "white" } });
