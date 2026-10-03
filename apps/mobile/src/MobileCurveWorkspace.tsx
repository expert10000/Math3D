import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { CurveDocument } from "@math3d/core";
import type { CurveCommandAdapter } from "@math3d/kernel";
import { commitMobileCurveSource, sampleMobileCurve } from "./models/mobileProjectCurve";
import { styles } from "./mobileAppStyles";

export const MobileCurveWorkspace: React.FC<{ document: CurveDocument; adapter: CurveCommandAdapter;
  onChange: (document: CurveDocument) => void; onSave: () => Promise<boolean>; message: string }> = ({ document, adapter, onChange, onSave, message }) => {
  const expressions = document.source.definition.expressions ?? {};
  const keys = document.source.representation === "explicit" && !expressions.x ? ["formula"] : document.source.dimension === 3 ? ["x", "y", "z"] : ["x", "y"];
  const [plotWidth, setPlotWidth] = useState(300);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [min, setMin] = useState(""), [max, setMax] = useState(""), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => { setDraft({ ...expressions }); setMin(String(document.source.domain.min)); setMax(String(document.source.domain.max)); setError(""); }, [document]);
  const plotted = useMemo(() => {
    const points = sampleMobileCurve(document.source).map(([x, y, z]) => document.source.dimension === 3 ? [x! + z! * 0.35, y! + z! * 0.25] : [x!, y!]);
    const xs = points.map(p => p[0]!), ys = points.map(p => p[1]!);
    const left = Math.min(...xs), bottom = Math.min(...ys), spanX = Math.max(...xs) - left || 1, spanY = Math.max(...ys) - bottom || 1;
    const scale = Math.min((plotWidth - 40) / spanX, 220 / spanY);
    return points.map(p => [20 + (p[0]! - left) * scale, 240 - (p[1]! - bottom) * scale] as const);
  }, [document, plotWidth]);
  const apply = () => {
    try {
      if (!min.trim() || !max.trim()) throw new TypeError("Enter both domain bounds.");
      const source = { ...document.source, domain: { ...document.source.domain, min: Number(min), max: Number(max) },
        definition: { ...document.source.definition, expressions: { ...expressions, ...draft } } };
      onChange(commitMobileCurveSource(adapter, source)); setError("");
    } catch (error) { setError((error as Error).message); }
  };
  const button = (label: string, id: string, action: () => void, disabled = false) => <Pressable key={id} testID={id}
    accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled || saving} onPress={action} style={styles.secondaryBtn}>
    <Text style={styles.secondaryBtnText}>{label}</Text></Pressable>;
  return <ScrollView testID="mobile-curve-workspace" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.itemTitle}>{document.metadata.title}</Text>
    <Text style={styles.itemMeta}>{document.source.dimension}D Curve · revision {document.identity.revision} · {document.source.domain.parameter}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {button("Undo", "mobile-curve-undo", () => onChange(adapter.undo()), adapter.history().undoDepth === 0)}
      {button("Redo", "mobile-curve-redo", () => onChange(adapter.redo()), adapter.history().redoDepth === 0)}
      {button("Save", "mobile-curve-save", () => { setSaving(true); void onSave().finally(() => setSaving(false)); })}
    </View>
    <View testID="mobile-curve-plot" accessibilityLabel={document.source.dimension === 3 ? "Curve isometric projection" : "Curve XY plot"}
      onLayout={event => setPlotWidth(event.nativeEvent.layout.width)} style={{ height: 260, backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", overflow: "hidden" }}>
      {plotted.slice(1).map(([x, y], index) => {
        const [px, py] = plotted[index]!, dx = x - px, dy = y - py, length = Math.hypot(dx, dy);
        return <View key={index} pointerEvents="none" style={{ position: "absolute", left: (x + px - length) / 2, top: (y + py) / 2 - 1,
          width: length, height: 2, backgroundColor: "#2563eb", transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
      })}
    </View>
    <Text style={styles.note}>{document.source.dimension === 3 ? "Isometric projection of saved x, y, z expressions." : "XY plot of the saved expressions."}</Text>
    {keys.map(key => <View key={key}>
      <Text style={styles.itemMeta}>{key}({document.source.domain.parameter})</Text>
      <TextInput testID={`mobile-curve-expression-${key}`} accessibilityLabel={`Curve ${key} expression`} value={draft[key] ?? ""}
        onChangeText={value => setDraft(current => ({ ...current, [key]: value }))} autoCapitalize="none" autoCorrect={false} style={styles.textInput} />
    </View>)}
    <Text style={styles.itemMeta}>Domain minimum</Text><TextInput testID="mobile-curve-min" accessibilityLabel="Curve domain minimum" value={min} onChangeText={setMin} style={styles.textInput} />
    <Text style={styles.itemMeta}>Domain maximum</Text><TextInput testID="mobile-curve-max" accessibilityLabel="Curve domain maximum" value={max} onChangeText={setMax} style={styles.textInput} />
    {button("Apply Curve", "mobile-curve-apply", apply)}
    {error && <Text accessibilityRole="alert" testID="mobile-curve-error" style={styles.note}>{error} Existing Curve is unchanged.</Text>}
    {message && <Text style={styles.note}>{message}</Text>}
    <Text style={styles.note}>Apply commits one undo step. Save retains the complete project and independent Graph/Curve histories. Drafts are not exported.</Text>
  </ScrollView>;
};
