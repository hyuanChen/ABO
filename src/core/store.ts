import { create } from "zustand";

export interface EnergyState {
  current: number;
  max: number;
  lastUpdated: string;
  log: Array<{ time: string; delta: number; reason: string }>;
}

export interface GameState {
  energy: EnergyState;
  skills: Record<string, unknown>;
  achievements: string[];
  level: number;
  title: string;
}

export interface AboConfig {
  vault_path: string;
  is_configured: boolean;
}

interface AboStore {
  config: AboConfig | null;
  gameState: GameState | null;
  activeTab: "literature" | "mindmap" | "claude";
  darkMode: boolean;

  setConfig: (c: AboConfig) => void;
  setGameState: (g: GameState) => void;
  setActiveTab: (t: AboStore["activeTab"]) => void;
  toggleDarkMode: () => void;
}

export const useStore = create<AboStore>((set) => ({
  config: null,
  gameState: null,
  activeTab: "literature",
  darkMode: false,

  setConfig: (config) => set({ config }),
  setGameState: (gameState) => set({ gameState }),
  setActiveTab: (activeTab) => set({ activeTab }),
  toggleDarkMode: () =>
    set((s) => {
      const next = !s.darkMode;
      document.documentElement.classList.toggle("dark", next);
      return { darkMode: next };
    }),
}));
