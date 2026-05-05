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
import { useStore, FeedCard, FeedModule } from "./core/store";
import { api, buildWsUrl } from "./core/api";
import { bilibiliCancelAllKnownTasksSilently } from "./api/bilibili";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { FEED_WS_MESSAGE_EVENT } from "./core/feedRealtime";

const FEED_SYNC_LIMIT = 500;
const FEED_IDLE_SYNC_INTERVAL_MS = 12000;
const FEED_ACTIVE_SYNC_INTERVAL_MS = 3500;
const FEED_ACTIVE_SYNC_BOOST_MS = 30000;

interface AppConfig {
  vault_path: string;
  literature_path?: string;
  version: string;
  ai_provider?: "codex" | "claude";
  claude_code_compat_enabled?: boolean;
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
  const setAiProvider = useStore((s) => s.setAiProvider);
  const addToast = useStore((s) => s.addToast);
  const setFeedModules = useStore((s) => s.setFeedModules);
  const setFeedCards = useStore((s) => s.setFeedCards);
  const prependCard = useStore((s) => s.prependCard);
  const setUnreadCounts = useStore((s) => s.setUnreadCounts);
  const setFeedRealtimeStatus = useStore((s) => s.setFeedRealtimeStatus);
  const showcaseMode = useStore((s) => s.showcaseMode);
  const activeTab = useStore((s) => s.activeTab);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bootError, setBootError] = useState("");
  const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const bootTimeoutMs = isTauriRuntime ? 60_000 : 20_000;
  const bootRetryIntervalMs = isTauriRuntime ? 250 : 150;

  // Sync showcase class on mount and changes
  useEffect(() => {
    document.documentElement.classList.toggle("showcase", showcaseMode);
  }, [showcaseMode]);

  // Check onboarding status on mount.
  // First-run users should see the wizard unless config explicitly marks it completed.
  useEffect(() => {
    const loadAppConfig = async () => {
      try {
        setBootError("");
        const config = await api.waitForGet<AppConfig>("/api/config", {
          timeoutMs: bootTimeoutMs,
          intervalMs: bootRetryIntervalMs,
        });
        setConfig(config);
        setAiProvider(
          config.ai_provider === "claude" && config.claude_code_compat_enabled
            ? "claude"
            : "codex",
        );
        setOnboardingCompleted(config.onboarding_completed ?? false);
      } catch (error) {
        const message = error instanceof Error ? error.message : "后端启动失败";
        setBootError(message);
        setOnboardingCompleted(null);
      } finally {
        setIsLoading(false);
      }
    };

    void loadAppConfig();

    const handleOnboardingConfigChange = () => {
      setIsLoading(true);
      void loadAppConfig();
    };
    window.addEventListener("abo:onboarding-status-updated", handleOnboardingConfigChange);
    return () => {
      window.removeEventListener("abo:onboarding-status-updated", handleOnboardingConfigChange);
    };
  }, [bootRetryIntervalMs, bootTimeoutMs, setAiProvider, setConfig]);

  // Load modules on app start so FeedSidebar shows all modules
  useEffect(() => {
    if (onboardingCompleted) {
      api.get<{ modules: FeedModule[] }>("/api/modules")
        .then((r) => setFeedModules(r.modules))
        .catch(() => {});
    }
  }, [setFeedModules, onboardingCompleted]);

  useEffect(() => {
    if (!onboardingCompleted) return;

    let disposed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let syncTimer: number | null = null;
    let activeSyncBoostUntil = 0;
    const burstSyncTimers = new Set<number>();

    const clearHeartbeat = () => {
      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const clearSyncTimer = () => {
      if (syncTimer !== null) {
        window.clearTimeout(syncTimer);
        syncTimer = null;
      }
    };

    const clearBurstSyncTimers = () => {
      burstSyncTimers.forEach((timerId) => window.clearTimeout(timerId));
      burstSyncTimers.clear();
    };

    const syncFeedState = async () => {
      const [cardsResult, unreadCountsResult] = await Promise.allSettled([
        api.get<{ cards: FeedCard[] }>(`/api/cards?unread_only=true&limit=${FEED_SYNC_LIMIT}`),
        api.get<Record<string, number>>("/api/cards/unread-counts"),
      ]);

      if (cardsResult.status === "fulfilled") {
        setFeedCards(cardsResult.value.cards || []);
      }
      if (unreadCountsResult.status === "fulfilled") {
        setUnreadCounts(unreadCountsResult.value || {});
      }
    };

    const scheduleNextPeriodicSync = () => {
      if (disposed) return;
      clearSyncTimer();
      const nextDelay = Date.now() < activeSyncBoostUntil
        ? FEED_ACTIVE_SYNC_INTERVAL_MS
        : FEED_IDLE_SYNC_INTERVAL_MS;
      syncTimer = window.setTimeout(() => {
        syncTimer = null;
        void syncFeedState().finally(() => {
          scheduleNextPeriodicSync();
        });
      }, nextDelay);
    };

    const startActiveSyncBoost = (durationMs = FEED_ACTIVE_SYNC_BOOST_MS) => {
      activeSyncBoostUntil = Math.max(activeSyncBoostUntil, Date.now() + durationMs);
      scheduleNextPeriodicSync();
    };

    const scheduleSyncBurst = (delays: number[]) => {
      delays.forEach((delayMs) => {
        const timerId = window.setTimeout(() => {
          burstSyncTimers.delete(timerId);
          if (disposed) return;
          void syncFeedState();
        }, delayMs);
        burstSyncTimers.add(timerId);
      });
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) return;
      setFeedRealtimeStatus("reconnecting");
      startActiveSyncBoost(15000);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectRealtimeFeed();
      }, 1500);
    };

    const connectRealtimeFeed = () => {
      if (disposed) return;
      clearHeartbeat();
      setFeedRealtimeStatus(reconnectTimer === null ? "connecting" : "reconnecting");
      ws = new WebSocket(buildWsUrl("/ws/feed"));

      ws.onopen = () => {
        setFeedRealtimeStatus("connected");
        clearHeartbeat();
        startActiveSyncBoost(10000);
        scheduleSyncBurst([400, 1400]);
        heartbeatTimer = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "ping",
              timestamp: new Date().toISOString(),
            }));
          }
        }, 15000);
        void syncFeedState();
      };

      ws.onclose = () => {
        clearHeartbeat();
        if (disposed) return;
        scheduleReconnect();
      };

      ws.onerror = () => {
        if (disposed) return;
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          ws.close();
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "pong") {
            return;
          }
          window.dispatchEvent(new CustomEvent(FEED_WS_MESSAGE_EVENT, { detail: data }));
          if (data.type === "new_card" && data.card) {
            startActiveSyncBoost();
            scheduleSyncBurst([250, 1000, 2500]);
            const nextCard = data.card;
            const store = useStore.getState();
            const alreadyExists = store.feedCards.some((card) => card.id === nextCard.id);
            prependCard(nextCard);
            if (!alreadyExists) {
              setUnreadCounts({
                ...store.unreadCounts,
                [nextCard.module_id]: (store.unreadCounts[nextCard.module_id] || 0) + 1,
              });
            }
          }
          if (
            data.type === "crawl_started"
            || data.type === "crawl_progress"
            || data.type === "s2_progress"
          ) {
            startActiveSyncBoost();
          }
          if (
            data.type === "crawl_complete"
            || data.type === "crawl_error"
            || data.type === "crawl_cancelled"
            || data.type === "s2_complete"
            || data.type === "s2_error"
          ) {
            startActiveSyncBoost(12000);
            scheduleSyncBurst([300, 1200, 3500]);
          }
          if (data.type === "reward_earned") {
            useStore.getState().addReward({
              action: data.action,
              xp: data.rewards?.xp || 0,
              happiness_delta: data.rewards?.happiness_delta || 0,
              san_delta: data.rewards?.san_delta || 0,
              message: data.metadata?.card_title || "",
            });
          }
        } catch {
          // Ignore malformed realtime payloads; the next full sync will correct state.
        }
      };
    };

    connectRealtimeFeed();
    startActiveSyncBoost(10000);
    scheduleNextPeriodicSync();

    const handleWindowFocus = () => {
      startActiveSyncBoost(10000);
      void syncFeedState();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startActiveSyncBoost(10000);
        void syncFeedState();
      }
    };
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      clearHeartbeat();
      clearSyncTimer();
      clearBurstSyncTimers();
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      setFeedRealtimeStatus("disconnected");
      ws?.close();
    };
  }, [
    onboardingCompleted,
    prependCard,
    setFeedCards,
    setFeedRealtimeStatus,
    setUnreadCounts,
  ]);

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
    if (isTauriRuntime) {
      void getCurrentWindow()
        .onCloseRequested(() => {
          // Do not block native close. Page-leave-safe cancellation already uses sendBeacon/keepalive.
          bilibiliCancelAllKnownTasksSilently();
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

  useEffect(() => {
    if (!bootError) {
      return;
    }
    addToast({
      kind: "error",
      title: "ABO 后端未就绪",
      message: bootError,
    });
  }, [addToast, bootError]);

  // Show loading state while checking onboarding status
  if (isLoading) {
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
        <WindowDragHandle />
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
          {isTauriRuntime ? (
            <p
              style={{
                margin: 0,
                maxWidth: "320px",
                textAlign: "center",
                fontSize: "0.84rem",
                lineHeight: 1.6,
                color: "var(--text-secondary)",
              }}
            >
              正在连接本地后端。首次冷启动会稍慢；刚关闭后重开通常会更快。
            </p>
          ) : null}
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

  if (bootError) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-app)",
          padding: "24px",
        }}
      >
        <WindowDragHandle />
        <div
          style={{
            maxWidth: "520px",
            width: "100%",
            padding: "28px",
            borderRadius: "24px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-light)",
            boxShadow: "var(--shadow-soft)",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.3rem", color: "var(--text-main)" }}>ABO 启动失败</h1>
          <p style={{ margin: 0, fontSize: "0.92rem", lineHeight: 1.7, color: "var(--text-secondary)" }}>
            桌面壳已经打开，但本地后端服务还没准备好。打包版会自动拉起本地后端；如果等待约 1 分钟后仍然报错，再优先检查 sidecar 是否缺失或被 macOS 拦截执行。
          </p>
          <code
            style={{
              padding: "12px 14px",
              borderRadius: "14px",
              background: "var(--bg-hover)",
              color: "var(--text-main)",
              fontSize: "0.82rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {bootError}
          </code>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setBootError("");
              setOnboardingCompleted(null);
              window.dispatchEvent(new Event("abo:onboarding-status-updated"));
            }}
            style={{
              alignSelf: "flex-start",
              padding: "10px 16px",
              borderRadius: "999px",
              border: "none",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            重试启动
          </button>
        </div>
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
