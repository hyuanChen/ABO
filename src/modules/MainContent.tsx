import { useStore } from "../core/store";
import Feed from "./feed/Feed";
import Literature from "./literature/Literature";
import Journal from "./journal/Journal";
import { ChatPanel } from "./claude-panel/ChatPanel";
import Profile from "./profile/Profile";
import ArxivTracker from "./arxiv/ArxivTracker";
import HealthDashboard from "./health/HealthDashboard";
import Settings from "./settings/Settings";
import BubbleVault from "./vault/BubbleVault";
import ModulePanel from "./feed/ModulePanel";

export default function MainContent() {
  const activeTab = useStore((s) => s.activeTab);

  // Overview tab with feed
  if (activeTab === "overview") {
    return (
      <main
        style={{
          flex: 1,
          minHeight: 0,
          height: "100%",
          overflow: "hidden",
          background: "var(--bg-app)",
        }}
      >
        <Feed />
      </main>
    );
  }

  // Other tabs
  return (
    <main
      style={{
        flex: 1,
        height: "100%",
        overflow: "hidden",
        background: "var(--bg-app)",
        position: "relative",
      }}
    >
      {activeTab === "profile"    && <Profile />}
      {activeTab === "vault"      && <BubbleVault />}
      {activeTab === "literature" && <Literature />}
      {activeTab === "journal"    && <Journal />}
      {activeTab === "claude"     && <ChatPanel />}
      {activeTab === "arxiv"      && <ArxivTracker />}
      {activeTab === "health"     && <HealthDashboard />}
      {activeTab === "settings"   && <Settings />}
      {activeTab === "modules"    && <ModulePanel />}
    </main>
  );
}
