import React, { useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import type { SceneDocument } from "@math3d/core";
import type { MobileGalleryItem, MobileSceneSummary } from "./models/mobileScene";
import { createMobileMeshBackend } from "./services/mobileMeshBackend";

type MobileTab = "home" | "gallery" | "viewer" | "learn";

const demoScenes: MobileSceneSummary[] = [
  { id: "s-1", title: "Implicit Sphere", updatedAt: Date.now() - 86_400_000, surfaceCount: 1 },
  { id: "s-2", title: "Enneper Study", updatedAt: Date.now() - 172_800_000, surfaceCount: 1 },
];

const gallery: MobileGalleryItem[] = [
  {
    id: "g-1",
    title: "Catenoid",
    description: "Minimal parametric surface",
    surface: {
      id: "surface-catenoid",
      kind: "parametric",
      xExpr: "cosh(v)*cos(u)",
      yExpr: "cosh(v)*sin(u)",
      zExpr: "v",
      resolution: 90,
    },
  },
  {
    id: "g-2",
    title: "Implicit Torus",
    description: "Remote-generated implicit mesh preview",
    surface: {
      id: "surface-torus",
      kind: "implicit",
      expression: "(x*x + y*y + z*z + 3 - 4)^2 - 4*(x*x + y*y)",
      resolution: 80,
    },
  },
];

const asDate = (timestamp: number) => new Date(timestamp).toLocaleDateString();

export const MobileApp: React.FC = () => {
  const [tab, setTab] = useState<MobileTab>("home");
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(demoScenes[0]?.id ?? null);
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(gallery[0]?.id ?? null);

  const backend = useMemo(() => createMobileMeshBackend("https://example.invalid/api/worker"), []);
  void backend;

  const selectedScene = useMemo(
    () => demoScenes.find((scene) => scene.id === selectedSceneId) ?? null,
    [selectedSceneId]
  );
  const selectedGallery = useMemo(
    () => gallery.find((item) => item.id === selectedGalleryId) ?? null,
    [selectedGalleryId]
  );

  const viewerDocument: SceneDocument | null = useMemo(() => {
    if (!selectedGallery) return null;
    return {
      id: `doc-${selectedGallery.id}`,
      title: selectedGallery.title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      surfaces: [selectedGallery.surface],
    };
  }, [selectedGallery]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Math3D Mobile</Text>
        <Text style={styles.subtitle}>Companion app shell</Text>
      </View>

      <View style={styles.navRow}>
        {(["home", "gallery", "viewer", "learn"] as const).map((key) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.navBtn, tab === key ? styles.navBtnActive : null]}
          >
            <Text style={[styles.navBtnText, tab === key ? styles.navBtnTextActive : null]}>{key}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === "home" && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Recent scenes</Text>
            {demoScenes.map((scene) => (
              <Pressable key={scene.id} onPress={() => setSelectedSceneId(scene.id)} style={styles.item}>
                <Text style={styles.itemTitle}>{scene.title}</Text>
                <Text style={styles.itemMeta}>
                  updated {asDate(scene.updatedAt)} | surfaces: {scene.surfaceCount}
                </Text>
              </Pressable>
            ))}
            {selectedScene && <Text style={styles.note}>Selected: {selectedScene.title}</Text>}
          </View>
        )}

        {tab === "gallery" && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Gallery demos</Text>
            {gallery.map((item) => (
              <Pressable key={item.id} onPress={() => setSelectedGalleryId(item.id)} style={styles.item}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemMeta}>{item.description}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {tab === "viewer" && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Scene viewer</Text>
            {viewerDocument ? (
              <>
                <Text style={styles.itemTitle}>{viewerDocument.title}</Text>
                <Text style={styles.itemMeta}>
                  Surfaces: {viewerDocument.surfaces?.length ?? 0} | Remote mesh generation only
                </Text>
                <Text style={styles.note}>
                  3D rendering surface and gestures will be connected with Expo GL / R3F in the next step.
                </Text>
              </>
            ) : (
              <Text style={styles.note}>Select a gallery item first.</Text>
            )}
          </View>
        )}

        {tab === "learn" && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Formula notes</Text>
            <Text style={styles.note}>This tab will host workbook explanations and guided examples.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f4f6f8",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1b2430",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#566172",
  },
  navRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  navBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#e1e8ef",
  },
  navBtnActive: {
    backgroundColor: "#163b66",
  },
  navBtnText: {
    textTransform: "capitalize",
    color: "#1f2a36",
    fontWeight: "600",
  },
  navBtnTextActive: {
    color: "#ffffff",
  },
  content: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    gap: 12,
  },
  panel: {
    borderRadius: 14,
    backgroundColor: "#ffffff",
    padding: 12,
    borderWidth: 1,
    borderColor: "#d5dbe2",
    gap: 8,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#203047",
  },
  item: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e3e8ef",
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f2d3d",
  },
  itemMeta: {
    marginTop: 3,
    color: "#5b6573",
    fontSize: 12,
  },
  note: {
    color: "#48586b",
    fontSize: 13,
    lineHeight: 18,
  },
});

