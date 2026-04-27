import { useEffect } from "react";
import { api } from "../core/api";
import { useStore } from "../core/store";

interface ReminderPreferences {
  notifications_enabled: boolean;
  checkin_reminder_enabled: boolean;
  hydration_reminder_enabled: boolean;
  movement_reminder_enabled: boolean;
  closure_reminder_enabled: boolean;
  review_reminder_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  poll_interval_minutes: number;
}

interface ReminderItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  level: string;
  due_now: boolean;
}

interface ReminderPayload {
  preferences: ReminderPreferences;
  reminders: ReminderItem[];
  phase: { tone: string; label: string; detail: string };
  weekly_review_ready: boolean;
}

function parseTime(text: string): number {
  const [hourText, minuteText] = text.split(":");
  const hour = Number(hourText || "0");
  const minute = Number(minuteText || "0");
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  return hour * 60 + minute;
}

function isQuietHours(start: string, end: string): boolean {
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTime(start);
  const endMinutes = parseTime(end);
  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return current >= startMinutes && current < endMinutes;
  }
  return current >= startMinutes || current < endMinutes;
}

function shouldNotify(id: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const key = `abo_health_reminder_seen:${id}`;
  const lastSeen = localStorage.getItem(key);
  if (lastSeen === today) return false;
  localStorage.setItem(key, today);
  return true;
}

export default function HealthReminderDaemon() {
  const addToast = useStore((s) => s.addToast);

  useEffect(() => {
    let intervalId: number | null = null;
    let cancelled = false;

    async function poll() {
      try {
        const payload = await api.get<ReminderPayload>("/api/health/reminders");
        if (cancelled) return;
        const prefs = payload.preferences;
        if (!prefs.notifications_enabled) return;
        if (isQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end)) return;

        for (const reminder of payload.reminders) {
          if (!reminder.due_now) continue;
          if (!shouldNotify(reminder.id)) continue;

          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(reminder.title, { body: reminder.body, tag: reminder.id });
          } else {
            addToast({ kind: "info", title: reminder.title, message: reminder.body });
          }
        }
      } catch (error) {
        console.error("Failed to poll health reminders", error);
      }
    }

    async function start() {
      await poll();
      let intervalMinutes = 15;
      try {
        const payload = await api.get<ReminderPayload>("/api/health/reminders");
        if (!cancelled) {
          intervalMinutes = payload.preferences.poll_interval_minutes || 15;
        }
      } catch {
        intervalMinutes = 15;
      }

      if (!cancelled) {
        intervalId = window.setInterval(poll, intervalMinutes * 60 * 1000);
      }
    }

    start();
    return () => {
      cancelled = true;
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [addToast]);

  return null;
}
