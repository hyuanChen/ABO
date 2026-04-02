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
  | "vault"
  | "settings"
  | "modules";

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

  // Module configuration
  moduleToConfigure: string | null;
  setModuleToConfigure: (id: string | null) => void;

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

  // Module configuration
  moduleToConfigure: null,
  setModuleToConfigure: (moduleToConfigure) => set({ moduleToConfigure }),

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
