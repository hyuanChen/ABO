import { useEffect, useState } from "react";
import NavSidebar from "./modules/nav/NavSidebar";
import MainContent from "./modules/MainContent";
import ToastContainer from "./components/Toast";
import RewardNotificationContainer from "./components/RewardNotification";
import OnboardingWizard from "./modules/onboarding/OnboardingWizard";
import { CommandPalette } from "./components/CommandPalette";
import { GlobalSearch } from "./components/Search";
import { useStore, FeedModule } from "./core/store";
import { api } from "./core/api";

interface AppConfig {
  vault_path: string;
  literature_path?: string;
  version: string;
  onboarding_completed?: boolean;
}

export default function App() {
  const setConfig = useStore((s) => s.setConfig);
  const setFeedModules = useStore((s) => s.setFeedModules);
  const showcaseMode = useStore((s) => s.showcaseMode);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sync showcase class on mount and changes
  useEffect(() => {
    document.documentElement.classList.toggle("showcase", showcaseMode);
  }, [showcaseMode]);

  // Check onboarding status on mount
  // NOTE: Onboarding is disabled by default for development.
  // Set onboarding_completed to true to skip wizard.
  // To enable onboarding, change the default to false or remove the override.
  useEffect(() => {
    api.get<AppConfig>("/api/config")
      .then((config) => {
        setConfig(config);
        // Default to true to skip onboarding during development
        // Users can manually trigger onboarding from settings later
        setOnboardingCompleted(config.onboarding_completed ?? true);
      })
      .catch(() => {
        // If API fails, skip onboarding (assume development mode)
        setOnboardingCompleted(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
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
      <RewardNotificationContainer />
      <CommandPalette />
      <GlobalSearch />
    </div>
  );
}
