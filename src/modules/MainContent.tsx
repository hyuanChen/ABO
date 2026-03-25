import { useStore } from "../core/store";
import Overview from "./overview/Overview";
import SkillTree from "./skilltree/SkillTree";
import Literature from "./literature/Literature";
import ClaudePanel from "./claude-panel/ClaudePanel";
import MindMap from "./mindmap/MindMap";
import Settings from "./settings/Settings";

export default function MainContent() {
  const activeTab = useStore((s) => s.activeTab);

  return (
    <main className="flex-1 min-h-0 bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {activeTab === "overview"   && <Overview />}
      {activeTab === "skilltree"  && <SkillTree />}
      {activeTab === "literature" && <Literature />}
      {activeTab === "mindmap"    && <MindMap />}
      {activeTab === "claude"     && <ClaudePanel />}
      {activeTab === "settings"   && <Settings />}
    </main>
  );
}
