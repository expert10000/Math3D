import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GRAPH2D_TOOLS, graph2DToolUnavailable, type Graph2DDocument, type Graph2DTool } from "@math3d/core";
export function MobileGraphToolsPanel({ document, rowsAvailable, onTool, onClose }: {
  document: Graph2DDocument; rowsAvailable: boolean; onTool: (tool: Graph2DTool) => void; onClose: () => void;
}) {
  return <View testID="mobile-graph-tools"><Text accessibilityRole="header">Tools</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Close graph tools" style={s.button} onPress={onClose}><Text>Close</Text></Pressable>
    <View style={s.grid}>{GRAPH2D_TOOLS.map(tool => { const reason = graph2DToolUnavailable(document, tool.id, rowsAvailable);
      return <View key={tool.id} style={s.item}><Pressable accessibilityRole="button" accessibilityLabel={tool.label}
        accessibilityState={{ disabled: !!reason }} disabled={!!reason} style={s.button} onPress={() => onTool(tool.id)}><Text>{tool.label}</Text></Pressable>
        <Text>{reason ?? tool.hint}</Text></View>;
    })}</View></View>;
}
const s = StyleSheet.create({ grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, item: { width: "47%" },
  button: { minHeight: 44, minWidth: 44, padding: 10, justifyContent: "center", borderWidth: 1, borderColor: "#94a3b8", borderRadius: 8 } });
