import React from "react";
import { Pressable, ScrollView, StatusBar, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { tabs, type MobileAppController } from "./mobileAppController";
import { styles } from "./mobileAppStyles";
import { MobileWorkspaceScreen } from "./MobileWorkspaceScreen";
import { MobileHomeScreen } from "./MobileHomeScreen";
import { MobileProjectsScreen } from "./MobileProjectsScreen";
import { MobileExploreScreen } from "./MobileExploreScreen";
import { MobileSettingsScreen } from "./MobileSettingsScreen";
import { MobileGraphsWorkspace } from "./MobileGraphsWorkspace";
import { MobileGraphGallery } from "./MobileGraphGallery";

export const MobileAppView: React.FC<{ model: MobileAppController }> = ({ model }) => {
  const { tab, setTab } = model;
  return (
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

      {tab === "workspace" && (model.graphDocument ? <MobileGraphsWorkspace key={`${model.graphDocument.identity.id}/${model.graphDocument.metadata.title}`}
        document={model.graphDocument} onChange={model.setGraphDocument} onSave={model.saveGraphProject} message={model.projectActionMessage}
        promotions={model.graphPromotions} onPromotion={model.createGraphPromotion} onGallery={() => model.setGraphGalleryOpen(true)} /> :
        <MobileWorkspaceScreen model={model} />)}

      {tab !== "workspace" && <ScrollView contentContainerStyle={styles.content}>
        {tab === "home" && <MobileHomeScreen model={model} />}
        {tab === "projects" && <MobileProjectsScreen model={model} />}
        {tab === "explore" && <MobileExploreScreen model={model} />}
        {tab === "settings" && <MobileSettingsScreen model={model} />}
      </ScrollView>}

      {model.graphGalleryOpen && <MobileGraphGallery onClose={() => model.setGraphGalleryOpen(false)} onOpen={model.openGraphGalleryPreset}
        busy={model.graphGalleryBusy} message={model.graphGalleryMessage} />}
      <View style={styles.bottomNav} accessibilityRole="tablist">
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
      </View>
    </SafeAreaView>
  );
};
