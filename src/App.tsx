import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import NavSidebar from "./modules/nav/NavSidebar";
import MainContent from "./modules/MainContent";
import ToastContainer from "./components/Toast";
import RewardNotificationContainer from "./components/RewardNotification";
import OnboardingWizard from "./modules/onboarding/OnboardingWizard";
import { CommandPalette } from "./components/CommandPalette";
import { GlobalSearch } from "./components/Search";
import WindowDragHandle from "./components/WindowDragHandle";
import HealthReminderDaemon from "./components/HealthReminderDaemon";
import { useStore, FeedModule } from "./core/store";
import { api } from "./core/api";
import { bilibiliCancelAllKnownTasks, bilibiliCancelAllKnownTasksSilently } from "./api/bilibili";
import AppErrorBoundary from "./components/AppErrorBoundary";

interface AppConfig {
  vault_path: string;
  literature_path?: string;
  version: string;
  paper_ai_scoring_enabled?: boolean;
  intelligence_delivery_enabled?: boolean;
  intelligence_delivery_time?: string;
  onboarding_completed?: boolean;
  onboarding_step?: number;
  feed_preferences?: {
    hidden_module_ids?: string[];
    group_mode?: "timeline" | "smart";
    show_recommendations?: boolean;
  };
}

export default function App() {
  const setConfig = useStore((s) => s.setConfig);
  const setFeedModules = useStore((s) => s.setFeedModules);
  const showcaseMode = useStore((s) => s.showcaseMode);
  const activeTab = useStore((s) => s.activeTab);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sync showcase class on mount and changes
  useEffect(() => {
    document.documentElement.classList.toggle("showcase", showcaseMode);
  }, [showcaseMode]);

  // Check onboarding status on mount.
  // First-run users should see the wizard unless config explicitly marks it completed.
  useEffect(() => {
    const loadAppConfig = () => api.get<AppConfig>("/api/config")
      .then((config) => {
        setConfig(config);
        setOnboardingCompleted(config.onboarding_completed ?? false);
      })
      .catch(() => {
        setOnboardingCompleted(false);
      })
      .finally(() => {
        setIsLoading(false);
      });

    void loadAppConfig();

    const handleOnboardingConfigChange = () => {
      setIsLoading(true);
      void loadAppConfig();
    };
    window.addEventListener("abo:onboarding-status-updated", handleOnboardingConfigChange);
    return () => {
      window.removeEventListener("abo:onboarding-status-updated", handleOnboardingConfigChange);
    };
  }, [setConfig]);

  // Load modules on app start so FeedSidebar shows all modules
  useEffect(() => {
    if (onboardingCompleted) {
      api.get<{ modules: FeedModule[] }>("/api/modules")
        .then((r) => setFeedModules(r.modules))
        .catch(() => {});
    }
  }, [setFeedModules, onboardingCompleted]);

  const handleOnboardingComplete = () => {
    setOnboardingCompleted(true);
    // Load modules after onboarding
    api.get<{ modules: FeedModule[] }>("/api/modules")
      .then((r) => setFeedModules(r.modules))
      .catch(() => {});
  };

  useEffect(() => {
    const handleBrowserPageHide = () => {
      bilibiliCancelAllKnownTasksSilently();
    };
    window.addEventListener("pagehide", handleBrowserPageHide);

    let disposed = false;
    let unlisten: (() => void) | undefined;
    let closing = false;
    const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    if (isTauriRuntime) {
      void getCurrentWindow()
        .onCloseRequested(async (event) => {
          if (closing) {
            return;
          }
          closing = true;
          event.preventDefault();
          try {
            await Promise.race([
              bilibiliCancelAllKnownTasks(),
              new Promise((resolve) => window.setTimeout(resolve, 1200)),
            ]);
          } catch {
            bilibiliCancelAllKnownTasksSilently();
          } finally {
            await getCurrentWindow().destroy().catch(() => {});
          }
        })
        .then((cleanup) => {
          if (disposed) {
            cleanup();
            return;
          }
          unlisten = cleanup;
        })
        .catch(() => {});
    }

    return () => {
      disposed = true;
      window.removeEventListener("pagehide", handleBrowserPageHide);
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // Show loading state while checking onboarding status
  if (isLoading || onboardingCompleted === null) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-app)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              border: "3px solid var(--border-light)",
              borderTopColor: "var(--color-primary)",
              animation: "spin 1s linear infinite",
            }}
          />
          <p style={{ fontSize: "0.9375rem", color: "var(--text-muted)" }}>加载中...</p>
        </div>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Show onboarding wizard if not completed
  if (!onboardingCompleted) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} />;
  }

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
      <WindowDragHandle />
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
          <AppErrorBoundary resetKey={activeTab}>
            <MainContent />
          </AppErrorBoundary>
        </div>
      </main>
      <ToastContainer />
      <HealthReminderDaemon />
      <RewardNotificationContainer />
      <CommandPalette />
      <GlobalSearch />
    </div>
  );
}
