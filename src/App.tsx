import { useEffect, useState } from "react";
import { api } from "./core/api";
import { useStore, AboConfig } from "./core/store";
import SetupWizard from "./components/SetupWizard";
import NavSidebar from "./modules/nav/NavSidebar";
import MainContent from "./modules/MainContent";
import ToastContainer from "./components/Toast";

export default function App() {
  const { config, setConfig, darkMode } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.get<AboConfig>("/api/config");
        if (cfg.is_configured) {
          setConfig(cfg);
        }
      } catch {
        // Backend not reachable yet — show setup
      } finally {
        setLoading(false);
      }
    })();
  }, [setConfig]);

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
    <div className="flex h-screen overflow-hidden">
      <NavSidebar />
      <MainContent />
      <ToastContainer />
    </div>
  );
}
