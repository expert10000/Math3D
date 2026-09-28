import React, { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import type { Graph2DDocument, Graph2DSampledSeries } from "@math3d/core";
import { MOBILE_GRAPH_QUALITY, mobileGraphSamplingDiagnostics, type MobileGraphQuality, type MobileGraphOverlays } from "./models/mobileGraphDisplay";
export const MobileGraphDisplayPanel = ({ document, series, overlays, onAxis, onQuality, onOverlays, lineCount }: {
  document: Graph2DDocument; series: readonly Graph2DSampledSeries[]; overlays: MobileGraphOverlays;
  onAxis: (key: "x" | "y" | "grid" | "labels") => void; onQuality: (quality: MobileGraphQuality) => void;
  onOverlays: (overlays: MobileGraphOverlays) => void; lineCount: number }) => {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const toggle = (label: string, value: boolean, onValueChange: () => void) => <View key={label} style={{ flexDirection: "row", alignItems: "center", minHeight: 44 }}>
    <Text style={{ flex: 1 }}>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onValueChange} /></View>;
  return <View testID="mobile-graph-display-controls"><Text>Display and quality</Text>
    {(["x", "y", "grid", "labels"] as const).map((key) => toggle(`${key} display`, document.display.axes[key], () => onAxis(key)))}
    <Text>Sampling quality (shared saved policy, capped on mobile)</Text>
    <View style={{ flexDirection: "row" }}>{(Object.keys(MOBILE_GRAPH_QUALITY) as MobileGraphQuality[]).map((quality) => <Pressable key={quality}
      accessibilityRole="radio" accessibilityLabel={`${quality} sampling`} accessibilityState={{ checked: document.display.sampling.maxSamples === MOBILE_GRAPH_QUALITY[quality].maxSamples }}
      style={{ minHeight: 44, minWidth: 44, padding: 10 }} onPress={() => onQuality(quality)}><Text>{quality}</Text></Pressable>)}</View>
    <Text>Result overlays (session only; run the matching analysis first)</Text>
    {(["tangent", "area", "features"] as const).map((key) => toggle(`${key} overlay`, overlays[key], () => onOverlays({ ...overlays, [key]: !overlays[key] })))}
    <Pressable accessibilityRole="button" accessibilityLabel="Sampling diagnostics" accessibilityState={{ expanded: diagnosticsOpen }}
      style={{ minHeight: 44, padding: 10 }} onPress={() => setDiagnosticsOpen(!diagnosticsOpen)}><Text>{diagnosticsOpen ? "Hide" : "Show"} sampling diagnostics</Text></Pressable>
    {diagnosticsOpen && <View><Text>Mobile limits: 2048 settled / 256 interaction samples; 4096 native line Views; 256 area strips; 128 markers.</Text>
      <Text>Rendered lines: {lineCount}{lineCount >= 4096 ? " · rendering budget reached, some geometry omitted" : ""}</Text>
      {mobileGraphSamplingDiagnostics(series).map((item) => <Text key={item.objectId}>{item.objectId}: {item.converged ? "converged" : "incomplete"} · {item.samples} evaluations · {item.messages.join(", ") || "no sampler diagnostics"}</Text>)}
      <Text>Approximate sampling is not proof of continuity or absence of features. Imported quality intent is retained until explicitly changed.</Text></View>}
  </View>;
};
