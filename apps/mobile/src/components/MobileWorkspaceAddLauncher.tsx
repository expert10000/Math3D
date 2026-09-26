import React, { useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { mobileExamples } from "../data/mobileSeedData";
import type { MobileAppController } from "../mobileAppController";
import { styles } from "../mobileAppStyles";
import type { MobileSceneObjectImportPreview } from "../models/mobileSceneObjectImport";
import type { MobileMeshImportPreview } from "../models/mobileMeshImport";
import { mobileWorkspaceAddLayout } from "../models/mobileWorkspaceAdd";

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
          <Pressable testID="mobile-workspace-add-from-project" onPress={() => unavailable("Object selection from another project becomes available with MOB64.")} style={optionStyle}>
            <Text style={styles.itemTitle}>Objects from project</Text><Text style={styles.itemMeta}>Copy compatible objects</Text>
          </Pressable>
        </View>
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
        {message ? <Text testID="mobile-workspace-add-message" style={styles.warningNote}>{message}</Text> : null}
      </ScrollView>
    </View>
  );
};
