import React, { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { GRAPH2D_MAX_OBJECTS, type Graph2DAuthoringAction, type Graph2DDocument } from "@math3d/core";
import { mobileGraphFunctionDraft, mobileGraphAuthoringAction, type MobileGraphEditor } from "./models/mobileGraphAuthoring";
import { MOBILE_GRAPH_KINDS, mobileGraphKindEditor, type MobileGraphAdvancedEditor } from "./models/mobileGraphAdvancedAuthoring";
import { MobileGraphAdvancedEditor as AdvancedEditor } from "./MobileGraphAdvancedEditor";

export const MobileGraphFunctionsPanel = ({ document, editor, onEditor, onApply, onSelect, advanced, onAdvanced, onApplyAdvanced, onPick }: { document: Graph2DDocument;
  advanced: MobileGraphAdvancedEditor | null; onAdvanced: (editor: MobileGraphAdvancedEditor | null) => void;
  onApplyAdvanced: () => void; onPick: () => void;
  editor: MobileGraphEditor | null; onEditor: (editor: MobileGraphEditor | null) => void;
  onApply: (action: Graph2DAuthoringAction) => boolean; onSelect: (id: string) => void }) => {
  const [chooser, setChooser] = useState(false);
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button"
    accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} style={s.button} onPress={onPress}><Text style={{ color: disabled ? "#94a3b8" : "#1d4ed8" }}>{label}</Text></Pressable>;
  const field = (label: string, key: "label" | "expression" | "min" | "max" | "color" | "width", maxLength = 160) => editor && <View key={key}>
    <Text>{label}</Text><TextInput accessibilityLabel={label} value={editor.draft[key]} autoCapitalize="none" autoCorrect={false}
      maxLength={maxLength} style={s.input} onChangeText={(value) => onEditor({ ...editor, draft: { ...editor.draft, [key]: value } })} /></View>;
  const toggle = (label: string, key: "visible" | "includeMin" | "includeMax") => editor && <View style={s.row} key={key}><Text>{label}</Text>
    <Switch accessibilityLabel={label} value={editor.draft[key]} onValueChange={(value) => onEditor({ ...editor, draft: { ...editor.draft, [key]: value } })} /></View>;
  return <View testID="mobile-graph-function-authoring"><Text style={s.title}>Functions</Text>
    {button("+ Add graph object", () => setChooser(!chooser), document.source.objects.length >= GRAPH2D_MAX_OBJECTS)}
    {chooser && MOBILE_GRAPH_KINDS.map((kind) => button(`Add ${kind === "explicit-cartesian" ? "explicit function" : kind}`, () => {
      onEditor(null); onAdvanced(null); setChooser(false);
      if (kind === "explicit-cartesian") onEditor({ objectId: null, draft: mobileGraphFunctionDraft(document, null) });
      else onAdvanced(mobileGraphKindEditor(document, kind));
    }))}
    {advanced && <AdvancedEditor editor={advanced} onEditor={onAdvanced} onApply={onApplyAdvanced} onPick={onPick} />}
    {editor && <View style={s.card} testID="mobile-graph-function-editor"><Text>{editor.objectId ? "Edit function" : "New function"} · draft, not saved</Text>
      {field("Function label", "label")}{field("Expression y(x)", "expression", 2048)}
      {field("Domain minimum", "min", 40)}{field("Domain maximum", "max", 40)}
      {toggle("Include minimum", "includeMin")}{toggle("Include maximum", "includeMax")}
      {field("Line color #RRGGBB", "color", 7)}{field("Line width (0.5–12)", "width", 20)}{toggle("Function visible", "visible")}
      <View style={s.row}>{(["solid", "dashed", "dotted"] as const).map((lineStyle) => <Pressable key={lineStyle} accessibilityRole="radio"
        accessibilityState={{ checked: editor.draft.lineStyle === lineStyle }} accessibilityLabel={`Line style ${lineStyle}`} style={s.button}
        onPress={() => onEditor({ ...editor, draft: { ...editor.draft, lineStyle } })}><Text>{lineStyle}</Text></Pressable>)}</View>
      {button("Apply function", () => { if (onApply(mobileGraphAuthoringAction(editor))) onEditor(null); })}
      {button("Cancel function draft", () => onEditor(null))}
    </View>}
    {document.source.objects.map((object, index) => <View style={s.card} key={object.id}>
      {button(`Select ${object.label}`, () => onSelect(object.id))}
      <Text>{object.kind === "explicit-cartesian" ? `y = ${object.expression.source}` : object.kind}</Text>
      <View style={s.row}>
        {button(`Edit ${object.label}`, () => { onEditor(null); onAdvanced(null);
          if (object.kind === "explicit-cartesian") onEditor({ objectId: object.id, draft: mobileGraphFunctionDraft(document, object.id) });
          else onAdvanced(mobileGraphKindEditor(document, object.kind, object.id)); })}
        {button(`Duplicate ${object.label}`, () => onApply({ type: "duplicate", objectId: object.id }), document.source.objects.length >= GRAPH2D_MAX_OBJECTS)}
        {button(`${document.display.objects[index]?.visible ? "Hide" : "Show"} ${object.label}`, () => onApply({ type: "visibility", objectId: object.id }))}
        {button(`Move ${object.label} up`, () => onApply({ type: "reorder", objectId: object.id, toIndex: index - 1 }), index === 0)}
        {button(`Move ${object.label} down`, () => onApply({ type: "reorder", objectId: object.id, toIndex: index + 1 }), index === document.source.objects.length - 1)}
        {button(`Delete ${object.label}`, () => { if (onApply({ type: "delete", objectId: object.id })) {
          if (editor?.objectId === object.id) onEditor(null); if (advanced?.objectId === object.id) onAdvanced(null);
        } })}
      </View>
    </View>)}<Text>Invalid drafts change nothing. Apply commits one undo step. Unsaved drafts are not exported.</Text>
  </View>;
};
const s = StyleSheet.create({ title: { fontSize: 16, fontWeight: "600" }, card: { paddingVertical: 8, borderTopWidth: 1, borderColor: "#cbd5e1" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" }, button: { minHeight: 44, minWidth: 44, padding: 10, justifyContent: "center" },
  input: { borderWidth: 1, borderColor: "#94a3b8", minHeight: 44, padding: 8, backgroundColor: "white" } });
