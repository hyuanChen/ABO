import { useEffect } from "react";
import NavSidebar from "./modules/nav/NavSidebar";
import MainContent from "./modules/MainContent";
import ToastContainer from "./components/Toast";
import { useStore } from "./core/store";
import { api } from "./core/api";

export default function App() {
  const setConfig = useStore((s) => s.setConfig);

  useEffect(() => {
    api.get<{ vault_path: string; literature_path?: string; version: string }>("/api/config")
      .then(setConfig)
      .catch(() => {});
  }, [setConfig]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        display: "flex",
        overflow: "hidden",
        background: "var(--bg-app)",
        fontFamily: "'Nunito', 'M PLUS Rounded 1c', sans-serif",
      }}
    >
      <NavSidebar />
      <main
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          overflow: "hidden",
          position: "relative",
          background: "linear-gradient(135deg, var(--bg-app) 0%, rgba(188, 164, 227, 0.03) 100%)",
        }}
      >
        {/* Subtle background decoration */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: `
              radial-gradient(ellipse 80% 50% at 20% 40%, rgba(188, 164, 227, 0.06) 0%, transparent 50%),
              radial-gradient(ellipse 60% 40% at 80% 60%, rgba(255, 183, 178, 0.04) 0%, transparent 50%)
            `,
          }}
        />
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <MainContent />
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}
