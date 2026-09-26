import React, { useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { mobileExamples } from "../data/mobileSeedData";
import type { MobileAppController } from "../mobileAppController";
import { styles } from "../mobileAppStyles";
import type { MobileSceneObjectImportPreview } from "../models/mobileSceneObjectImport";
import type { MobileMeshImportPreview } from "../models/mobileMeshImport";
import { mobileWorkspaceAddLayout } from "../models/mobileWorkspaceAdd";
import type { MobileProjectCompositionPreview, MobileProjectCompositionSource } from "../models/mobileProjectComposition";

const presetIds = new Set(["sphere", "paraboloid", "helicoid"]);

export const MobileWorkspaceAddLauncher: React.FC<{
  model: MobileAppController;
  onClose: () => void;
}> = ({ model, onClose }) => {
  const { width } = useWindowDimensions();
  const layout = mobileWorkspaceAddLayout(width);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [objectPreview, setObjectPreview] = useState<MobileSceneObjectImportPreview | null>(null);
  const [meshPreview, setMeshPreview] = useState<MobileMeshImportPreview | null>(null);
  const [projectSourceOpen, setProjectSourceOpen] = useState(false);
  const [projectSource, setProjectSource] = useState<MobileProjectCompositionSource | null>(null);
  const [projectObjectIds, setProjectObjectIds] = useState<string[]>([]);
  const [projectPreview, setProjectPreview] = useState<MobileProjectCompositionPreview | null>(null);
  const presets = mobileExamples.filter((example) => presetIds.has(example.id));

  const optionStyle = [
    styles.workspaceAddOption,
    { width: layout.optionWidth, minHeight: layout.minTouchHeight },
  ];
  const run = async (action: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    try {
      if (await action()) onClose();
    } finally {
      setBusy(false);
    }
  };
  const chooseMath3DObject = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await model.pickSceneObjectForWorkspace();
      if (result.status === "ready") setObjectPreview(result.preview);
      else {
        setObjectPreview(null);
        if (result.status === "error") setMessage(result.error);
      }
    } finally {
      setBusy(false);
    }
  };
  const chooseMesh = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await model.pickMeshForWorkspace();
      if (result.status === "ready") setMeshPreview(result.preview);
      else {
        setMeshPreview(null);
        if (result.status === "error") setMessage(result.error);
      }
    } finally {
      setBusy(false);
    }
  };
  const unavailable = (next: string) => setMessage(next);
  const acceptProjectSource = (result: ReturnType<typeof model.projectSourceFromLibrary>) => {
    setProjectPreview(null);
    if (result.status === "ready") {
      setProjectSource(result.source);
      setProjectObjectIds([]);
      setMessage("");
    } else if (result.status === "error") setMessage(result.error);
  };
  const pickProjectSource = async () => {
    if (busy) return;
    setBusy(true);
    try { acceptProjectSource(await model.pickProjectSourceForWorkspace()); }
    finally { setBusy(false); }
  };
  const toggleProjectObject = (objectId: string) => {
    setProjectPreview(null);
    setProjectObjectIds((current) => current.includes(objectId)
      ? current.filter((id) => id !== objectId)
      : [...current, objectId]);
  };
  const previewProjectSelection = () => {
    if (!projectSource) return;
    const planned = model.previewProjectObjectsForWorkspace(projectSource, projectObjectIds);
    if (planned.ok) {
      setProjectPreview(planned.preview);
      setMessage("");
    } else {
      setProjectPreview(null);
      setMessage(planned.error);
    }
  };

  return (
    <View testID="mobile-workspace-add-launcher" style={styles.workspaceAddLauncher}>
      <View style={styles.workspaceAddHeader}>
        <View style={styles.workspaceAddHeaderText}>
          <Text style={styles.subPanelTitle}>Add to Project</Text>
          <Text style={styles.itemMeta}>One saved, undoable project mutation.</Text>
        </View>
        <Pressable testID="mobile-workspace-add-close" onPress={onClose} style={styles.workspaceAddClose}>
          <Text style={styles.secondaryBtnText}>Close</Text>
        </Pressable>
      </View>
      <ScrollView style={{ maxHeight: layout.maxPanelHeight }} contentContainerStyle={styles.workspaceAddContent}>
        <Text style={styles.projectCreationGroupTitle}>Create</Text>
        <View style={styles.projectCreationGrid}>
          {(["plane", "sphere", "cylinder", "torus"] as const).map((primitive) => (
            <Pressable
              key={primitive}
              testID={`mobile-workspace-add-primitive-${primitive}`}
              disabled={busy}
              onPress={() => void run(() => model.addPrimitiveToWorkspace(primitive))}
              style={optionStyle}
            >
              <Text style={styles.itemTitle}>{primitive[0].toUpperCase() + primitive.slice(1)}</Text>
              <Text style={styles.itemMeta}>Primitive</Text>
            </Pressable>
          ))}
          {(["explicit", "parametric", "implicit"] as const).map((mode) => (
            <Pressable
              key={mode}
              testID={`mobile-workspace-add-surface-${mode}`}
              onPress={() => {
                model.openSurfaceAddEditor(mode);
                onClose();
              }}
              style={optionStyle}
            >
              <Text style={styles.itemTitle}>{mode[0].toUpperCase() + mode.slice(1)} surface</Text>
              <Text style={styles.itemMeta}>Open formula editor</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.projectCreationGroupTitle}>Import</Text>
        <View style={styles.projectCreationGrid}>
          <Pressable testID="mobile-workspace-add-mesh" disabled={busy} onPress={() => void chooseMesh()} style={optionStyle}>
            <Text style={styles.itemTitle}>{busy ? "Choosing..." : "Mesh"}</Text><Text style={styles.itemMeta}>OBJ, STL, PLY, GLB, glTF</Text>
          </Pressable>
          <Pressable testID="mobile-workspace-add-object" disabled={busy} onPress={() => void chooseMath3DObject()} style={optionStyle}>
            <Text style={styles.itemTitle}>{busy ? "Choosing..." : "Math3D object"}</Text><Text style={styles.itemMeta}>Pick and preview semantic content</Text>
          </Pressable>
          <Pressable testID="mobile-workspace-add-from-project" disabled={busy} onPress={() => { setProjectSourceOpen((open) => !open); setMessage(""); }} style={optionStyle}>
            <Text style={styles.itemTitle}>Objects from project</Text><Text style={styles.itemMeta}>Copy compatible objects</Text>
          </Pressable>
        </View>
        {projectSourceOpen ? (
          <View testID="mobile-workspace-project-source" style={styles.subPanel}>
            <Text style={styles.subPanelTitle}>Add from project</Text>
            <Text style={styles.itemMeta}>Choose another saved project or a Math3D project file.</Text>
            <View style={styles.viewerToolbarRow}>
              {model.storedProjects.filter((project) => project.id !== model.selectedSceneId).map((project) => (
                <Pressable key={project.id} testID={`mobile-workspace-source-${project.id}`} disabled={busy} onPress={() => acceptProjectSource(model.projectSourceFromLibrary(project.id))} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>{project.title}</Text>
                </Pressable>
              ))}
              <Pressable testID="mobile-workspace-source-file" disabled={busy} onPress={() => void pickProjectSource()} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Choose file</Text>
              </Pressable>
            </View>
            {projectSource ? (
              <View>
                <Text style={styles.note}>{projectSource.projectTitle} · {projectSource.objects.length} objects</Text>
                {projectSource.objects.map((object) => {
                  const selected = projectObjectIds.includes(object.id);
                  return <Pressable key={object.id} testID={`mobile-workspace-source-object-${object.id}`} disabled={!object.compatible || busy} onPress={() => toggleProjectObject(object.id)} style={styles.inspectorSettingRow} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: !object.compatible }}>
                    <Text style={styles.itemTitle}>{selected ? "☑" : "☐"} {object.id} · {object.kind}</Text>
                    <Text style={object.compatible ? styles.itemMeta : styles.warningNote}>{object.compatible ? `${Math.ceil(object.bytes / 1024)} KB${object.dependencies.length ? ` · needs ${object.dependencies.join(", ")}` : ""}` : object.reason}</Text>
                  </Pressable>;
                })}
                <View style={styles.viewerToolbarRow}>
                  <Pressable testID="mobile-workspace-source-preview" disabled={busy || projectObjectIds.length === 0} onPress={previewProjectSelection} style={styles.primaryBtn}>
                    <Text style={styles.primaryBtnText}>Preview selection</Text>
                  </Pressable>
                  <Pressable testID="mobile-workspace-source-cancel" onPress={() => { setProjectSourceOpen(false); setProjectSource(null); setProjectPreview(null); setProjectObjectIds([]); setMessage("Add from project cancelled. The destination was not changed."); }} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                  </Pressable>
                </View>
                {projectPreview ? (
                  <View testID="mobile-workspace-project-preview" style={styles.subPanel}>
                    <Text style={styles.subPanelTitle}>Add {projectPreview.selectedObjectIds.length} object{projectPreview.selectedObjectIds.length === 1 ? "" : "s"}</Text>
                    <Text style={styles.itemMeta}>Estimated transfer: {Math.ceil(projectPreview.estimatedBytes / 1024)} KB · {projectPreview.plan.dependencies.length} internal dependenc{projectPreview.plan.dependencies.length === 1 ? "y" : "ies"}</Text>
                    {Object.entries(projectPreview.plan.idMap).map(([from, to]) => <Text key={from} style={styles.itemMeta}>{from === to ? from : `${from} → ${to} (copy)`}</Text>)}
                    <Pressable testID="mobile-workspace-source-confirm" disabled={busy} onPress={() => void run(() => model.addProjectObjectsToWorkspace(projectPreview))} style={styles.primaryBtn}>
                      <Text style={styles.primaryBtnText}>Add selected objects</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
        {meshPreview ? (
          <View testID="mobile-workspace-mesh-import-preview" style={styles.subPanel}>
            <Text style={styles.subPanelTitle}>{meshPreview.format.toUpperCase()} mesh</Text>
            <Text style={styles.itemMeta}>{meshPreview.sourceVertexCount.toLocaleString()} vertices · {meshPreview.sourceTriangleCount.toLocaleString()} triangles</Text>
            <Text style={styles.itemMeta}>Normals: {meshPreview.normalsGenerated ? "generated" : "source"} · Admission: {meshPreview.admission.action}</Text>
            <Text style={styles.itemMeta}>{meshPreview.axisAssumption}</Text>
            <Text style={styles.itemMeta}>{meshPreview.unitAssumption}</Text>
            {meshPreview.admission.action === "reduced" ? <Text style={styles.warningNote}>A reduced preview will render on this device; the validated source mesh remains in the project.</Text> : null}
            {meshPreview.transferPreview.hasIdentityCollision ? <Text style={styles.warningNote}>Object ID already exists. It will be added as {meshPreview.transferPreview.destinationObjectId}.</Text> : null}
            {meshPreview.warnings.map((warning) => <Text key={warning} style={styles.warningNote}>{warning}</Text>)}
            <View style={styles.viewerToolbarRow}>
              <Pressable testID="mobile-workspace-mesh-import-confirm" disabled={busy} onPress={() => void run(() => model.importMeshToWorkspace(meshPreview))} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Import mesh</Text>
              </Pressable>
              <Pressable testID="mobile-workspace-mesh-import-cancel" disabled={busy} onPress={() => {
                setMeshPreview(null);
                setMessage("Mesh import cancelled. The project was not changed.");
              }} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {objectPreview ? (
          <View testID="mobile-workspace-object-import-preview" style={styles.subPanel}>
            <Text style={styles.subPanelTitle}>{objectPreview.envelope.object.kind} · {objectPreview.envelope.object.id}</Text>
            <Text style={styles.itemMeta} numberOfLines={2}>{objectPreview.definitionSummary}</Text>
            <Text style={styles.itemMeta}>
              Contract v{objectPreview.sourceVersion}{objectPreview.migrated ? " · migrated to v1" : ""} · {objectPreview.sourceName}
            </Text>
            {objectPreview.hasIdentityCollision ? (
              <Text style={styles.warningNote}>Object ID already exists. It will be added as {objectPreview.destinationObjectId}.</Text>
            ) : null}
            <Text style={styles.itemMeta}>Preserves definition, domain, resolution, transform, style, provenance{objectPreview.analysisMetadataKeys.length > 0 ? `, and analysis metadata (${objectPreview.analysisMetadataKeys.join(", ")})` : ""}.</Text>
            <View style={styles.viewerToolbarRow}>
              <Pressable
                testID="mobile-workspace-object-import-confirm"
                disabled={busy}
                onPress={() => void run(() => model.importSceneObjectToWorkspace(objectPreview))}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>Import object</Text>
              </Pressable>
              <Pressable
                testID="mobile-workspace-object-import-cancel"
                disabled={busy}
                onPress={() => {
                  setObjectPreview(null);
                  setMessage("Object import cancelled. The project was not changed.");
                }}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Text style={styles.projectCreationGroupTitle}>Explore</Text>
        <View style={styles.projectCreationGrid}>
          {presets.map((example) => (
            <Pressable key={`preset-${example.id}`} testID={`mobile-workspace-add-preset-${example.id}`} disabled={busy} onPress={() => void run(() => model.addExampleToWorkspace(example, "preset"))} style={optionStyle}>
              <Text style={styles.itemTitle}>{example.title}</Text><Text style={styles.itemMeta}>Preset</Text>
            </Pressable>
          ))}
          {mobileExamples.map((example) => (
            <Pressable key={`example-${example.id}`} testID={`mobile-workspace-add-example-${example.id}`} disabled={busy} onPress={() => void run(() => model.addExampleToWorkspace(example, "example"))} style={optionStyle}>
              <Text style={styles.itemTitle}>{example.title}</Text><Text style={styles.itemMeta}>Example · {example.category}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.projectCreationGroupTitle}>Connect</Text>
        <View style={styles.projectCreationGrid}>
          <Pressable testID="mobile-workspace-add-desktop" onPress={() => unavailable("Desktop object handoff becomes available with the revision-aware MOB67 flow.")} style={optionStyle}>
            <Text style={styles.itemTitle}>From desktop</Text><Text style={styles.itemMeta}>Revision-aware handoff</Text>
          </Pressable>
        </View>
        {message || model.workspaceAddMessage ? <Text testID="mobile-workspace-add-message" style={styles.warningNote}>{message || model.workspaceAddMessage}</Text> : null}
      </ScrollView>
    </View>
  );
};
