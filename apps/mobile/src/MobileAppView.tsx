import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { tabs, type MobileAppController } from "./mobileAppController";
import { styles } from "./mobileAppStyles";
import { MobileWorkspaceScreen } from "./MobileWorkspaceScreen";
import { MobileHomeScreen } from "./MobileHomeScreen";
import { MobileProjectsScreen } from "./MobileProjectsScreen";
import { MobileExploreScreen } from "./MobileExploreScreen";
import { MobileSettingsScreen } from "./MobileSettingsScreen";
import { MobileSurfaceWorkspace } from "./MobileSurfaceWorkspace";
import { MobileCurveWorkspace } from "./MobileCurveWorkspace";
import { MobileGraphsWorkspace } from "./MobileGraphsWorkspace";
import { MobileGraphGallery } from "./MobileGraphGallery";
import { mobileExamples } from "./data/mobileSeedData";

export const MobileAppView: React.FC<{ model: MobileAppController }> = ({ model }) => {
  const { tab, setTab } = model;
  const [graphPresentation, setGraphPresentation] = useState(false);
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : "height"}
      enabled={tab !== "workspace" && !model.graphGalleryOpen}>
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f6f8" translucent={false} />
      {!(tab === "workspace" && model.graphDocument) && <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Math3D</Text>
            <Text style={styles.subtitle}>{tab === "workspace" ? "Workspace" : "Mobile workspace"}</Text>
          </View>
        </View>
      </View>}

      {tab === "workspace" && (model.surfaceDocument && model.projectSurfaceAdapter ? <MobileSurfaceWorkspace key={model.surfaceDocument.identity.id}
        document={model.surfaceDocument} adapter={model.projectSurfaceAdapter} onChange={model.setSurfaceDocument} onSave={model.saveSurfaceProject} message={model.projectActionMessage} /> : model.curveDocument && model.projectCurveAdapter ? <MobileCurveWorkspace key={model.curveDocument.identity.id}
        document={model.curveDocument} adapter={model.projectCurveAdapter} onChange={model.setCurveDocument} onSave={model.saveCurveProject} message={model.projectActionMessage} /> : model.graphDocument ? <MobileGraphsWorkspace key={`${model.graphDocument.identity.id}/${model.graphDocument.metadata.title}`}
        document={model.graphDocument} onChange={model.setGraphDocument} onSave={model.saveGraphProject} message={model.projectActionMessage}
        sessionAdapter={model.projectGraphAdapter} pointTables={model.projectGraphTables}
        promotions={model.graphPromotions} onPromotion={model.createGraphPromotion} onGallery={() => model.setGraphGalleryOpen(true)}
        onPresentationChange={setGraphPresentation} /> :
        <MobileWorkspaceScreen model={model} />)}

      {tab !== "workspace" && <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab === "home" && <MobileHomeScreen model={model} />}
        {tab === "projects" && <MobileProjectsScreen model={model} />}
        {tab === "explore" && <MobileExploreScreen model={model} />}
        {tab === "settings" && <MobileSettingsScreen model={model} />}
      </ScrollView>}

      {model.graphGalleryOpen && <MobileGraphGallery onClose={() => model.setGraphGalleryOpen(false)} onOpen={model.openGraphGalleryPreset}
        relatedSurfaceAvailable={id => { const item=mobileExamples.find(example=>example.id===id); return !!item && model.isExampleAvailable(item); }}
        onRelatedSurface={async id => { const item=mobileExamples.find(example=>example.id===id);
          if (!item || !model.isExampleAvailable(item)) return false;
          if (model.graphDocument && !await model.saveGraphProject()) return false;
          model.setGraphGalleryOpen(false); model.openViewerWithExample(item); return true; }}
        personalProjects={model.storedProjects.filter(p=>p.projectType==="graph2d")} currentGraph={model.graphDocument}
        projectFavorites={model.graphProjectFavorites.ids} favoritesError={model.graphProjectFavoritesError} onFavorite={model.favoriteGraphProject}
        onResetFavorites={model.resetGraphProjectFavorites} onPersonalOpen={model.openPersonalGraphProject}
        importPreview={model.graphGalleryImportPreview} onPreviewImport={model.previewPersonalGraphFile}
        onAcceptImport={model.acceptPersonalGraphImport} onCancelImport={() => model.setGraphGalleryImportPreview(null)}
        onExportPersonal={model.exportPersonalGraphProject} onShareDefinition={model.sharePersonalGraphDefinition}
        busy={model.graphGalleryBusy} message={model.graphGalleryMessage} />}
      {!(tab === "workspace" && model.graphDocument && graphPresentation) && <View style={styles.bottomNav} accessibilityRole="tablist">
        {tabs.map(({ key, label }) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={[styles.bottomNavItem, tab === key ? styles.bottomNavItemActive : null]}
          >
            <Text style={[styles.bottomNavText, tab === key ? styles.bottomNavTextActive : null]}>{label}</Text>
          </Pressable>
        ))}
      </View>}
    </SafeAreaView>
    </KeyboardAvoidingView>
  );
};
