import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { SurfaceDocument } from "@math3d/core";
import type { SurfaceCommandAdapter } from "@math3d/kernel";
import { commitMobileSurfaceSource, mobileSurfaceDomain, sampleMobileSurface } from "./models/mobileProjectSurface";
import { styles } from "./mobileAppStyles";

export const MobileSurfaceWorkspace: React.FC<{ document: SurfaceDocument; adapter: SurfaceCommandAdapter;
  onChange: (document: SurfaceDocument) => void; onSave: () => Promise<boolean>; message: string }> = ({ document, adapter, onChange, onSave, message }) => {
  const [width, setWidth] = useState(300), [draft, setDraft] = useState<Record<string, string>>({});
  const [bounds, setBounds] = useState<Record<string, string>>({}), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => {
    const domain = mobileSurfaceDomain(document.source);
    setDraft({ ...document.source.definition.expressions });
    setBounds({ uMin: String(domain.u.min), uMax: String(domain.u.max), vMin: String(domain.v.min), vMax: String(domain.v.max) }); setError("");
  }, [document]);
  const lines = useMemo(() => {
    const points = sampleMobileSurface(document.source).map(([x, y, z]) => [x! + z! * 0.35, y! + z! * 0.25]);
    const xs = points.map(p => p[0]!), ys = points.map(p => p[1]!);
    const left = Math.min(...xs), bottom = Math.min(...ys);
    const scale = Math.min((Math.max(60, width) - 40) / (Math.max(...xs) - left || 1), 220 / (Math.max(...ys) - bottom || 1));
    const plotted = points.map(p => [20 + (p[0]! - left) * scale, 240 - (p[1]! - bottom) * scale]);
    return plotted.flatMap((p, i) => [i % 17 < 16 ? plotted[i + 1] : null, i < 272 ? plotted[i + 17] : null].filter(Boolean).map(q => {
      const dx = q![0]! - p[0]!, dy = q![1]! - p[1]!, length = Math.hypot(dx, dy);
      return { left: (p[0]! + q![0]! - length) / 2, top: (p[1]! + q![1]!) / 2, length, angle: Math.atan2(dy, dx) };
    }));
  }, [document, width]);
  const apply = () => {
    try {
      if (["uMin", "uMax", "vMin", "vMax"].some(key => !bounds[key]?.trim())) throw new TypeError("Enter all four domain bounds.");
      const domain = mobileSurfaceDomain(document.source);
      onChange(commitMobileSurfaceSource(adapter, { ...document.source,
        domain: { ...domain, u: { ...domain.u, min: Number(bounds.uMin), max: Number(bounds.uMax) }, v: { ...domain.v, min: Number(bounds.vMin), max: Number(bounds.vMax) } },
        definition: { ...document.source.definition, expressions: { ...document.source.definition.expressions, ...draft } } })); setError("");
    } catch (error) { setError((error as Error).message); }
  };
  const button = (label: string, id: string, action: () => void, disabled = false) => <Pressable key={id} testID={id}
    accessibilityRole="button" accessibilityState={{ disabled: disabled || saving }} disabled={disabled || saving} onPress={action} style={styles.secondaryBtn}>
    <Text style={styles.secondaryBtnText}>{label}</Text></Pressable>;
  return <ScrollView testID="mobile-surface-workspace" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.itemTitle}>{document.metadata.title}</Text>
    <Text style={styles.itemMeta}>Surface · revision {document.identity.revision} · u, v</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {button("Undo", "mobile-surface-undo", () => onChange(adapter.undo()), adapter.history().undoDepth === 0)}
      {button("Redo", "mobile-surface-redo", () => onChange(adapter.redo()), adapter.history().redoDepth === 0)}
      {button("Save", "mobile-surface-save", () => { setSaving(true); void onSave().finally(() => setSaving(false)); })}
    </View>
    <View testID="mobile-surface-plot" accessibilityLabel="Surface isometric wireframe" onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={{ height: 260, backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", overflow: "hidden" }}>
      {lines.map((line, index) => <View key={index} pointerEvents="none" style={{ position: "absolute", left: line.left, top: line.top,
        width: line.length, height: 1, backgroundColor: "#0f766e", transform: [{ rotate: `${line.angle}rad` }] }} />)}
    </View>
    <Text style={styles.note}>Isometric wireframe of saved x, y, z expressions.</Text>
    {["x", "y", "z"].map(key => <View key={key}>
      <Text style={styles.itemMeta}>{key}(u,v)</Text>
      <TextInput testID={`mobile-surface-expression-${key}`} accessibilityLabel={`Surface ${key} expression`} value={draft[key] ?? ""}
        onChangeText={value => setDraft(current => ({ ...current, [key]: value }))} autoCapitalize="none" autoCorrect={false} style={styles.textInput} />
    </View>)}
    {([ ["uMin", "U minimum"], ["uMax", "U maximum"], ["vMin", "V minimum"], ["vMax", "V maximum"] ] as const).map(([key, label]) => <View key={key}>
      <Text style={styles.itemMeta}>{label}</Text><TextInput testID={`mobile-surface-${key}`} accessibilityLabel={`Surface ${label}`} value={bounds[key] ?? ""}
        onChangeText={value => setBounds(current => ({ ...current, [key]: value }))} style={styles.textInput} />
    </View>)}
    {button("Apply Surface", "mobile-surface-apply", apply)}
    {error && <Text accessibilityRole="alert" testID="mobile-surface-error" style={styles.note}>{error} Existing Surface is unchanged.</Text>}
    {message && <Text style={styles.note}>{message}</Text>}
    <Text style={styles.note}>Apply commits one undo step. Save retains the complete project and independent Graph, Curve and Surface histories. Drafts are not exported.</Text>
  </ScrollView>;
};
