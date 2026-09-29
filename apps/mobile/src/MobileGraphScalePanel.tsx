import React, { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { graph2DScaleFields, graph2DViewportFromScaleFields, GRAPH2D_SCALE_GUIDANCE, type Graph2DDocument, type Graph2DViewport } from "@math3d/core";
export function MobileGraphScalePanel({ document, onCommit }: { document: Graph2DDocument; onCommit: (v: Graph2DViewport) => void }) {
  const [fields, setFields] = useState(() => graph2DScaleFields(document.display.viewport)), [error, setError] = useState("");
  return <View accessibilityLabel="Axis scales"><Text>Axis scales and bounds</Text><Text>{GRAPH2D_SCALE_GUIDANCE}</Text>
    {(["xScale", "yScale"] as const).map(key => <View key={key}><Text>{key === "xScale" ? "X scale" : "Y scale"}</Text>
      {(["linear", "log10"] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${key} ${value}`}
        accessibilityState={{ checked: fields[key] === value }} style={{ minHeight: 44, padding: 10 }} onPress={() => setFields({ ...fields, [key]: value })}><Text>{value}</Text></Pressable>)}</View>)}
    {(["free", "equal"] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`Axis aspect ${value}`}
      accessibilityState={{ checked: fields.aspect === value }} style={{ minHeight: 44, padding: 10 }} onPress={() => setFields({ ...fields, aspect: value })}><Text>{value} axes</Text></Pressable>)}
    {(["xMin", "xMax", "yMin", "yMax"] as const).map(key => <View key={key}><Text>Axis {key}</Text><TextInput accessibilityLabel={`Axis ${key}`}
      style={{ minHeight: 44, borderWidth: 1, padding: 8 }} value={fields[key]} onChangeText={text => setFields({ ...fields, [key]: text })} /></View>)}
    <Pressable accessibilityRole="button" style={{ minHeight: 44, padding: 10 }} onPress={() => { try { onCommit(graph2DViewportFromScaleFields(document, fields)); setError(""); } catch (caught) { setError((caught as Error).message); } }}><Text>Apply scales and bounds</Text></Pressable>
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
  </View>;
}
