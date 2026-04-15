import type { ModuleConfig } from "../../types/module";

export interface ModuleUsageMetrics {
  unreadCount: number;
  readCount: number;
  viewCount7d: number;
  saveCount7d: number;
  likeCount7d: number;
  lastCardAt: number | null;
}

export const EMPTY_MODULE_USAGE_METRICS: ModuleUsageMetrics = {
  unreadCount: 0,
  readCount: 0,
  viewCount7d: 0,
  saveCount7d: 0,
  likeCount7d: 0,
  lastCardAt: null,
};

export function normalizeDateValue(value: number | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value < 1e12 ? value * 1000 : value);
  }

  const parsedNumber = typeof value === "string" ? Number(value) : NaN;
  if (Number.isFinite(parsedNumber)) {
    return new Date(parsedNumber < 1e12 ? parsedNumber * 1000 : parsedNumber);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatRelativeDate(value: number | string | null | undefined): string {
  const date = normalizeDateValue(value);
  if (!date) return "暂无";

  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} 分钟前`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))} 小时前`;
  if (diff < 7 * day) return `${Math.max(1, Math.floor(diff / day))} 天前`;

  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDateTime(value: number | string | null | undefined): string {
  const date = normalizeDateValue(value);
  if (!date) return "暂无";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatScheduleLabel(schedule: string | null | undefined): string {
  if (!schedule) return "未设置";
  if (schedule === "0 8 * * *") return "每天 08:00";
  if (schedule === "0 9 * * *") return "每天 09:00";
  if (schedule === "0 10 * * *") return "每天 10:00";
  if (schedule === "0 11 * * *") return "每天 11:00";
  if (schedule === "0 12 * * *") return "每天 12:00";
  if (schedule === "0 13 * * *") return "每天 13:00";
  if (schedule === "0 20 * * *") return "每天 20:00";
  if (schedule.startsWith("*/5")) return "每 5 分钟";
  return schedule;
}

export function getModuleFocusTokens(module: ModuleConfig): string[] {
  const keywordTokens = (module.config.keywords || []).filter(Boolean);
  const subscriptionTokens = (module.subscriptions || [])
    .map((subscription) => subscription.label || subscription.value)
    .filter(Boolean);

  return [...new Set([...keywordTokens, ...subscriptionTokens])];
}

export function getModuleFocusSummary(module: ModuleConfig): string {
  const keywordCount = module.config.keywords?.length || 0;
  const subscriptionCount = module.subscriptions?.length || 0;

  if (keywordCount > 0 && subscriptionCount > 0) {
    return `${keywordCount} 个关键词 · ${subscriptionCount} 个订阅`;
  }
  if (keywordCount > 0) {
    return `${keywordCount} 个关键词`;
  }
  if (subscriptionCount > 0) {
    return `${subscriptionCount} 个订阅`;
  }
  return "还没有监控目标";
}
