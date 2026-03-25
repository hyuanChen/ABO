import { useStore } from "../core/store";
import Overview from "./overview/Overview";
import Literature from "./literature/Literature";
import MindMap from "./mindmap/MindMap";
import ClaudePanel from "./claude-panel/ClaudePanel";
import Settings from "./settings/Settings";
import ArxivTracker from "./arxiv/ArxivTracker";
import MeetingGenerator from "./meeting/MeetingGenerator";
import HealthDashboard from "./health/HealthDashboard";
import PodcastDigest from "./podcast/PodcastDigest";
import TrendTracker from "./trends/TrendTracker";

export default function MainContent() {
  const activeTab = useStore((s) => s.activeTab);

  return (
    <main className="flex-1 min-h-0 bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {activeTab === "overview"   && <Overview />}
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
