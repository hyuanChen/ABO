import { useStore } from "../core/store";
import Feed from "./feed/Feed";
import FeedSidebar from "./feed/FeedSidebar";
import Literature from "./literature/Literature";
import MindMap from "./ideas/MindMap";
import ClaudePanel from "./claude-panel/ClaudePanel";
import ArxivTracker from "./arxiv/ArxivTracker";
import MeetingGenerator from "./meeting/MeetingGenerator";
import HealthDashboard from "./health/HealthDashboard";
import PodcastDigest from "./podcast/PodcastDigest";
import TrendTracker from "./trends/TrendTracker";
import Settings from "./settings/Settings";

export default function MainContent() {
  const activeTab = useStore((s) => s.activeTab);

  if (activeTab === "overview") {
    return (
      <main className="flex-1 min-h-0 flex overflow-hidden h-full bg-slate-50 dark:bg-slate-950">
        <FeedSidebar />
        <div className="flex-1 min-w-0 overflow-hidden">
          <Feed />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {activeTab === "literature" && <Literature />}
      {activeTab === "ideas"      && <MindMap />}
      {activeTab === "claude"     && <ClaudePanel />}
      {activeTab === "arxiv"      && <ArxivTracker />}
      {activeTab === "meeting"    && <MeetingGenerator />}
      {activeTab === "health"     && <HealthDashboard />}
      {activeTab === "podcast"    && <PodcastDigest />}
      {activeTab === "trends"     && <TrendTracker />}
      {activeTab === "settings"   && <Settings />}
    </main>
  );
}
