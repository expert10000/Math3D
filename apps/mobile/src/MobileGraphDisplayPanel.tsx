import React, { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import type { Graph2DDocument, Graph2DSampledSeries, Graph2DViewport } from "@math3d/core";
import { MobileGraphScalePanel } from "./MobileGraphScalePanel";
import { MOBILE_GRAPH_QUALITY, mobileGraphSamplingDiagnostics, type MobileGraphQuality, type MobileGraphOverlays } from "./models/mobileGraphDisplay";
import type { MobileGraphSamplingStatus } from "./useMobileGraphSampling";
export const MobileGraphDisplayPanel = ({ document, series, overlays, onAxis, onQuality, onOverlays, onViewport, lineCount, sampling }: {
  document: Graph2DDocument; series: readonly Graph2DSampledSeries[]; overlays: MobileGraphOverlays;
  onAxis: (key: "x" | "y" | "grid" | "labels") => void; onQuality: (quality: MobileGraphQuality) => void;
  onViewport: (viewport: Graph2DViewport) => void;
  onOverlays: (overlays: MobileGraphOverlays) => void; lineCount: number; sampling: MobileGraphSamplingStatus }) => {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const toggle = (label: string, value: boolean, onValueChange: () => void) => <View key={label} style={{ flexDirection: "row", alignItems: "center", minHeight: 44 }}>
    <Text style={{ flex: 1 }}>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onValueChange} /></View>;
  return <View testID="mobile-graph-display-controls"><Text>Display and quality</Text>
    {(["x", "y", "grid", "labels"] as const).map((key) => toggle(`${key} display`, document.display.axes[key], () => onAxis(key)))}
    {toggle("Show continuation", document.display.viewport.continuation ?? false, () => onViewport({ ...document.display.viewport, continuation: !document.display.viewport.continuation }))}
    <MobileGraphScalePanel key={document.identity.id} document={document} onCommit={onViewport} />
    <Text>Sampling quality (shared saved policy, capped on mobile)</Text>
    <View style={{ flexDirection: "row" }}>{(Object.keys(MOBILE_GRAPH_QUALITY) as MobileGraphQuality[]).map((quality) => <Pressable key={quality}
      accessibilityRole="radio" accessibilityLabel={`${quality} sampling`} accessibilityState={{ checked: document.display.sampling.maxSamples === MOBILE_GRAPH_QUALITY[quality].maxSamples }}
      style={{ minHeight: 44, minWidth: 44, padding: 10 }} onPress={() => onQuality(quality)}><Text>{quality}</Text></Pressable>)}</View>
    <Text>Result overlays (session only; run the matching analysis first)</Text>
    {(["tangent", "area", "features"] as const).map((key) => toggle(`${key} overlay`, overlays[key], () => onOverlays({ ...overlays, [key]: !overlays[key] })))}
    <Pressable accessibilityRole="button" accessibilityLabel="Sampling diagnostics" accessibilityState={{ expanded: diagnosticsOpen }}
      style={{ minHeight: 44, padding: 10 }} onPress={() => setDiagnosticsOpen(!diagnosticsOpen)}><Text>{diagnosticsOpen ? "Hide" : "Show"} sampling diagnostics</Text></Pressable>
    {diagnosticsOpen && <View><Text>{sampling.budget.tier} profile · {sampling.phase} · {sampling.budget.sampling.maxSamples} samples · cooperative {sampling.budget.cpuMs} ms deadline</Text>
      <Text>Limits: {sampling.budget.lines} native lines; {sampling.budget.fills} fills per layer; {sampling.budget.markers} markers per layer; {sampling.budget.artifactBytes / 1024} KiB serialized sampling artifacts; 4 MiB point-table cache.</Text>
      <Text>Measured sampling: {sampling.metrics.samplingMs.toFixed(1)} ms; next-frame delivery: {sampling.metrics.frameDelayMs.toFixed(1)} ms; retained serialized artifacts: {sampling.metrics.bytes} bytes.</Text>
      <Text>{sampling.performanceState.reason}</Text>
      <Text>These are policy limits, not measured heap usage or hardware certification. No device thermal sensor is read.</Text>
      <Pressable accessibilityRole="button" style={{ minHeight: 44, padding: 10 }} onPress={sampling.reduce}><Text>Reduce workload</Text></Pressable>
      <Pressable accessibilityRole="button" style={{ minHeight: 44, padding: 10 }} onPress={sampling.resume}><Text>Resume adaptive workload</Text></Pressable>
      <Text>Rendered lines: {lineCount}{lineCount >= sampling.budget.lines ? " · rendering budget reached, some geometry omitted" : ""}</Text>
      {mobileGraphSamplingDiagnostics(series).map((item) => <Text key={item.objectId}>{item.objectId}: {item.converged ? "converged" : "incomplete"} · {item.samples} evaluations · {item.messages.join(", ") || "no sampler diagnostics"}</Text>)}
      <Text>Approximate sampling is not proof of continuity or absence of features. Imported quality intent is retained until explicitly changed.</Text></View>}
  </View>;
};
