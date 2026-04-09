import { create } from "zustand";

// ── 类型定义 ──────────────────────────────────────────────────────

export type ActiveTab =
  | "profile"
  | "overview"
  | "literature"
  | "arxiv"
  | "journal"
  | "health"
  | "claude"
  | "chat"
  | "vault"
  | "wiki"
  | "settings"
  | "modules"
  | "xiaohongshu"
  | "bilibili"
  | "arxiv-api"
  | "dashboard";

export type ToastKind = "info" | "error" | "success";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
}

export interface AppConfig {
  vault_path: string;
  literature_path?: string;
  version: string;
}

export interface FeedCard {
  id: string;
  title: string;
  summary: string;
  score: number;
  tags: string[];
  source_url: string;
  obsidian_path: string;
  module_id: string;
  created_at: number;
  read: boolean;
  category?: string;
  metadata: Record<string, unknown>;
}

export interface FeedModule {
  id: string;
  name: string;
  icon: string;
  schedule: string;
  enabled: boolean;
  next_run: string | null;
}

export interface DimStat {
  score: number;
  grade: "E" | "D" | "C" | "B" | "A";
  raw: Record<string, unknown>;
}

export interface ProfileStats {
  research: DimStat;
  output: DimStat;
  health: DimStat;
  learning: DimStat;
  san: DimStat;
  happiness: DimStat;
}

// ── Phase 2-3: Gamification & Preferences ─────────────────────────

export interface GameStats {
  happiness: number;
  san_7d_avg: number;
  energy: number;
  todos_completed: number;
  achievements: Array<{ id: string; name: string; unlocked_at: string }>;
}

export interface KeywordPreference {
  keyword: string;
  score: number;
  count: number;
  source_modules: string[];
  last_updated: string;
}

export type FeedSortMode = "default" | "prioritized" | "mixed";

export interface RewardNotification {
  id: string;
  action: string;
  xp: number;
  happiness_delta: number;
  san_delta: number;
  message: string;
}

// ArXiv Tracker Crawl State
export interface ArxivCrawlProgress {
  current: number;
  total: number;
  phase: "fetching" | "processing" | "complete";
  message?: string;
  currentPaperTitle?: string;
}

export interface ArxivPaper {
  id: string;
  title: string;
  summary: string;
  score: number;
  tags: string[];
  source_url: string;
  metadata: Record<string, unknown>;
}

// ── Store ─────────────────────────────────────────────────────────

interface AboStore {
  // 导航
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // 配置
  config: AppConfig | null;
  setConfig: (config: AppConfig) => void;

  // Feed
  feedCards: FeedCard[];
  feedModules: FeedModule[];
  activeModuleFilter: string | null;
  unreadCounts: Record<string, number>;
  setFeedCards: (cards: FeedCard[]) => void;
  prependCard: (card: FeedCard) => void;
  setFeedModules: (modules: FeedModule[]) => void;
  setActiveModuleFilter: (id: string | null) => void;
  setUnreadCounts: (counts: Record<string, number>) => void;

  // Profile
  profileEnergy: number;
  profileSan: number;
  profileMotto: string;
  profileStats: ProfileStats | null;
  setProfileEnergy: (e: number) => void;
  setProfileSan: (s: number) => void;
  setProfileMotto: (m: string) => void;
  setProfileStats: (s: ProfileStats) => void;

  // Phase 2-3: Gamification
  gameStats: GameStats | null;
  todayXP: number;
  totalXP: number;
  level: number;
  setGameStats: (s: GameStats) => void;
  addXP: (xp: number) => void;

  // Phase 2: Preferences
  keywordPrefs: Record<string, KeywordPreference>;
  feedSortMode: FeedSortMode;
  setKeywordPrefs: (prefs: Record<string, KeywordPreference>) => void;
  setFeedSortMode: (mode: FeedSortMode) => void;

  // Phase 4: Reward Notifications
  rewardQueue: RewardNotification[];
  addReward: (r: Omit<RewardNotification, "id">) => void;
  dismissReward: (id: string) => void;

  // Module configuration
  moduleToConfigure: string | null;
  setModuleToConfigure: (id: string | null) => void;
  moduleHistoryId: string | null;
  setModuleHistoryId: (id: string | null) => void;

