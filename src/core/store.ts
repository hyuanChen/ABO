import { create } from "zustand";

export interface Task {
  id: string;
  label: string;
  done: boolean;
  xp: number;
  skill: string | null;
}

export interface AboConfig {
  vault_path: string;
  is_configured: boolean;
}

// ── Toast system ──────────────────────────────────────────────────────────────

export type ToastKind = "info" | "error" | "success";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  subtitle?: string;
  duration?: number; // ms, default 3500
}

export type ActiveTab =
  | "overview"
  | "literature"
  | "arxiv"
  | "meeting"
  | "ideas"
  | "health"
  | "podcast"
  | "trends"
  | "claude"
  | "settings";

interface AboStore {
  config: AboConfig | null;
  tasks: Task[];
  activeTab: ActiveTab;
  darkMode: boolean;
  toasts: Toast[];

  setConfig: (c: AboConfig) => void;
  setTasks: (t: Task[]) => void;
  setActiveTab: (t: ActiveTab) => void;
  toggleDarkMode: () => void;
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

export const useStore = create<AboStore>((set) => ({
  config: null,
  tasks: [],
  activeTab: "overview",
  darkMode: false,
  toasts: [],

  setConfig: (config) => set({ config }),
  setTasks: (tasks) => set({ tasks }),
  setActiveTab: (activeTab) => set({ activeTab }),
  toggleDarkMode: () =>
    set((s) => {
      const next = !s.darkMode;
      document.documentElement.classList.toggle("dark", next);
      return { darkMode: next };
    }),
  addToast: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: crypto.randomUUID() }],
    })),
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
