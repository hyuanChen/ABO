import { useStore } from "../core/store";
import Feed from "./feed/Feed";
import FeedSidebar from "./feed/FeedSidebar";
import Literature from "./literature/Literature";
import Journal from "./journal/Journal";
import ClaudePanel from "./claude-panel/ClaudePanel";
import Profile from "./profile/Profile";
import ArxivTracker from "./arxiv/ArxivTracker";
import HealthDashboard from "./health/HealthDashboard";
import Settings from "./settings/Settings";
import BubbleVault from "./vault/BubbleVault";

export default function MainContent() {
  const activeTab = useStore((s) => s.activeTab);
  const feedModules = useStore((s) => s.feedModules);

  // Overview tab with feed sidebar (only if modules exist)
  if (activeTab === "overview") {
    const hasModules = feedModules.length > 0;
    return (
      <main
        style={{
          flex: 1,
          minHeight: 0,
          height: "100%",
          display: "grid",
          gridTemplateColumns: hasModules ? "clamp(180px, 20vw, 240px) 1fr" : "1fr",
          gap: 0,
          overflow: "hidden",
          background: "var(--bg-app)",
        }}
      >
        {/* Feed Sidebar - Only show if modules exist */}
        {hasModules && (
          <div
            className="hide-mobile"
            style={{
              borderRight: "1px solid var(--border-light)",
              background: "var(--bg-sidebar)",
              backdropFilter: "blur(16px)",
              overflow: "hidden",
            }}
          >
            <FeedSidebar />
          </div>
        )}

        {/* Feed Content */}
        <div
          style={{
            minWidth: 0,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <Feed />
        </div>
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
      {activeTab === "claude"     && <ClaudePanel />}
      {activeTab === "arxiv"      && <ArxivTracker />}
      {activeTab === "health"     && <HealthDashboard />}
      {activeTab === "settings"   && <Settings />}
    </main>
  );
}
