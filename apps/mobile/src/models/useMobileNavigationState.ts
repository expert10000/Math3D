import { useState } from "react";

export type MobileTab = "home" | "explore" | "workspace" | "files" | "settings";
export type ExploreSection = "gallery" | "functions" | "learn";
export type InspectorSection = "scene" | "object" | "display" | "analyze";

export const useMobileNavigationState = () => {
  const [tab, setTab] = useState<MobileTab>("workspace");
  const [exploreSection, setExploreSection] = useState<ExploreSection>("gallery");
  const [inspectorSection, setInspectorSection] = useState<InspectorSection>("object");
  const [inspectorExpanded, setInspectorExpanded] = useState(false);
  return { tab, setTab, exploreSection, setExploreSection, inspectorSection, setInspectorSection, inspectorExpanded, setInspectorExpanded };
};
