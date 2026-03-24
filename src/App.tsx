import { useEffect, useState } from "react";
import { api } from "./core/api";
import { useStore, AboConfig, GameState } from "./core/store";
import SetupWizard from "./components/SetupWizard";
import Sidebar from "./modules/sidebar/Sidebar";
import MainContent from "./modules/MainContent";

export default function App() {
  const { config, setConfig, setGameState, darkMode } = useStore();
  const [loading, setLoading] = useState(true);

  // Apply dark class on initial render from store
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // On mount: check config, then load game state
  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.get<AboConfig>("/api/config");
        if (cfg.is_configured) {
          setConfig(cfg);
          const gs = await api.get<GameState>("/api/game/state");
          setGameState(gs);
        }
      } catch {
        // Backend not ready — show setup
      } finally {
        setLoading(false);
      }
    })();
  }, [setConfig, setGameState]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!config?.is_configured) {
    return <SetupWizard />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <MainContent />
    </div>
  );
}
