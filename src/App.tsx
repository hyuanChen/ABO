import { useEffect } from "react";
import NavSidebar from "./modules/nav/NavSidebar";
import MainContent from "./modules/MainContent";
import ToastContainer from "./components/Toast";
import { useStore } from "./core/store";
import { api } from "./core/api";

export default function App() {
  const setConfig = useStore((s) => s.setConfig);

  useEffect(() => {
    api.get<{ vault_path: string; version: string }>("/api/config")
      .then(setConfig)
      .catch(() => {});
  }, [setConfig]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <NavSidebar />
      <div className="flex-1 min-w-0 overflow-hidden">
        <MainContent />
      </div>
      <ToastContainer />
    </div>
  );
}
