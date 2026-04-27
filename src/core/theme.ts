import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "abo-theme";
const THEME_CHANGE_EVENT = "abo:theme-change";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

function getSystemThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const storedMode = localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(storedMode) ? storedMode : getSystemThemeMode();
}

export function syncThemeMode(mode: ThemeMode = resolveThemeMode()): ThemeMode {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", mode === "dark");
  }
  return mode;
}

export function setThemeMode(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, mode);
  syncThemeMode(mode);
  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_CHANGE_EVENT, { detail: mode }));
}

export function useThemeMode() {
  const [themeMode, setLocalThemeMode] = useState<ThemeMode>(() => syncThemeMode());

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const nextMode = (event as CustomEvent<ThemeMode>).detail;
      setLocalThemeMode(nextMode ?? syncThemeMode());
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      if (!isThemeMode(localStorage.getItem(THEME_STORAGE_KEY))) {
        setLocalThemeMode(syncThemeMode());
      }
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange as EventListener);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleSystemThemeChange);
    } else {
      mediaQuery.addListener(handleSystemThemeChange);
    }

    setLocalThemeMode(syncThemeMode());

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange as EventListener);
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleSystemThemeChange);
      } else {
        mediaQuery.removeListener(handleSystemThemeChange);
      }
    };
  }, []);

  return {
    themeMode,
    isDark: themeMode === "dark",
    setThemeMode,
    toggleTheme: () => setThemeMode(themeMode === "dark" ? "light" : "dark"),
  };
}
