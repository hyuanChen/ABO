import { useEffect, useState } from "react";

export type DayPhase = "morning" | "day" | "sunset" | "night";

export function getDayPhase(date = new Date()): DayPhase {
  const hour = date.getHours();

  if (hour >= 6 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "sunset";
  return "night";
}

export function useDayPhase(refreshMs = 60_000): DayPhase {
  const [phase, setPhase] = useState<DayPhase>(() => getDayPhase());

  useEffect(() => {
    const update = () => setPhase(getDayPhase());
    update();

    const timer = window.setInterval(update, refreshMs);
    return () => window.clearInterval(timer);
  }, [refreshMs]);

  return phase;
}
