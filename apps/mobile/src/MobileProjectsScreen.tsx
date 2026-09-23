import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { asDate, type MobileAppController } from "./mobileAppController";
import { styles } from "./mobileAppStyles";

export const MobileProjectsScreen: React.FC<{ model: MobileAppController }> = ({ model }) => {
  const {
    storedProjects,
    storageStatus,
    sceneSearchQuery,
    setSceneSearchQuery,
    sceneSortMode,
    setSceneSortMode,
    selectedScene,
    filteredSceneSummaries,
    deletedProject,
    projectActionMessage,
    openStoredScene,
    renameStoredScene,
    duplicateStoredScene,
    deleteStoredScene,
    undoDeleteStoredScene,
  } = model;
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Projects</Text>
      <Text style={styles.note}>Saved Math3D scenes available offline on this device.</Text>
      <View style={styles.settingRow}>
        <TextInput
          value={sceneSearchQuery}
          onChangeText={setSceneSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Search projects..."
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
                {mode[0].toUpperCase() + mode.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {projectActionMessage ? <Text style={styles.note}>{projectActionMessage}</Text> : null}
      {deletedProject ? (
        <View style={styles.projectUndoRow}>
          <Text style={styles.itemMeta} numberOfLines={1}>{deletedProject.title} can be restored.</Text>
          <Pressable testID="mobile-project-undo-delete" onPress={() => void undoDeleteStoredScene()} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Undo</Text>
          </Pressable>
        </View>
      ) : null}
      {storageStatus === "loading" && <Text style={styles.note}>Updating local projects...</Text>}
      {storageStatus !== "loading" && filteredSceneSummaries.length === 0 && (
        <Text style={styles.note}>No local projects available.</Text>
      )}
      {filteredSceneSummaries.map((scene) => {
        const project = storedProjects.find((candidate) => candidate.id === scene.id);
        const editing = editingProjectId === scene.id;
        return <View key={scene.id} style={[styles.item, selectedScene?.id === scene.id ? styles.itemActive : null]}>
          <Pressable testID={`mobile-project-open-${scene.id}`} onPress={() => void openStoredScene(scene.id)}>
            <View style={styles.sceneListRow}>
              <View style={styles.sceneThumb}>
                <Text style={styles.sceneThumbText}>{scene.title.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={styles.sceneListMeta}>
                <Text style={styles.itemTitle}>{scene.title}</Text>
                <Text style={styles.itemMeta}>
                  updated {asDate(scene.updatedAt)} · opened {asDate(project?.lastOpenedAt ?? scene.updatedAt)} · {scene.surfaceCount} object{scene.surfaceCount === 1 ? "" : "s"}
                </Text>
              </View>
            </View>
          </Pressable>
          {editing ? (
            <View style={styles.projectEditor}>
              <TextInput
                testID={`mobile-project-title-${scene.id}`}
                value={titleDraft}
                onChangeText={setTitleDraft}
                autoFocus
                selectTextOnFocus
                style={styles.textInput}
              />
              <View style={styles.viewerToolbarRow}>
                <Pressable
                  testID={`mobile-project-save-name-${scene.id}`}
                  onPress={() => void renameStoredScene(scene.id, titleDraft).then((saved) => {
                    if (saved) setEditingProjectId(null);
                  })}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>Save name</Text>
                </Pressable>
                <Pressable onPress={() => setEditingProjectId(null)} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.projectActions}>
              <Pressable
                testID={`mobile-project-rename-${scene.id}`}
                onPress={() => {
                  setEditingProjectId(scene.id);
                  setTitleDraft(scene.title);
                }}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>Rename</Text>
              </Pressable>
              <Pressable testID={`mobile-project-duplicate-${scene.id}`} onPress={() => void duplicateStoredScene(scene.id)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Duplicate</Text>
              </Pressable>
              <Pressable testID={`mobile-project-delete-${scene.id}`} onPress={() => void deleteStoredScene(scene.id)} style={styles.projectDeleteBtn}>
                <Text style={styles.projectDeleteText}>Delete</Text>
              </Pressable>
            </View>
          )}
        </View>;
      })}
      {selectedScene && <Text style={styles.note}>Current project: {selectedScene.title}</Text>}
    </View>
  );
};
