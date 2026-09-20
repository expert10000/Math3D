import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { asDate, type MobileAppController } from "./mobileAppController";
import { styles } from "./mobileAppStyles";

export const MobileFilesScreen: React.FC<{ model: MobileAppController }> = ({ model }) => {
  const {
    storedProjects,
    storageStatus,
    sceneSearchQuery,
    setSceneSearchQuery,
    sceneSortMode,
    setSceneSortMode,
    selectedScene,
    filteredSceneSummaries,
    openStoredScene
  } = model;
  return (

    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Saved scenes</Text>
      <View style={styles.settingRow}>
        <TextInput
          value={sceneSearchQuery}
          onChangeText={setSceneSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Search scenes..."
          style={styles.textInput}
        />
        <View style={styles.settingChoiceRow}>
          {(["recent", "updated", "title"] as const).map((mode) => (
            <Pressable
              key={`scene-sort-${mode}`}
              onPress={() => setSceneSortMode(mode)}
              style={[styles.pill, sceneSortMode === mode ? styles.pillActive : null]}
            >
              <Text style={[styles.pillText, sceneSortMode === mode ? styles.pillTextActive : null]}>
                {mode}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {storageStatus === "loading" && <Text style={styles.note}>Loading local scene storage...</Text>}
      {storageStatus !== "loading" && filteredSceneSummaries.length === 0 && (
        <Text style={styles.note}>No local scenes available.</Text>
      )}
      {filteredSceneSummaries.map((scene) => (
        <Pressable
          key={scene.id}
          onPress={() => {
            void openStoredScene(scene.id);
          }}
          style={styles.item}
        >
          <View style={styles.sceneListRow}>
            <View style={styles.sceneThumb}>
              <Text style={styles.sceneThumbText}>{scene.title.slice(0, 2).toUpperCase()}</Text>
            </View>
            <View style={styles.sceneListMeta}>
              <Text style={styles.itemTitle}>{scene.title}</Text>
              <Text style={styles.itemMeta}>
                updated {asDate(scene.updatedAt)} | last opened{" "}
                {asDate(storedProjects.find((project) => project.id === scene.id)?.lastOpenedAt ?? scene.updatedAt)} |
                surfaces: {scene.surfaceCount}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
      {selectedScene && <Text style={styles.note}>Selected: {selectedScene.title}</Text>}

    </View>
  );
};
