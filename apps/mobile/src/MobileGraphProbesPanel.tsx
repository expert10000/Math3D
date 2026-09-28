import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { GRAPH2D_MAX_PINNED_PROBES, type Graph2DDocument } from "@math3d/core";
import { compareMobileGraphProbes, type MobileGraphProbeAction } from "./models/mobileGraphProbes";

export const MobileGraphProbesPanel = ({ document, onAction, onLocate }: { document: Graph2DDocument;
  onAction: (action: MobileGraphProbeAction) => void; onLocate: (id: string) => void }) => {
  const [label, setLabel] = useState("Probe");
  const [labels, setLabels] = useState<Record<string, string>>({});
  const probes = document.display.pinnedProbes ?? [];
  const button = (text: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button"
    accessibilityLabel={text} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={s.button}><Text>{text}</Text></Pressable>;
  return <View testID="mobile-graph-pinned-probes"><Text>Saved probes ({probes.length}/{GRAPH2D_MAX_PINNED_PROBES})</Text>
    <TextInput accessibilityLabel="New probe label" value={label} onChangeText={setLabel} maxLength={80} style={s.input} />
    {button("Pin current probe", () => onAction({ type: "pin", label }), !document.selection.probe || probes.length >= GRAPH2D_MAX_PINNED_PROBES)}
    <Text accessibilityLiveRegion="polite">{compareMobileGraphProbes(document)}</Text>
    {probes.map((probe, index) => <View key={probe.id} style={s.card}>
      <Text accessibilityLabel={`${probe.label}, ${document.source.objects.find((object) => object.id === probe.objectId)?.label}, x ${probe.x}, y ${probe.y}`}>
        {index + 1}. {probe.label}: ({probe.x.toPrecision(6)}, {probe.y.toPrecision(6)}) · {probe.sourceHash === document.identity.structuralHash ? "current" : "stale"}</Text>
      <TextInput accessibilityLabel={`Label for ${probe.label}`} value={labels[probe.id] ?? probe.label} maxLength={80}
        onChangeText={(value) => setLabels({ ...labels, [probe.id]: value })} style={s.input} />
      <View style={s.row}>{button(`Rename ${probe.label}`, () => onAction({ type: "rename", id: probe.id, label: labels[probe.id] ?? probe.label }))}
        {button(`Locate ${probe.label}`, () => onLocate(probe.id), probe.sourceHash !== document.identity.structuralHash)}
        {button(`Move ${probe.label} up`, () => onAction({ type: "reorder", id: probe.id, toIndex: index - 1 }), index === 0)}
        {button(`Move ${probe.label} down`, () => onAction({ type: "reorder", id: probe.id, toIndex: index + 1 }), index === probes.length - 1)}
        {button(`Delete ${probe.label}`, () => onAction({ type: "delete", id: probe.id }))}</View>
    </View>)}
  </View>;
};
const s = StyleSheet.create({ button: { minHeight: 44, minWidth: 44, padding: 10, justifyContent: "center" },
  input: { minHeight: 44, borderWidth: 1, borderColor: "#94a3b8", padding: 8, backgroundColor: "white" },
  card: { marginVertical: 8, borderTopWidth: 1, borderColor: "#cbd5e1", paddingTop: 8 }, row: { flexDirection: "row", flexWrap: "wrap" } });
