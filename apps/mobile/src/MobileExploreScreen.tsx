import React from "react";
import { Pressable, Text, View } from "react-native";
import { mobileFunctionPresets, mobileGallery } from "./data/mobileSeedData";
import { surfaceSummary, type MobileAppController } from "./mobileAppController";
import { styles } from "./mobileAppStyles";

export const MobileExploreScreen: React.FC<{ model: MobileAppController }> = ({ model }) => {
  const { tab, exploreSection, setExploreSection, selectedGalleryId, setSelectedGalleryId, selectedGallery, openViewerWithSurface } = model;
  return (
    <>
        {tab === "explore" && (
          <View style={styles.exploreNav}>
            {(["gallery", "functions", "learn"] as const).map((section) => (
              <Pressable
                key={section}
                onPress={() => setExploreSection(section)}
                style={[styles.exploreNavBtn, exploreSection === section ? styles.exploreNavBtnActive : null]}
              >
                <Text style={[styles.exploreNavText, exploreSection === section ? styles.exploreNavTextActive : null]}>
                  {section === "gallery" ? "Gallery" : section === "functions" ? "Functions" : "Learn"}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {tab === "explore" && exploreSection === "gallery" && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Gallery demos</Text>
            {mobileGallery.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => {
                  setSelectedGalleryId(item.id);
                  openViewerWithSurface(item.surface, item.title);
                }}
                style={[styles.item, selectedGalleryId === item.id ? styles.itemActive : null]}
              >
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemMeta}>{item.description}</Text>
                <Text style={styles.itemMeta}>{surfaceSummary(item.surface)}</Text>
              </Pressable>
            ))}

            {selectedGallery && (
              <Pressable
                onPress={() => openViewerWithSurface(selectedGallery.surface, selectedGallery.title)}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>Open In Viewer ({selectedGallery.title})</Text>
              </Pressable>
            )}
          </View>
        )}

        {tab === "explore" && exploreSection === "learn" && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Formula notes</Text>
            <Text style={styles.note}>Workbook explanations and guided examples are planned here.</Text>
            <Text style={styles.itemMeta}>Planned first module: implicit surfaces and domain bounds intuition.</Text>
          </View>
        )}

        {tab === "explore" && exploreSection === "functions" && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Function library</Text>
            <Text style={styles.note}>Tap a preset to load it into Workspace.</Text>
            {mobileFunctionPresets.map((preset) => (
              <Pressable
                key={preset.id}
                onPress={() => openViewerWithSurface(preset.surface, preset.name)}
                style={styles.item}
              >
                <Text style={styles.itemTitle}>{preset.name}</Text>
                <Text style={styles.itemMeta}>{preset.description}</Text>
                <Text style={styles.itemMeta}>{surfaceSummary(preset.surface)}</Text>
              </Pressable>
            ))}
          </View>
        )}

    </>
  );
};
