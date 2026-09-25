import React, { useState } from "react";
import { Pressable, Text, TextInput, useWindowDimensions, View } from "react-native";
import { asDate, type MobileAppController } from "./mobileAppController";
import { styles } from "./mobileAppStyles";
import { MobileProjectThumbnail } from "./components/MobileProjectThumbnail";
import { mobileExamples } from "./data/mobileSeedData";
import { mobileProjectCreationLayout, type MobileProjectCreationRequest } from "./models/mobileProjectCreation";
import { mobileProjectTemplates } from "./models/mobileProjectTemplates";

export const MobileProjectsScreen: React.FC<{ model: MobileAppController }> = ({ model }) => {
  const {
    storedProjects,
    storageStatus,
    storageIssues,
    sceneSearchQuery,
    setSceneSearchQuery,
    sceneSortMode,
    setSceneSortMode,
    selectedScene,
    filteredSceneSummaries,
    deletedProject,
    projectActionMessage,
    sceneThumbnailsById,
    openStoredScene,
    renameStoredScene,
    duplicateStoredScene,
    deleteStoredScene,
    undoDeleteStoredScene,
    createNewProject,
    createNewProjectFromFile,
    exportStoredScene,
    shareStoredScene,
  } = model;
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [transferBusy, setTransferBusy] = useState<string | null>(null);
  const [creationOpen, setCreationOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const { width } = useWindowDimensions();
  const creationLayout = mobileProjectCreationLayout(width);

  const runTransfer = async (key: string, action: () => Promise<boolean>) => {
    if (transferBusy) return;
    setTransferBusy(key);
    try {
      await action();
    } finally {
      setTransferBusy(null);
    }
  };

  const runCreation = async (key: string, request: MobileProjectCreationRequest) => {
    if (transferBusy) return;
    setTransferBusy(key);
    try {
      const title = newProjectTitle.trim() || ("title" in request ? request.title : undefined);
      const created = await createNewProject({ ...request, title } as MobileProjectCreationRequest);
      if (created) {
        setCreationOpen(false);
        setNewProjectTitle("");
      }
    } finally {
      setTransferBusy(null);
    }
  };

  const runFileCreation = async (source: "import" | "desktop") => {
    if (transferBusy) return;
    setTransferBusy(source);
    try {
      const created = await createNewProjectFromFile(source);
      if (created) setCreationOpen(false);
    } finally {
      setTransferBusy(null);
    }
  };

  const optionStyle = [
    styles.projectCreationOption,
    { width: creationLayout.optionWidth, minHeight: creationLayout.minTouchHeight },
  ];

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Projects</Text>
      <Text style={styles.note}>Saved Math3D scenes available offline on this device.</Text>
      <View style={styles.projectActions}>
        <Pressable
          testID="mobile-new-project"
          disabled={transferBusy !== null}
          onPress={() => setCreationOpen((open) => !open)}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnText}>{creationOpen ? "Close New Project" : "New Project"}</Text>
        </Pressable>
      </View>
      {creationOpen ? (
        <View
          testID="mobile-project-creation-flow"
          accessibilityLabel={`New Project, ${creationLayout.columns} column layout`}
          style={[styles.projectCreationPanel, { paddingHorizontal: creationLayout.horizontalPadding }]}
        >
          <Text style={styles.subPanelTitle}>New Project</Text>
          <Text style={styles.note}>Choose a starting point. Math3D saves the project before opening Workspace.</Text>
          <TextInput
            testID="mobile-new-project-title"
            value={newProjectTitle}
            onChangeText={setNewProjectTitle}
            placeholder="Project name (optional)"
            maxLength={80}
            style={styles.textInput}
          />

          <Text style={styles.projectCreationGroupTitle}>Empty</Text>
          <View style={styles.projectCreationGrid}>
            <Pressable testID="mobile-new-project-empty" disabled={transferBusy !== null} onPress={() => void runCreation("empty", { route: "empty" })} style={optionStyle}>
              <Text style={styles.itemTitle}>Empty project</Text>
              <Text style={styles.itemMeta}>Start with a saved blank scene.</Text>
            </Pressable>
          </View>

          <Text style={styles.projectCreationGroupTitle}>Create</Text>
          <View style={styles.projectCreationGrid}>
            {(["plane", "sphere", "cylinder", "torus"] as const).map((primitive) => (
              <Pressable key={primitive} testID={`mobile-new-project-primitive-${primitive}`} disabled={transferBusy !== null} onPress={() => void runCreation(`primitive-${primitive}`, { route: "primitive", primitive })} style={optionStyle}>
                <Text style={styles.itemTitle}>{primitive[0].toUpperCase() + primitive.slice(1)}</Text>
                <Text style={styles.itemMeta}>Primitive project</Text>
              </Pressable>
            ))}
            {(["explicit", "parametric", "implicit"] as const).map((surfaceKind) => (
              <Pressable key={surfaceKind} testID={`mobile-new-project-surface-${surfaceKind}`} disabled={transferBusy !== null} onPress={() => void runCreation(`surface-${surfaceKind}`, { route: "surface", surfaceKind })} style={optionStyle}>
                <Text style={styles.itemTitle}>{surfaceKind[0].toUpperCase() + surfaceKind.slice(1)} surface</Text>
                <Text style={styles.itemMeta}>Editable surface project</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.projectCreationGroupTitle}>Import</Text>
          <View style={styles.projectCreationGrid}>
            <Pressable testID="mobile-new-project-import" disabled={transferBusy !== null} onPress={() => void runFileCreation("import")} style={optionStyle}>
              <Text style={styles.itemTitle}>{transferBusy === "import" ? "Choosing..." : "Math3D project"}</Text>
              <Text style={styles.itemMeta}>Create a separate project from a file.</Text>
            </Pressable>
          </View>

          <Text style={styles.projectCreationGroupTitle}>Start from</Text>
          <View style={styles.projectCreationGrid}>
            {mobileExamples.map((example) => (
              <Pressable key={example.id} testID={`mobile-new-project-example-${example.id}`} disabled={transferBusy !== null} onPress={() => void runCreation(`example-${example.id}`, { route: "example", example })} style={optionStyle}>
                <Text style={styles.itemTitle}>{example.title}</Text>
                <Text style={styles.itemMeta}>Example · {example.category}</Text>
              </Pressable>
            ))}
            {mobileProjectTemplates.map((template) => (
              <Pressable
                key={template.id}
                testID={`mobile-new-project-template-${template.id}`}
                disabled={transferBusy !== null}
                onPress={() => void runCreation(`template-${template.id}`, {
                  route: "template",
                  templateId: template.id,
                  templateVersion: template.version,
                  scene: template.scene,
                  title: newProjectTitle.trim() || template.title,
                })}
                style={optionStyle}
              >
                <Text style={styles.itemTitle}>{template.title}</Text>
                <Text style={styles.itemMeta}>{template.description} · v{template.version}</Text>
              </Pressable>
            ))}
            <Pressable testID="mobile-new-project-desktop" disabled={transferBusy !== null} onPress={() => void runFileCreation("desktop")} style={optionStyle}>
              <Text style={styles.itemTitle}>{transferBusy === "desktop" ? "Choosing..." : "Desktop project"}</Text>
              <Text style={styles.itemMeta}>Open a compatible desktop export.</Text>
            </Pressable>
          </View>
          <Pressable
            testID="mobile-new-project-cancel"
            disabled={transferBusy !== null}
            onPress={() => {
              setCreationOpen(false);
              setNewProjectTitle("");
            }}
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
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
      {storageIssues.length > 0 ? (
        <View style={styles.issuePanel}>
          <Text style={styles.issuePanelTitle}>Project storage needs attention</Text>
          <Text style={styles.issueText}>{storageIssues[0]}</Text>
          {storageIssues.length > 1 ? (
            <Text style={styles.itemMeta}>See Settings for {storageIssues.length - 1} more detail{storageIssues.length === 2 ? "" : "s"}.</Text>
          ) : null}
        </View>
      ) : null}
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
              <MobileProjectThumbnail thumbnail={sceneThumbnailsById[scene.id]} title={scene.title} />
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
              <Pressable
                testID={`mobile-project-export-${scene.id}`}
                disabled={transferBusy !== null}
                onPress={() => void runTransfer(`export-${scene.id}`, () => exportStoredScene(scene.id))}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>{transferBusy === `export-${scene.id}` ? "Exporting..." : "Export"}</Text>
              </Pressable>
              <Pressable
                testID={`mobile-project-share-${scene.id}`}
                disabled={transferBusy !== null}
                onPress={() => void runTransfer(`share-${scene.id}`, () => shareStoredScene(scene.id))}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>{transferBusy === `share-${scene.id}` ? "Sharing..." : "Share"}</Text>
              </Pressable>
            </View>
          )}
        </View>;
      })}
      {selectedScene && <Text style={styles.note}>Current project: {selectedScene.title}</Text>}
    </View>
  );
};
