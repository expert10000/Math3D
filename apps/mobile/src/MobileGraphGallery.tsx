import React, { useMemo, useRef, useState } from "react";
import { AccessibilityInfo, findNodeHandle, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { GRAPH2D_PRESET_CATEGORIES, graph2DPresetPreviewKey, type Graph2DPreset, type Graph2DPresetCategory } from "@math3d/core";
import manifest from "../../../packages/core/fixtures/graph2d/gallery-previews.json";
import { mobileGraphGalleryAssets } from "./data/mobileGraphGalleryAssets";
import { mobileGraphGalleryItems, mobileGraphGalleryLayout } from "./models/mobileGraphGallery";

function GallerySafeArea({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View testID="mobile-graph-gallery" style={[s.root, {
    paddingTop: insets.top, paddingRight: insets.right, paddingBottom: insets.bottom, paddingLeft: insets.left,
  }]}>{children}</View>;
}

export function MobileGraphGallery({ onClose, onOpen, busy = false, message = "" }: {
  onClose: () => void; onOpen?: (preset: Graph2DPreset) => Promise<boolean>; busy?: boolean; message?: string;
}) {
  const window = useWindowDimensions(), [contentWidth, setContentWidth] = useState(window.width);
  const layout = mobileGraphGalleryLayout(contentWidth, window.height, window.fontScale);
  const [query, setQuery] = useState(""), [category, setCategory] = useState<Graph2DPresetCategory | "All">("All");
  const [featured, setFeatured] = useState(true), [selected, setSelected] = useState<Graph2DPreset | null>(null);
  const [shown, setShown] = useState(false);
  const heading = useRef<Text>(null);
  const items = useMemo(() => mobileGraphGalleryItems(query, category, featured), [query, category, featured]);
  const button = (label: string, action: () => void, active = false, disabled = busy, text = label) => <Pressable key={label}
    accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active, disabled }}
    disabled={disabled} onPress={action} style={[s.button, active && s.active, disabled && s.disabled]}><Text style={s.buttonText}>{text}</Text></Pressable>;
  const preview = (preset: Graph2DPreset, width = layout.cardWidth - 2) => {
    const entry = manifest.entries.find(item => item.id === preset.id);
    return entry?.key === graph2DPresetPreviewKey(preset) && entry.presetDigest === preset.digest && mobileGraphGalleryAssets[preset.id]
      ? <Image source={mobileGraphGalleryAssets[preset.id]} style={[s.image, { width, height: width * 9 / 16 }]} resizeMode="contain" accessibilityLabel={`${preset.title} graph preview`} />
      : <Text>Preview unavailable. The editable scene remains available.</Text>;
  };
  return <Modal visible animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {
    if (busy) return;
    if (Keyboard.isVisible()) { Keyboard.dismiss(); return; }
    onClose();
  }}
    onShow={() => { setShown(true); const handle = findNodeHandle(heading.current); if (handle) AccessibilityInfo.setAccessibilityFocus(handle); }}>
    <SafeAreaProvider><KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <GallerySafeArea>
      <View style={s.header}><Text ref={heading} accessibilityRole="header" style={s.heading}>Graph Gallery</Text>{button("Close Graph Gallery", onClose, false, busy, "Close")}</View>
      {shown && <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.content}
        onLayout={event => { const width = event.nativeEvent.layout.width; if (width > 0) setContentWidth(width); }}>
        {!layout.compact && <Text style={s.intro}>Explore the mathematics. Open an editable copy. {onOpen ? "Current work is saved before switching. " : ""}Previews are available offline.</Text>}
        {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
        <Text style={s.label}>Search graphs</Text><TextInput accessibilityLabel="Search graphs" testID="mobile-graph-gallery-search"
          value={query} onChangeText={text => { setQuery(text); setFeatured(false); setSelected(null); }} maxLength={160}
          placeholder="Try roses, tangent or gaps" editable={!busy} style={s.search} returnKeyType="search" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
          {button("Featured", () => { setFeatured(true); setQuery(""); setCategory("All"); setSelected(null); }, featured)}
          {button("All scenes", () => { setFeatured(false); setQuery(""); setCategory("All"); setSelected(null); }, !featured)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
          {(["All", ...GRAPH2D_PRESET_CATEGORIES] as const).map(value => button(value, () => { setCategory(value); setFeatured(false); setSelected(null); }, category === value))}
        </ScrollView>
        {selected ? <View style={s.detail} testID="mobile-graph-gallery-detail">
          {button("Back to gallery", () => setSelected(null))}{preview(selected, contentWidth - 40)}<Text accessibilityRole="header" style={s.title}>{selected.title}</Text>
          <Text style={s.description}>{selected.description}</Text>{selected.learningGoals.map(goal => <Text key={goal} style={s.description}>• {goal}</Text>)}
          <Text style={s.meta}>Approximate sampled preview · {selected.attribution.author} · {selected.attribution.license}</Text>
          {onOpen && button(busy ? "Opening graph…" : `Open ${selected.title}`, () => { void onOpen(selected); })}
        </View> : <>
          <Text accessibilityLiveRegion="polite" style={s.meta}>{items.length} scenes · {featured ? "hand-picked starting points" : "editable examples"}</Text>
          <View style={s.grid}>{items.map(preset => <View key={preset.id} style={[s.card, { width: layout.cardWidth }]} testID={`mobile-graph-gallery-card-${preset.id}`}>
            {preview(preset)}<View style={s.body}><Text style={s.meta}>{preset.category} · {preset.difficulty}</Text>
              <Text accessibilityRole="header" style={s.title}>{preset.title}</Text><Text style={s.description}>{preset.description}</Text>
              <View style={s.actions}>{onOpen && button(`Open ${preset.title}`, () => { void onOpen(preset); })}
                {button(`Preview ${preset.title}`, () => setSelected(preset))}</View></View>
          </View>)}</View>{!items.length && <Text style={s.description}>No scenes match these filters. Try another search or category.</Text>}
        </>}
      </ScrollView>}
    </GallerySafeArea></KeyboardAvoidingView></SafeAreaProvider>
  </Modal>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" }, header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", padding: 16, gap: 8 },
  heading: { fontSize: 24, fontWeight: "700", flex: 1, color: "#0f172a" }, content: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  intro: { color: "#334155", fontSize: 16 }, label: { color: "#0f172a", fontWeight: "600" }, search: { minHeight: 48, borderWidth: 1, borderColor: "#94a3b8", backgroundColor: "white", borderRadius: 10, padding: 12, fontSize: 16 },
  filters: { gap: 8 }, button: { minHeight: 48, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#94a3b8", backgroundColor: "white", justifyContent: "center" },
  buttonText: { color: "#1d4ed8", fontWeight: "600", fontSize: 14 }, active: { backgroundColor: "#dbeafe", borderColor: "#2563eb" }, disabled: { opacity: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, card: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, overflow: "hidden", backgroundColor: "white" },
  image: { backgroundColor: "#f8fafc" }, body: { padding: 14, gap: 10 }, meta: { color: "#475569", fontSize: 13 },
  title: { fontSize: 20, color: "#0f172a", fontWeight: "700" }, description: { fontSize: 15, color: "#334155" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  detail: { gap: 14 }, message: { fontSize: 15, color: "#9a3412" },
});
