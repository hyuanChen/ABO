import { create } from "zustand";

export interface EnergyState {
  current: number;
  max: number;
  lastUpdated: string;
  log: Array<{ time: string; delta: number; reason: string }>;
}

export interface GameState {
  energy: EnergyState;
  skills: Record<string, { xp: number; unlocked: boolean }>;
  achievements: string[];
  level: number;
  title: string;
}

export interface SkillDef {
  id: string;
  name: string;
  category: string;
  max_level: number;
  level: number;
  xp_total: number;
  xp_in_level: number;
  xp_for_next: number;
  unlocked: boolean;
  unlocks: string[];
  unlock_condition: Record<string, number> | null;
}

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

export type ActiveTab = "overview" | "literature" | "mindmap" | "claude" | "skilltree";

interface AboStore {
  config: AboConfig | null;
  gameState: GameState | null;
  skills: SkillDef[];
  tasks: Task[];
  activeTab: ActiveTab;
  darkMode: boolean;

  setConfig: (c: AboConfig) => void;
  setGameState: (g: GameState) => void;
  setSkills: (s: SkillDef[]) => void;
  setTasks: (t: Task[]) => void;
  setActiveTab: (t: ActiveTab) => void;
  toggleDarkMode: () => void;
}

export const useStore = create<AboStore>((set) => ({
  config: null,
  gameState: null,
  skills: [],
  tasks: [],
  activeTab: "overview",
  darkMode: false,

  setConfig: (config) => set({ config }),
  setGameState: (gameState) => set({ gameState }),
  setSkills: (skills) => set({ skills }),
  setTasks: (tasks) => set({ tasks }),
  setActiveTab: (activeTab) => set({ activeTab }),
  toggleDarkMode: () =>
    set((s) => {
      const next = !s.darkMode;
      document.documentElement.classList.toggle("dark", next);
      return { darkMode: next };
    }),
}));
