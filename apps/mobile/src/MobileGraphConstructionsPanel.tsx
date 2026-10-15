import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { graph2DClearConstructionActions, graph2DDerivedConstructionFromPoint, graph2DCurvatureConstructionFromPoint, graph2DOsculatingCircleConstructionFromPoint, graph2DPointConstructionFromProbe, GRAPH2D_MAX_CONSTRUCTIONS,
  type Graph2DConstructionAction, type Graph2DConstructionArtifact, type Graph2DDocument,
  type Graph2DPointOnCurveConstruction } from "@math3d/core";

const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) =>
  <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
    disabled={disabled} onPress={onPress} style={{ minHeight: 44, minWidth: 44, padding: 10 }}><Text>{label}</Text></Pressable>;

function PointCard({ document, object, state, confidence, reason, onAction }: { document: Graph2DDocument; object: Graph2DPointOnCurveConstruction;
  state: string; confidence?: string; reason?: string | null; onAction: (action: Graph2DConstructionAction) => void }) {
  const [draft, setDraft] = useState(String(object.anchor.value));
  useEffect(() => setDraft(String(object.anchor.value)), [object.anchor.value]);
  const [error, setError] = useState("");
  const hasDependents = !!document.source.constructions?.objects.some(item => item.inputs.some(input =>
    input.kind === "construction" && input.objectId === object.id));
  const sourceLabel = document.source.objects.find(item => item.id === object.inputs[0]?.objectId)?.label ?? object.inputs[0]?.objectId;
  const full = (document.source.constructions?.objects.length ?? 0) >= GRAPH2D_MAX_CONSTRUCTIONS;
  return <View style={{ borderTopWidth: 1, borderColor: "#cbd5e1", paddingVertical: 8 }}>
    <Text>{object.label} on {sourceLabel}: {object.anchor.parameter}={object.anchor.value.toPrecision(6)} · {state}{confidence ? ` · ${confidence}` : ""}</Text>
    {reason && <Text>{reason}</Text>}
    <Text>Moving this saved point updates its dependent constructions; the source graph stays in place.</Text>
    <TextInput accessibilityLabel={`${object.anchor.parameter} for ${object.label}`} keyboardType="numeric" value={draft}
      onChangeText={setDraft} style={{ minHeight: 44, borderWidth: 1, borderColor: "#94a3b8", padding: 8 }} />
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      <Button label={`Move ${object.label}`} onPress={() => {
        const value = Number(draft);
        if (!draft.trim() || !Number.isFinite(value)) { setError("Enter a finite parameter."); return; }
        setError("");
        onAction({ type: "update", object: { ...object, anchor: { ...object.anchor, value } } });
      }} />
      <Button label="Add tangent" disabled={full} onPress={() => onAction({ type: "create", object: graph2DDerivedConstructionFromPoint(document, object.id, "tangent") })} />
      <Button label="Add normal" disabled={full} onPress={() => onAction({ type: "create", object: graph2DDerivedConstructionFromPoint(document, object.id, "normal") })} />
      <Button label="Add curvature" disabled={full} onPress={() => onAction({ type: "create", object: graph2DCurvatureConstructionFromPoint(document, object.id) })} />
      <Button label="Add osculating circle" disabled={full} onPress={() => onAction({ type: "create", object: graph2DOsculatingCircleConstructionFromPoint(document, object.id) })} />
      <Button label={`Delete ${object.label}`} disabled={hasDependents} onPress={() => onAction({ type: "delete", objectId: object.id })} />
    </View>
    {error && <Text accessibilityLiveRegion="polite">{error}</Text>}
    {hasDependents && <Text>Remove dependent constructions before deleting this point.</Text>}
  </View>;
}

