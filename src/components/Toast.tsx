import { useEffect } from "react";
import { CheckCircle2, Info, AlertCircle, X } from "lucide-react";
import { useStore, Toast } from "../core/store";

// ── Individual toast ──────────────────────────────────────────────────────────

const KIND_CONFIG = {
  success: {
    icon: CheckCircle2,
    bg: "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700/50",
    icon_color: "text-emerald-500 dark:text-emerald-400",
    icon_bg: "bg-emerald-100 dark:bg-emerald-900/50",
  },
  info: {
    icon: Info,
    bg: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    icon_color: "text-slate-500 dark:text-slate-400",
    icon_bg: "bg-slate-100 dark:bg-slate-700",
  },
  error: {
    icon: AlertCircle,
    bg: "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700/50",
    icon_color: "text-red-500 dark:text-red-400",
    icon_bg: "bg-red-100 dark:bg-red-900/50",
  },
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useStore((s) => s.removeToast);
  const cfg = KIND_CONFIG[toast.kind];
  const Icon = cfg.icon;
  const dur = toast.duration ?? 3500;

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), dur);
    return () => clearTimeout(timer);
  }, [toast.id, dur, removeToast]);

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-2xl border shadow-lg backdrop-blur-sm ${cfg.bg} min-w-[260px] max-w-[360px] animate-in slide-in-from-right-4 duration-300`}
      role="alert"
    >
      <div className={`w-8 h-8 rounded-xl ${cfg.icon_bg} flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon className={`w-4 h-4 ${cfg.icon_color}`} aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-tight">{toast.title}</p>
        {toast.subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{toast.subtitle}</p>
        )}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        aria-label="关闭提示"
        className="p-0.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
      >
        <X className="w-3.5 h-3.5" aria-hidden />
      </button>
    </div>
  );
}

// ── Container ─────────────────────────────────────────────────────────────────

export default function ToastContainer() {
  const toasts = useStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 items-end pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} />
        </div>
      ))}
    </div>
  );
}

// ── Helper hook ───────────────────────────────────────────────────────────────

export function useToast() {
  const addToast = useStore((s) => s.addToast);

  return {
    success: (title: string, subtitle?: string) =>
      addToast({ kind: "success", title, subtitle }),
    info: (title: string, subtitle?: string) =>
      addToast({ kind: "info", title, subtitle }),
    error: (title: string, subtitle?: string) =>
      addToast({ kind: "error", title, subtitle, duration: 5000 }),
  };
}
