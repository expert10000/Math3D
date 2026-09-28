import React from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { previewGraph2DPointImport } from "@math3d/core";
import type { MobileGraphAdvancedEditor as Editor } from "./models/mobileGraphAdvancedAuthoring";

export const MobileGraphAdvancedEditor = ({ editor, onEditor, onApply, onPick }: { editor: Editor;
  onEditor: (editor: Editor | null) => void; onApply: () => void; onPick: () => void }) => {
  const d = editor.draft, change = (patch: Partial<Editor["draft"]>) => onEditor({ ...editor, draft: { ...d, ...patch } });
  const button = (label: string, action: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button"
    accessibilityLabel={label} disabled={disabled} style={{ minHeight: 44, padding: 10 }} onPress={action}><Text style={{ color: disabled ? "#94a3b8" : "#1d4ed8" }}>{label}</Text></Pressable>;
  const input = (label: string, value: string, update: (text: string) => void, multiline = false, maxLength = 2048) => <View key={label}>
    <Text>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={update} multiline={multiline}
      autoCapitalize="none" autoCorrect={false} maxLength={maxLength} style={{ minHeight: 44, borderWidth: 1, borderColor: "#94a3b8", padding: 8, backgroundColor: "white" }} /></View>;
  const field = (label: string, key: "label" | "expression" | "second" | "min" | "max" | "yMin" | "yMax" | "color" | "width") => input(label, d[key], (text) => change({ [key]: text }));
  const toggle = (label: string, value: boolean, update: (value: boolean) => void) => <View key={label} style={{ flexDirection: "row", alignItems: "center" }}><Text>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={update} /></View>;
  const preview = editor.kind === "point-series" && d.data.trim() ? previewGraph2DPointImport(d.data) : null;
  return <View testID="mobile-graph-kind-editor"><Text>{editor.kind} · draft, not saved</Text>{field("Graph label", "label")}
    {(["parametric", "polar", "implicit"] as string[]).includes(editor.kind) && field(editor.kind === "parametric" ? "X expression x(t)" : editor.kind === "polar" ? "Radius expression r(theta)" : "Implicit expression F(x,y)=0", "expression")}
    {editor.kind === "parametric" && field("Y expression y(t)", "second")}
    {editor.kind !== "piecewise" && editor.kind !== "point-series" && <>{field("Domain minimum", "min")}{field("Domain maximum", "max")}
      {toggle("Include minimum", d.includeMin, (includeMin) => change({ includeMin }))}{toggle("Include maximum", d.includeMax, (includeMax) => change({ includeMax }))}</>}
    {(editor.kind === "implicit" || editor.kind === "inequality") && <>{field("Y minimum", "yMin")}{field("Y maximum", "yMax")}<Text>Numerical contours/regions are approximate, not exact proofs.</Text></>}
    {editor.kind === "inequality" && <>{button(`Combine: ${d.operator === "all" ? "AND" : "OR"}`, () => change({ operator: d.operator === "all" ? "any" : "all" }))}
      {d.clauses.map((clause, index) => <View key={index}>{input(`Condition ${index + 1} expression`, clause.expression, (expression) => change({ clauses: d.clauses.map((c, i) => i === index ? { ...c, expression } : c) }))}
        <View style={{ flexDirection: "row" }}>{(["<", "<=", ">", ">="] as const).map((comparator) => button(`Condition ${index + 1}: ${comparator} 0${clause.comparator === comparator ? " ✓" : ""}`, () => change({ clauses: d.clauses.map((c, i) => i === index ? { ...c, comparator } : c) })))}</View>
        {button(`Remove condition ${index + 1}`, () => change({ clauses: d.clauses.filter((_, i) => i !== index) }), d.clauses.length === 1)}</View>)}
      {button("Add condition", () => change({ clauses: [...d.clauses, { expression: "y", comparator: ">=" }] }), d.clauses.length >= 8)}</>}
    {editor.kind === "piecewise" && <>{d.pieces.map((piece, index) => {
      const update = (patch: Partial<typeof piece>) => change({ pieces: d.pieces.map((p, i) => i === index ? { ...p, ...patch } : p) });
      return <View key={index}>{input(`Piece ${index + 1} expression`, piece.expression, (expression) => update({ expression }))}
        {input(`Piece ${index + 1} minimum`, piece.min, (min) => update({ min }))}{input(`Piece ${index + 1} maximum`, piece.max, (max) => update({ max }))}
        {toggle(`Piece ${index + 1} include minimum`, piece.includeMin, (includeMin) => update({ includeMin }))}{toggle(`Piece ${index + 1} include maximum`, piece.includeMax, (includeMax) => update({ includeMax }))}
        {button(`Remove piece ${index + 1}`, () => change({ pieces: d.pieces.filter((_, i) => i !== index) }), d.pieces.length === 1)}</View>;
    })}{button("Add piece", () => change({ pieces: [...d.pieces, { expression: "x", min: d.pieces.at(-1)?.max ?? "0", max: "20", includeMin: true, includeMax: true }] }), d.pieces.length >= 16)}</>}
    {editor.kind === "point-series" && <>{button("Import CSV or TSV file", onPick)}{input("CSV or TSV x,y rows", d.data, (data) => change({ data }), true, 1024 * 1024)}
      {preview ? <Text accessibilityLiveRegion="polite">{preview.errors.length ? preview.errors.join(" ") : `Preview: ${preview.rows.length} rows; ${preview.missingCount} gaps. ${preview.rows.slice(0, 5).map((r) => `${r.x},${r.y ?? "gap"}`).join("; ")}`}</Text> : <Text>Keep existing table reference, or import rows to replace it.</Text>}
      {button(`Data mode: ${d.mode}`, () => change({ mode: d.mode === "points" ? "line" : "points" }))}
      <Text>Tables are checked local sidecars, not embedded in Graph JSON. Transfer the CSV/TSV separately to another device. Missing y creates a gap; large tables may exceed the mobile sampling budget.</Text></>}
    {field("Line color #RRGGBB", "color")}{field("Line width (0.5–12)", "width")}{toggle("Graph visible", d.visible, (visible) => change({ visible }))}
    <View style={{ flexDirection: "row" }}>{(["solid", "dashed", "dotted"] as const).map((lineStyle) => button(`Style ${lineStyle}${d.lineStyle === lineStyle ? " ✓" : ""}`, () => change({ lineStyle })))}</View>
    {button("Apply graph object", onApply)}{button("Cancel graph draft", () => onEditor(null))}
  </View>;
};
