import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Graph2DDocument, Graph2DProbe } from "@math3d/core";
import { isMobileGraphAnalysisCurrent, type MobileGraphRegressionAnalysis, type MobileGraphAnalysisDraft, type MobileGraphAnalysisKind } from "./models/mobileGraphAnalysis";

const kinds: readonly [MobileGraphAnalysisKind, string][] = [["derivatives", "Derivatives"], ["tangent", "Tangent"],
  ["features", "Zeros, extrema, inflections"], ["integral", "Integral"], ["intersections", "Intersections"], ["arc-length", "Arc length"],
  ["regression-linear", "Linear regression"], ["regression-quadratic", "Quadratic regression"]];
export const MobileGraphAnalysisPanel = ({ document, draft, result, onDraft, onRun, onLocate }: {
  document: Graph2DDocument; draft: MobileGraphAnalysisDraft; result: MobileGraphRegressionAnalysis | null;
  onDraft: (draft: MobileGraphAnalysisDraft) => void; onRun: () => void; onLocate: (probe: Graph2DProbe) => void }) => {
  const current = result ? isMobileGraphAnalysisCurrent(result, document, draft) : false;
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [result?.regression?.resultId]);
  const regression = draft.kind.startsWith("regression-");
  const explicit = document.source.objects.filter((object) => object.kind === (regression ? "point-series" : "explicit-cartesian"));
  const pointOperation = draft.kind === "derivatives" || draft.kind === "tangent";
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button"
    accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress} style={s.button}><Text style={{ color: disabled ? "#94a3b8" : "#1d4ed8" }}>{label}</Text></Pressable>;
  const field = (label: string, key: "x" | "min" | "max" | "tolerance") => <View key={key}><Text>{label}</Text>
    <TextInput accessibilityLabel={label} value={draft[key]} maxLength={40} autoCapitalize="none" autoCorrect={false} style={s.input}
      onChangeText={(value) => onDraft({ ...draft, [key]: value })} /></View>;
  return <View testID="mobile-graph-analysis-panel"><Text style={s.title}>Analyze</Text>
    <View style={s.row}>{kinds.map(([kind, label]) => <Pressable key={kind} accessibilityRole="radio" accessibilityLabel={label}
      accessibilityState={{ checked: draft.kind === kind }} style={s.button} onPress={() => onDraft({ ...draft, kind })}><Text>{label}</Text></Pressable>)}</View>
    <Text>Source function</Text><View style={s.row}>{explicit.map((object) => <Pressable key={object.id} accessibilityRole="radio"
      accessibilityState={{ checked: draft.objectId === object.id }} accessibilityLabel={`Analyze ${object.label}`} style={s.button}
      onPress={() => onDraft({ ...draft, objectId: object.id })}><Text>{object.label}</Text></Pressable>)}</View>
    {draft.kind === "intersections" && <><Text>Second function (one pair only)</Text><View style={s.row}>{explicit.filter((object) => object.id !== draft.objectId).map((object) =>
      button(`Intersect with ${object.label}${draft.secondId === object.id ? " (selected)" : ""}`, () => onDraft({ ...draft, secondId: object.id })))}</View></>}
    {regression ? <Text>Fits original checked rows within the authored domain, not the viewport. No missing-value imputation.</Text> : pointOperation ? <>{field("Analysis x", "x")}{button("Use current probe x", () => onDraft({ ...draft,
      objectId: document.selection.probe!.objectId, x: String(document.selection.probe!.x) }), !document.selection.probe)}</> :
      <>{field("Analysis from x", "min")}{field("Analysis to x", "max")}</>}
    {(["derivatives", "integral", "arc-length"] as string[]).includes(draft.kind) ? field("Analysis tolerance", "tolerance") :
      <Text>Uses shared core per-operation tolerances, shown below.</Text>}
    {draft.kind === "integral" && <View style={s.row}>{(["signed", "absolute"] as const).map((mode) => button(`${mode} area${draft.mode === mode ? " (selected)" : ""}`, () => onDraft({ ...draft, mode })))}</View>}
    {button("Run analysis", onRun, !explicit.some((object) => object.id === draft.objectId))}
    <Text>Approximate, bounded calculations. Error estimates are not certified. No automatic all-function calculations.</Text>
    {result && <View style={s.card} testID="mobile-graph-analysis-results"><Text accessibilityLiveRegion="polite" style={s.title}>
      {current ? "Current result" : "Stale result — inputs or source changed; run again"}</Text>
      {result.rows.map((row, index) => <View key={index} style={s.card}><Text>{row.label}</Text><Text>{row.detail}</Text>
        {row.probe && button(`Locate ${row.label}`, () => onLocate(row.probe!), !current)}</View>)}
      {result.regression && <View><Text>Residual rows {offset + 1}–{Math.min(offset + 40, result.regression.n)}</Text>
        {result.regression.residuals.slice(offset, offset + 40).map(row => <Text key={row.rowId}>{row.rowId}: x={row.x.toPrecision(5)}, y={row.observed.toPrecision(5)}, fit={row.fitted.toPrecision(5)}, residual={row.residual.toPrecision(5)}</Text>)}
        {button("Previous residuals", () => setOffset(Math.max(0, offset - 40)), !offset)}{button("Next residuals", () => setOffset(offset + 40), offset + 40 >= result.regression.n)}</View>}
      {result.publications.map((publication) => <View key={publication.resultId} style={s.card}>
        <Text>{publication.status} · {publication.provenance.operation.algorithm} v{publication.provenance.operation.algorithmVersion}</Text>
        <Text>Source revision {publication.provenance.source.revision} · tolerance {JSON.stringify(publication.provenance.numericContext?.tolerance ?? "operation residual rules")}</Text>
        <Text selectable>Source: {publication.provenance.source.documentId}</Text><Text selectable>{publication.provenance.source.structuralHash}</Text>
        {publication.warnings.map((warning, i) => <Text key={`w${i}`}>{warning}</Text>)}
        {publication.diagnostics.map((diagnostic, i) => <Text key={`d${i}`}>{diagnostic.severity}: {diagnostic.message}</Text>)}
      </View>)}
    </View>}
  </View>;
};
const s = StyleSheet.create({ title: { fontSize: 16, fontWeight: "600" }, row: { flexDirection: "row", flexWrap: "wrap" },
  card: { paddingVertical: 8, borderTopWidth: 1, borderColor: "#cbd5e1" }, button: { minHeight: 44, minWidth: 44, padding: 10, justifyContent: "center" },
  input: { minHeight: 44, borderWidth: 1, borderColor: "#94a3b8", padding: 8, backgroundColor: "white" } });