export const MobileGraphConstructionsPanel = ({ document, artifact, onAction, onBatchAction }: { document: Graph2DDocument;
  artifact: Graph2DConstructionArtifact | null; onAction: (action: Graph2DConstructionAction) => void;
  onBatchAction: (actions: readonly Graph2DConstructionAction[]) => void }) => {
  const objects = document.source.constructions?.objects ?? [];
  const probe = document.selection.probe;
  const canPromote = !!probe && !!document.source.objects.find(item => item.id === probe.objectId &&
    ["explicit-cartesian", "parametric", "polar"].includes(item.kind));
  return <View testID="mobile-graph-constructions" accessibilityLabel="Constructions">
    <Text accessibilityRole="header">Constructions ({objects.length}/{GRAPH2D_MAX_CONSTRUCTIONS})</Text>
    <Button label="Save probe as point" disabled={!canPromote || !artifact || objects.length >= GRAPH2D_MAX_CONSTRUCTIONS}
      onPress={() => onAction({ type: "create", object: graph2DPointConstructionFromProbe(document,
        `Point ${objects.filter(item => item.kind === "point-on-curve").length + 1}`) })} />
    {objects.length > 0 && <Button label="Clear all constructions" onPress={() => onBatchAction(graph2DClearConstructionActions(document))} />}
    {objects.length > 0 && <Text accessibilityLiveRegion="polite">{artifact ? artifact.truncated ? "Construction output limit reached." :
      `${artifact.objects.filter(item => item.state === "ready").length} ready, ${artifact.objects.filter(item => item.state === "unavailable").length} unavailable` :
      "Recomputing constructions…"}</Text>}
    {objects.map(object => object.kind === "point-on-curve" ?
      <PointCard key={object.id} document={document} object={object}
        state={artifact?.objects.find(item => item.id === object.id)?.state ?? "pending"}
        confidence={artifact?.objects.find(item => item.id === object.id)?.confidence}
        reason={artifact?.objects.find(item => item.id === object.id)?.reason} onAction={onAction} /> :
      <View key={object.id} style={{ borderTopWidth: 1, borderColor: "#cbd5e1", paddingVertical: 8 }}>
        <Text>{object.label}: {object.kind} · {artifact?.objects.find(item => item.id === object.id)?.state ?? "pending"} · {artifact?.objects.find(item => item.id === object.id)?.confidence ?? "pending"}</Text>
        {object.kind === "curvature" && artifact?.objects.find(item => item.id === object.id)?.measurement &&
          <Text testID="mobile-graph-saved-curvature">κ = {artifact.objects.find(item => item.id === object.id)!.measurement!.value.toPrecision(8)} · {artifact.objects.find(item => item.id === object.id)!.measurement!.method} · {artifact.objects.find(item => item.id === object.id)!.measurement!.convention} · no certified error bound</Text>}
        {object.kind === "osculating-circle" && artifact?.objects.find(item => item.id === object.id)?.circle &&
          <Text testID="mobile-graph-saved-osculating-circle">Center ({artifact.objects.find(item => item.id === object.id)!.circle!.center.x.toPrecision(8)}, {artifact.objects.find(item => item.id === object.id)!.circle!.center.y.toPrecision(8)}) · radius {artifact.objects.find(item => item.id === object.id)!.circle!.radius.toPrecision(8)} · approximate · no certified error bound. The dashed circle and center marker may overlap the source curve; use Fit to inspect them.</Text>}
        {object.anchor && "interval" in object.anchor && <Text>Original x {object.anchor.seedX.toPrecision(7)} · match ±{object.anchor.matchRadius.toPrecision(3)} · scan [{object.anchor.interval.min.toPrecision(5)}, {object.anchor.interval.max.toPrecision(5)}] · {object.anchor.method} · residual {object.anchor.residual.toExponential(2)} · saved {object.anchor.confidence}</Text>}
        {artifact?.objects.find(item => item.id === object.id)?.reason && <Text>{artifact.objects.find(item => item.id === object.id)?.reason}</Text>}
        <Button label={`Delete ${object.label}`} onPress={() => onAction({ type: "delete", objectId: object.id })} />
      </View>)}
  </View>;
};
