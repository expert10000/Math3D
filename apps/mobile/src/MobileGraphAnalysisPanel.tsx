import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { graph2DConstructionFromCandidate, GRAPH2D_MAX_CONSTRUCTIONS,
  type Graph2DConstructionObject, type Graph2DDocument, type Graph2DProbe } from "@math3d/core";
import { isMobileGraphAnalysisCurrent, type MobileGraphRegressionAnalysis, type MobileGraphAnalysisDraft, type MobileGraphAnalysisKind } from "./models/mobileGraphAnalysis";

const kinds: readonly [MobileGraphAnalysisKind, string][] = [["derivatives", "Derivatives"], ["tangent", "Tangent & curvature"],
  ["features", "Zeros, extrema, inflections"], ["integral", "Integral"], ["intersections", "Intersections"], ["arc-length", "Arc length"],
  ["polar-area", "Polar swept area"], ["polar-arc-length", "Polar arc length"], ["polar-tangent", "Polar tangent & curvature"],
  ["parametric-tangent", "Parametric tangent & curvature"],
  ["regression-linear", "Linear regression"], ["regression-quadratic", "Quadratic regression"],
  ["regression-cubic", "Cubic regression"], ["regression-quartic", "Quartic regression"],
  ["regression-spline", "Cubic smoothing spline"], ["regression-exponential", "Exponential decay"],
  ["regression-logistic", "Logistic growth"], ["fourier", "Fourier spectrum"]];
const firstPolarAngle = (source: Extract<Graph2DDocument["source"]["objects"][number], { kind: "polar" }>) =>
  source.domain.includeMin ? source.domain.min : (source.domain.min + source.domain.max) / 2;
const firstParametricParameter = (source: Extract<Graph2DDocument["source"]["objects"][number], { kind: "parametric" }>) =>
  source.domain.includeMin ? source.domain.min : (source.domain.min + source.domain.max) / 2;
