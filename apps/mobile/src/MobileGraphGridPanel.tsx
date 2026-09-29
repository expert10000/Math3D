import React, { useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { graph2DGridFields, graph2DAxesFromGridFields, type Graph2DDocument, type Graph2DGridFields } from "@math3d/core";
export function MobileGraphGridPanel({ document, onCommit }: { document: Graph2DDocument; onCommit: (axes: Graph2DDocument["display"]["axes"]) => void }) {
  const [fields, setFields] = useState(() => graph2DGridFields(document)), [error, setError] = useState(""), [open, setOpen] = useState(false);
  const polar = document.display.axes.gridMode === "polar";
  const update = <K extends keyof Graph2DGridFields>(key: K, value: Graph2DGridFields[K]) => setFields(f => ({ ...f, [key]: value }));
  return <View testID="mobile-graph-grid-settings"><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }}
    style={{ minHeight: 44, padding: 10 }} onPress={() => { setFields(graph2DGridFields(document)); setError(""); setOpen(!open); }}><Text>Grid settings</Text></Pressable>
    {open && <View><Text>Display only: formulas and authored ranges stay unchanged. Visibility switches above apply immediately.</Text>
      <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center" }}><Text style={{ flex: 1 }}>Minor subdivisions</Text>
        <Switch accessibilityLabel="Show minor subdivisions" value={fields.minor} onValueChange={v => update("minor", v)} /></View>
      {(["density", "contrast"] as const).map(key => <View key={key}><Text>Grid {key}</Text>
        {(key === "density" ? ["sparse", "normal", "dense"] : ["subtle", "normal", "strong"]).map(value => <Pressable key={value}
          accessibilityRole="radio" accessibilityLabel={`Grid ${key} ${value}`} accessibilityState={{ checked: fields[key] === value }}
          style={{ minHeight: 44, padding: 10 }} onPress={() => update(key, value as Graph2DGridFields[typeof key])}><Text>{value}</Text></Pressable>)}</View>)}
      {(["x", "y"] as const).map(axis => <View key={axis}><Text>{axis.toUpperCase()} spacing ({document.display.viewport[`${axis}Scale`] === "log10" ? "integer decades" : "world units"})</Text>
        <TextInput accessibilityLabel={`${axis.toUpperCase()} grid spacing`} editable={!polar} placeholder="Auto" value={fields[`${axis}Step`]}
          style={{ minHeight: 44, padding: 8, borderWidth: 1 }} onChangeText={v => update(`${axis}Step`, v)} /></View>)}
      <Text>Blank means Auto; density controls Auto spacing. Log spacing is integer decades (1–100). Polar grids use Auto rings and rays. Dense or unresolved lines are omitted with a notice.</Text>
      <Pressable accessibilityRole="button" style={{ minHeight: 44, padding: 10 }} onPress={() => { try {
        // Preserve immediately applied visibility changes while this advanced draft was open.
        onCommit(graph2DAxesFromGridFields(document, { ...fields, x: document.display.axes.x, y: document.display.axes.y, grid: document.display.axes.grid, labels: document.display.axes.labels })); setError("");
      } catch (caught) { setError((caught as Error).message); } }}><Text>Apply grid settings</Text></Pressable>
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    </View>}
  </View>;
}