  // ArXiv Tracker State (persisted across tab switches)
  arxivAndPapers: ArxivPaper[];
  arxivOrPapers: ArxivPaper[];
  arxivAndCrawling: boolean;
  arxivOrCrawling: boolean;
  arxivAndProgress: ArxivCrawlProgress | null;
  arxivOrProgress: ArxivCrawlProgress | null;
  arxivAndKeywords: string;
  arxivOrKeywords: string;
  setArxivAndPapers: (papers: ArxivPaper[]) => void;
  setArxivOrPapers: (papers: ArxivPaper[]) => void;
  setArxivAndCrawling: (crawling: boolean) => void;
  setArxivOrCrawling: (crawling: boolean) => void;
  setArxivAndProgress: (progress: ArxivCrawlProgress | null) => void;
  setArxivOrProgress: (progress: ArxivCrawlProgress | null) => void;
  setArxivAndKeywords: (keywords: string) => void;
  setArxivOrKeywords: (keywords: string) => void;
  appendArxivAndPaper: (paper: ArxivPaper) => void;
  appendArxivOrPaper: (paper: ArxivPaper) => void;

  // Toast
  toasts: Toast[];
  addToast: (t: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

export const useStore = create<AboStore>((set) => ({
  activeTab: "overview",
  setActiveTab: (activeTab) => set({ activeTab }),

  config: null,
  setConfig: (config) => set({ config }),

  feedCards: [],
  feedModules: [],
  activeModuleFilter: null,
  unreadCounts: {},
  setFeedCards: (feedCards) => set({ feedCards }),
  prependCard: (card) => set((s) => ({ feedCards: [card, ...s.feedCards] })),
  setFeedModules: (feedModules) => set({ feedModules }),
  setActiveModuleFilter: (activeModuleFilter) => set({ activeModuleFilter }),
  setUnreadCounts: (unreadCounts) => set({ unreadCounts }),

  profileEnergy: 70,
  profileSan: 0,
  profileMotto: "",
  profileStats: null,
  setProfileEnergy: (profileEnergy) => set({ profileEnergy }),
  setProfileSan: (profileSan) => set({ profileSan }),
  setProfileMotto: (profileMotto) => set({ profileMotto }),
  setProfileStats: (profileStats) => set({ profileStats }),

  // Phase 2-3: Gamification
  gameStats: null,
  todayXP: 0,
  totalXP: 0,
  level: 1,
  setGameStats: (gameStats) => set({ gameStats }),
  addXP: (xp) => set((s) => {
    const newTodayXP = s.todayXP + xp;
    const newTotalXP = s.totalXP + xp;
    const newLevel = Math.floor(newTotalXP / 100) + 1;
    return { todayXP: newTodayXP, totalXP: newTotalXP, level: newLevel };
  }),

  // Phase 2: Preferences
  keywordPrefs: {},
  feedSortMode: "default",
  setKeywordPrefs: (keywordPrefs) => set({ keywordPrefs }),
  setFeedSortMode: (feedSortMode) => set({ feedSortMode }),

  // Phase 4: Reward Notifications
  rewardQueue: [],
  addReward: (r) => set((s) => ({
    rewardQueue: [...s.rewardQueue, { ...r, id: crypto.randomUUID() }],
  })),
  dismissReward: (id) => set((s) => ({
    rewardQueue: s.rewardQueue.filter((r) => r.id !== id),
  })),

  // Module configuration
  moduleToConfigure: null,
  setModuleToConfigure: (moduleToConfigure) => set({ moduleToConfigure }),
  moduleHistoryId: null,
  setModuleHistoryId: (moduleHistoryId) => set({ moduleHistoryId }),

  // ArXiv Tracker State
  arxivAndPapers: [],
  arxivOrPapers: [],
  arxivAndCrawling: false,
  arxivOrCrawling: false,
  arxivAndProgress: null,
  arxivOrProgress: null,
  arxivAndKeywords: "",
  arxivOrKeywords: "",
  setArxivAndPapers: (arxivAndPapers) => set({ arxivAndPapers }),
  setArxivOrPapers: (arxivOrPapers) => set({ arxivOrPapers }),
  setArxivAndCrawling: (arxivAndCrawling) => set({ arxivAndCrawling }),
  setArxivOrCrawling: (arxivOrCrawling) => set({ arxivOrCrawling }),
  setArxivAndProgress: (arxivAndProgress) => set({ arxivAndProgress }),
  setArxivOrProgress: (arxivOrProgress) => set({ arxivOrProgress }),
  setArxivAndKeywords: (arxivAndKeywords) => set({ arxivAndKeywords }),
  setArxivOrKeywords: (arxivOrKeywords) => set({ arxivOrKeywords }),
  appendArxivAndPaper: (paper) =>
    set((s) => ({ arxivAndPapers: [...s.arxivAndPapers, paper] })),
  appendArxivOrPaper: (paper) =>
    set((s) => ({ arxivOrPapers: [...s.arxivOrPapers, paper] })),

  toasts: [],
  addToast: (t) =>
    set((s) => ({
      toasts: [...s.toasts, { ...t, id: crypto.randomUUID() }],
    })),
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