export const MobileGraphAnalysisPanel = ({ document, draft, result, pending, onDraft, onRun, onCancel, onLocate, onSaveCandidate, onSaveTangent }: {
  document: Graph2DDocument; draft: MobileGraphAnalysisDraft; result: MobileGraphRegressionAnalysis | null;
  pending?: number | null; onDraft: (draft: MobileGraphAnalysisDraft) => void; onRun: () => void; onCancel?: () => void;
  onLocate: (probe: Graph2DProbe) => void;
  onSaveCandidate: (object: Graph2DConstructionObject) => void;
  onSaveTangent: (probe: Graph2DProbe) => void }) => {
  const current = result ? isMobileGraphAnalysisCurrent(result, document, draft) : false;
  const tangentResult = current && result && (result.kind === "tangent" || result.kind === "polar-tangent" || result.kind === "parametric-tangent");
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [result?.regression?.resultId]);
  const regression = draft.kind.startsWith("regression-");
  const polarOperation = draft.kind.startsWith("polar-");
  const pointOperation = draft.kind === "derivatives" || draft.kind === "tangent" || draft.kind === "polar-tangent" || draft.kind === "parametric-tangent";
  const sources = document.source.objects.filter((object) => object.kind === (regression || draft.kind === "fourier" ? "point-series" : polarOperation ? "polar" :
    draft.kind === "parametric-tangent" ? "parametric" : "explicit-cartesian"));
  const chooseKind = (kind: MobileGraphAnalysisKind) => {
    const targetKind = kind.startsWith("regression-") || kind === "fourier" ? "point-series" : kind.startsWith("polar-") ? "polar" :
      kind === "parametric-tangent" ? "parametric" : "explicit-cartesian";
    const source = document.source.objects.find(object => object.id === draft.objectId && object.kind === targetKind) ??
      document.source.objects.find(object => object.kind === targetKind);
    onDraft({ ...draft, kind, objectId: source?.id ?? "",
      x: kind === "polar-tangent" ? String(document.selection.probe?.objectId === source?.id ?
        document.selection.probe?.parameter ?? (source?.kind === "polar" ? firstPolarAngle(source) : 0) :
        source?.kind === "polar" ? firstPolarAngle(source) : 0) :
        kind === "parametric-tangent" ? String(document.selection.probe?.objectId === source?.id ?
          document.selection.probe?.parameter ?? (source?.kind === "parametric" ? firstParametricParameter(source) : 0) :
          source?.kind === "parametric" ? firstParametricParameter(source) : 0) : draft.x,
      min: source?.kind === "polar" ? String(source.domain.min) : draft.min,
      max: source?.kind === "polar" ? String(source.domain.max) : draft.max,
      midpoint: kind === "regression-logistic" && source?.kind === "point-series" ?
        String((source.domain.min + source.domain.max) / 2) : draft.midpoint,
      rate: kind === "regression-logistic" && source?.kind === "point-series" ?
        String(4 / (source.domain.max - source.domain.min)) : draft.rate });
  };
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button"
    accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress} style={s.button}><Text style={{ color: disabled ? "#94a3b8" : "#1d4ed8" }}>{label}</Text></Pressable>;
  const field = (label: string, key: "x" | "min" | "max" | "tolerance" | "smoothing" | "amplitude" | "rate" | "capacity" | "midpoint" | "xUnit") => <View key={key}><Text>{label}</Text>
    <TextInput accessibilityLabel={label} value={draft[key] ?? "0.001"} maxLength={40} autoCapitalize="none" autoCorrect={false} style={s.input}
      onChangeText={(value) => onDraft({ ...draft, [key]: value })} /></View>;
  return <View testID="mobile-graph-analysis-panel"><Text style={s.title}>Analyze</Text>
    {tangentResult && <View style={s.card} testID="mobile-graph-tangent-summary" accessibilityLiveRegion="polite">
      <Text style={s.title}>{result.rows[0]?.label}</Text>
      <Text>{result.rows[1]?.label}</Text>
      <Text>{result.rows[2]?.label}</Text>
      {button("Save tangent as construction", () => onSaveTangent(result.rows[0]!.probe!),
        !result.rows[0]?.probe || !result.overlays.length ||
        (document.source.constructions?.objects.length ?? 0) > GRAPH2D_MAX_CONSTRUCTIONS - 2)}
      <Text>Saved tangent and point recompute from the source; line direction is approximate.</Text>
    </View>}
    <View style={s.row}>{kinds.map(([kind, label]) => <Pressable key={kind} accessibilityRole="radio" accessibilityLabel={label}
      accessibilityState={{ checked: draft.kind === kind }} style={s.button} onPress={() => chooseKind(kind)}><Text>{label}</Text></Pressable>)}</View>
    <Text>{polarOperation ? "Polar curve" : draft.kind === "parametric-tangent" ? "Parametric curve" : regression ? "Point series" : "Source function"}</Text><View style={s.row}>{sources.map((object) => <Pressable key={object.id} accessibilityRole="radio"
      accessibilityState={{ checked: draft.objectId === object.id }} accessibilityLabel={`Analyze ${object.label}`} style={s.button}
      onPress={() => onDraft({ ...draft, objectId: object.id,
        x: draft.kind === "polar-tangent" && object.kind === "polar" ? String(firstPolarAngle(object)) : draft.x,
        ...(draft.kind === "parametric-tangent" && object.kind === "parametric" ? { x: String(firstParametricParameter(object)) } : {}),
        min: object.kind === "polar" ? String(object.domain.min) : draft.min,
        max: object.kind === "polar" ? String(object.domain.max) : draft.max })}><Text>{object.label}</Text></Pressable>)}</View>
    {draft.kind === "intersections" && <><Text>Second function (one pair only)</Text><View style={s.row}>{sources.filter((object) => object.id !== draft.objectId).map((object) =>
      button(`Intersect with ${object.label}${draft.secondId === object.id ? " (selected)" : ""}`, () => onDraft({ ...draft, secondId: object.id })))}</View></>}
    {draft.kind === "fourier" ? <><Text>Uses complete, uniformly spaced, original checked rows. No automatic resampling.</Text>
      {field("X unit", "xUnit")}
      <View style={s.row}>{(["rectangular", "hann"] as const).map(value =>
        button(`${value} window${draft.fourierWindow === value ? " (selected)" : ""}`, () => onDraft({ ...draft, fourierWindow: value })))}</View>
      <View style={s.row}>{(["peak", "rms"] as const).map(value =>
        button(`${value} amplitude${draft.fourierNormalization === value ? " (selected)" : ""}`, () => onDraft({ ...draft, fourierNormalization: value })))}</View>
      <View style={s.row}>{(["mean", "none"] as const).map(value =>
        button(`${value} detrend${draft.fourierDetrend === value ? " (selected)" : ""}`, () => onDraft({ ...draft, fourierDetrend: value })))}</View>
      <Text>One-sided amplitude/phase spectrum. Zero padding does not improve physical resolution; phase near zero amplitude is unstable.</Text></> : regression ? <><Text>Fits original checked rows within the authored domain, not the viewport. No missing-value imputation.</Text>
      {draft.kind === "regression-spline" && field("Spline smoothness λ (0–1)", "smoothing")}
      {draft.kind === "regression-exponential" && <>{field("Initial amplitude", "amplitude")}{field("Initial rate per x unit", "rate")}
        <Text>y = amplitude × exp(−rate × (x−smallest included x)); zero baseline. Rate is bounded by the x span.</Text></>}
      {draft.kind === "regression-logistic" && <>{field("Initial capacity", "capacity")}{field("Initial growth rate per x unit", "rate")}
        {field("Initial midpoint x", "midpoint")}
        <Text>y = capacity / (1 + exp(−rate × (x−midpoint))); positive capacity, bounded rate and midpoint inside the observed x extent.</Text></>}</> : pointOperation ? <>{field(draft.kind === "polar-tangent" ? "Angle θ (radians)" : draft.kind === "parametric-tangent" ? "Parameter t" : "Analysis x", "x")}{button(draft.kind === "polar-tangent" ? "Use current probe angle" : draft.kind === "parametric-tangent" ? "Use current probe parameter" : "Use current probe x", () => onDraft({ ...draft,
      objectId: document.selection.probe!.objectId, x: String(draft.kind === "polar-tangent" || draft.kind === "parametric-tangent" ? document.selection.probe!.parameter : document.selection.probe!.x) }), !document.selection.probe ||
      (draft.kind === "polar-tangent" || draft.kind === "parametric-tangent") && document.selection.probe.parameter === undefined ||
      !sources.some(object => object.id === document.selection.probe?.objectId))}</> :
      <>{field(polarOperation ? "Angle from θ (radians)" : "Analysis from x", "min")}
        {field(polarOperation ? "Angle to θ (radians)" : "Analysis to x", "max")}</>}
    {(["derivatives", "integral", "arc-length", "polar-area", "polar-arc-length"] as string[]).includes(draft.kind) ? field("Analysis tolerance", "tolerance") :
      draft.kind === "fourier" ? <Text>Uniform spacing and units are checked; irregular or missing samples are rejected.</Text> :
      regression ? <Text>{draft.kind === "regression-spline" ? "λ controls the fixed spline penalty. No confidence or prediction intervals." :
        draft.kind === "regression-exponential" || draft.kind === "regression-logistic" ? "Bounded local solver; no global guarantee or parameter uncertainty is claimed." :
        "Polynomial fit uses shared core uncertainty rules."}</Text> :
      <Text>Uses shared core per-operation tolerances, shown below.</Text>}
    {draft.kind === "integral" && <View style={s.row}>{(["signed", "absolute"] as const).map((mode) => button(`${mode} area${draft.mode === mode ? " (selected)" : ""}`, () => onDraft({ ...draft, mode })))}</View>}
    {polarOperation && <Text>Angles are in radians. Swept area counts repeated traversal.</Text>}
    <View style={s.row}>{button("Run analysis", onRun, pending !== null && pending !== undefined || !sources.some((object) => object.id === draft.objectId))}
      {pending !== null && pending !== undefined && button("Cancel fit", () => onCancel?.())}</View>
    {pending !== null && pending !== undefined && <Text accessibilityLiveRegion="polite">Fitting checked point series… {Math.round(pending * 100)}%</Text>}
    <Text>Approximate, bounded calculations. Error estimates are not certified. No automatic all-function calculations.</Text>
    {result && <View style={s.card} testID="mobile-graph-analysis-results"><Text accessibilityLiveRegion="polite" style={s.title}>
      {current ? "Current result" : "Stale result — inputs or source changed; run again"}</Text>
      {result.rows.map((row, index) => <View key={index} style={s.card}><Text>{row.label}</Text><Text>{row.detail}</Text>
        {row.probe && button(`Locate ${row.label}`, () => onLocate(row.probe!), !current)}
        {row.candidate && (!("kind" in row.candidate) || row.candidate.kind !== "inflection") && result.candidateAnalysis &&
          button(`Save ${row.label} as construction`, () => onSaveCandidate(graph2DConstructionFromCandidate(
            document, result.candidateAnalysis!, row.candidate!)), !current || result.candidateAnalysis.status !== "complete" ||
            (document.source.constructions?.objects.length ?? 0) >= GRAPH2D_MAX_CONSTRUCTIONS)}</View>)}
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
