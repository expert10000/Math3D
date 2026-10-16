import { useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { graph2DConstructionHierarchy, graph2DClearConstructionActions, graph2DDerivedConstructionFromPoint, graph2DCurvatureConstructionFromPoint, graph2DOsculatingCircleConstructionFromPoint, graph2DPointConstructionFromProbe, GRAPH2D_MAX_CONSTRUCTIONS,
  graph2DPointDifferentialReadout, type Graph2DConstructionAction, type Graph2DConstructionArtifact, type Graph2DDocument,
  type Graph2DConstructionObject, type Graph2DResolvedConstruction,
  type Graph2DPointOnCurveConstruction } from "@math3d/core";

const Button = ({ label, text, disabled, onPress }: { label: string; text?: string; disabled?: boolean; onPress: () => void }) =>
  <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
    disabled={disabled} onPress={onPress} style={{ minHeight: 44, minWidth: 44, paddingVertical: 8, paddingHorizontal: 7 }}><Text>{text ?? label}</Text></Pressable>;

function PointCard({ document, object, resolved, onAction, onFitConstruction, children }: { document: Graph2DDocument; object: Graph2DPointOnCurveConstruction;
  resolved?: Graph2DResolvedConstruction; onAction: (action: Graph2DConstructionAction) => void;
  onFitConstruction?: (id: string) => void; children?: ReactNode }) {
  const [draft, setDraft] = useState(String(object.anchor.value));
  useEffect(() => setDraft(String(object.anchor.value)), [object.anchor.value]);
  const [error, setError] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const hasDependents = !!document.source.constructions?.objects.some(item => item.inputs.some(input =>
    input.kind === "construction" && input.objectId === object.id));
  const sourceLabel = document.source.objects.find(item => item.id === object.inputs[0]?.objectId)?.label ?? object.inputs[0]?.objectId;
  const full = (document.source.constructions?.objects.length ?? 0) >= GRAPH2D_MAX_CONSTRUCTIONS;
  const readout = graph2DPointDifferentialReadout(document, object, resolved);
  return <View style={{ borderTopWidth: 1, borderColor: "#cbd5e1", paddingVertical: 8 }}>
    <Text style={{ fontWeight: "700" }}>{object.label} — on {sourceLabel}</Text>
    <Text>{resolved?.state ?? "pending"} · {resolved?.confidence ?? "pending"}</Text>
    {resolved?.reason && <Text>{resolved.reason}</Text>}
    {readout && <View testID={`mobile-graph-point-readout-${object.id}`} style={{ marginVertical: 6 }}>
      <Text>Point ({readout.point.x.toPrecision(7)}, {readout.point.y.toPrecision(7)})</Text>
      <Text>Derivative {readout.derivative ? `(${readout.derivative.x.toPrecision(7)}, ${readout.derivative.y.toPrecision(7)})` : "unavailable"}</Text>
      <Text>Speed {readout.speed?.toPrecision(7) ?? "unavailable"} · curvature κ {readout.curvature?.toPrecision(7) ?? "unavailable"}</Text>
      <Text>{readout.method} · approximate, no certified error bound</Text>
    </View>}
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      <TextInput accessibilityLabel={`${object.anchor.parameter} for ${object.label}`} keyboardType="numeric" value={draft}
        onChangeText={setDraft} style={{ minHeight: 44, minWidth: 100, flex: 1, borderWidth: 1, borderColor: "#94a3b8", padding: 8 }} />
      <Button label={`Move ${object.label}`} text="Move" onPress={() => {
        const value = Number(draft);
        if (!draft.trim() || !Number.isFinite(value)) { setError("Enter a finite parameter."); return; }
        setError("");
        onAction({ type: "update", object: { ...object, anchor: { ...object.anchor, value } } });
      }} />
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      <Button label="Add tangent" text="Tangent" disabled={full} onPress={() => onAction({ type: "create", object: graph2DDerivedConstructionFromPoint(document, object.id, "tangent") })} />
      <Button label="Add normal" text="Normal" disabled={full} onPress={() => onAction({ type: "create", object: graph2DDerivedConstructionFromPoint(document, object.id, "normal") })} />
      <Button label="Add curvature" text="Curvature" disabled={full} onPress={() => onAction({ type: "create", object: graph2DCurvatureConstructionFromPoint(document, object.id) })} />
      <Button label="Add osculating circle" text="Osculating circle" disabled={full} onPress={() => onAction({ type: "create", object: graph2DOsculatingCircleConstructionFromPoint(document, object.id) })} />
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      <Button label={`Fit ${object.label}`} text="Fit point" disabled={!onFitConstruction || resolved?.state !== "ready"} onPress={() => onFitConstruction?.(object.id)} />
      <Button label={`More actions for ${object.label}`} text="More" onPress={() => setMoreOpen(value => !value)} />
    </View>
    {moreOpen && <Button label={`Delete ${object.label}`} disabled={hasDependents} onPress={() => onAction({ type: "delete", objectId: object.id })} />}
    {error && <Text accessibilityLiveRegion="polite">{error}</Text>}
    {moreOpen && hasDependents && <Text>Remove dependent constructions before deleting this point.</Text>}
    {children && <View style={{ marginLeft: 12, paddingLeft: 8, borderLeftWidth: 1, borderColor: "#cbd5e1" }}>{children}</View>}
  </View>;
}

function ConstructionCard({ document, object, resolved, onAction }: { document: Graph2DDocument; object: Graph2DConstructionObject;
  resolved?: Graph2DResolvedConstruction; onAction: (action: Graph2DConstructionAction) => void }) {
  return <View style={{ borderTopWidth: 1, borderColor: "#cbd5e1", paddingVertical: 8 }}>
    <Text>{object.label}: {object.kind} · {resolved?.state ?? "pending"} · {resolved?.confidence ?? "pending"}</Text>
    {object.inputs.length > 1 && <Text>Sources: {object.inputs.map(input =>
      document.source.objects.find(source => source.id === input.objectId)?.label ?? input.objectId).join(" + ")}</Text>}
    {object.kind === "curvature" && resolved?.measurement &&
      <Text testID="mobile-graph-saved-curvature">κ = {resolved.measurement.value.toPrecision(8)} · {resolved.measurement.method} · {resolved.measurement.convention} · no certified error bound</Text>}
    {object.kind === "osculating-circle" && resolved?.circle &&
      <Text testID="mobile-graph-saved-osculating-circle">Center ({resolved.circle.center.x.toPrecision(8)}, {resolved.circle.center.y.toPrecision(8)}) · radius {resolved.circle.radius.toPrecision(8)} · approximate · no certified error bound. The dashed circle and center marker may overlap the source curve; use Fit to inspect them.</Text>}
    {object.anchor && "interval" in object.anchor && <Text>Original x {object.anchor.seedX.toPrecision(7)} · match ±{object.anchor.matchRadius.toPrecision(3)} · scan [{object.anchor.interval.min.toPrecision(5)}, {object.anchor.interval.max.toPrecision(5)}] · {object.anchor.method} · residual {object.anchor.residual.toExponential(2)} · saved {object.anchor.confidence}</Text>}
    {resolved?.reason && <Text>{resolved.reason}</Text>}
    <Button label={`Delete ${object.label}`} onPress={() => onAction({ type: "delete", objectId: object.id })} />
  </View>;
}

export const MobileGraphConstructionsPanel = ({ document, artifact, onAction, onBatchAction, onFitConstruction }: { document: Graph2DDocument;
  artifact: Graph2DConstructionArtifact | null; onAction: (action: Graph2DConstructionAction) => void;
  onBatchAction: (actions: readonly Graph2DConstructionAction[]) => void; onFitConstruction?: (id: string) => void }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const objects = document.source.constructions?.objects ?? [];
  const hierarchy = graph2DConstructionHierarchy(document.source);
  const resolvedById = new Map(artifact?.objects.map(item => [item.id, item]) ?? []);
  const probe = document.selection.probe;
  const canPromote = !!probe && !!document.source.objects.find(item => item.id === probe.objectId &&
    ["explicit-cartesian", "parametric", "polar"].includes(item.kind));
  return <View testID="mobile-graph-constructions" accessibilityLabel="Constructions">
    <Text accessibilityRole="header">Constructions ({objects.length})</Text>
    <Button label="Save probe as point" disabled={!canPromote || !artifact || objects.length >= GRAPH2D_MAX_CONSTRUCTIONS}
      onPress={() => onAction({ type: "create", object: graph2DPointConstructionFromProbe(document,
        `Point ${objects.filter(item => item.kind === "point-on-curve").length + 1}`) })} />
    {objects.length > 0 && <Button label="More construction actions" text="More" onPress={() => setMoreOpen(value => !value)} />}
    {moreOpen && objects.length > 0 && <Button label="Clear all constructions" onPress={() => onBatchAction(graph2DClearConstructionActions(document))} />}
    {objects.length > 0 && <Text accessibilityLiveRegion="polite">{artifact ? artifact.truncated ? "Construction output limit reached." :
      `${artifact.objects.filter(item => item.state === "ready").length} ready, ${artifact.objects.filter(item => item.state === "unavailable").length} unavailable` :
      "Recomputing constructions…"}</Text>}
    {hierarchy.map(group => <View key={group.source.id} style={{ borderTopWidth: 1, borderColor: "#cbd5e1", paddingTop: 8, marginTop: 8 }}>
      <Text accessibilityRole="header" style={{ fontWeight: "700" }}>{group.source.label}</Text>
      <Text>{group.source.kind} · {group.roots.length} direct construction{group.roots.length === 1 ? "" : "s"}</Text>
      <View style={{ marginLeft: 12, paddingLeft: 8, borderLeftWidth: 1, borderColor: "#cbd5e1" }}>
        {group.roots.map(node => node.object.kind === "point-on-curve" ?
          <PointCard key={node.object.id} document={document} object={node.object}
            resolved={resolvedById.get(node.object.id)} onAction={onAction} onFitConstruction={onFitConstruction}>
            {node.children.map(child => <ConstructionCard key={child.object.id} document={document} object={child.object}
              resolved={resolvedById.get(child.object.id)} onAction={onAction} />)}
          </PointCard> : <ConstructionCard key={node.object.id} document={document} object={node.object}
            resolved={resolvedById.get(node.object.id)} onAction={onAction} />)}
      </View>
    </View>)}
    {objects.length >= GRAPH2D_MAX_CONSTRUCTIONS && <Text>Current safety budget: {GRAPH2D_MAX_CONSTRUCTIONS} constructions. Remove one to add another.</Text>}
  </View>;
};
