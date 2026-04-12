// src/modules/profile/SBTIPicker.tsx
// Small popover button for manually picking an SBTI type.
// Writes to store.sbtiOverride (null = derive from codename hash).

import { useEffect, useRef, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { useStore } from "../../core/store";
import { SBTI_INFO, SBTIType } from "./SBTIAvatar";

const ALL_TYPES = Object.keys(SBTI_INFO) as SBTIType[];

export default function SBTIPicker() {
  const [open, setOpen] = useState(false);
  const sbtiOverride = useStore((s) => s.sbtiOverride);
  const setSbtiOverride = useStore((s) => s.setSbtiOverride);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="选择 SBTI 类型"
        title="选择 SBTI 类型"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "3px",
          padding: "3px 6px",
          borderRadius: "6px",
          background: "var(--bg-hover)",
          border: "1px solid var(--border-light)",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: "0.625rem",
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        SBTI
        <ChevronDown style={{ width: "10px", height: "10px" }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            width: "260px",
            maxHeight: "360px",
            overflowY: "auto",
            padding: "6px",
            borderRadius: "12px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-light)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
          }}
        >
          <button
            type="button"
            onClick={() => { setSbtiOverride(null); setOpen(false); }}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              width: "100%",
              padding: "8px 10px",
              borderRadius: "8px",
              background: sbtiOverride === null ? "var(--bg-hover)" : "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-secondary)",
              fontSize: "0.75rem",
              textAlign: "left",
            }}
          >
            <RotateCcw style={{ width: "14px", height: "14px" }} />
            自动（按代号哈希）
          </button>

          <div style={{ height: "1px", background: "var(--border-light)", margin: "4px 0" }} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px" }}>
            {ALL_TYPES.map((t) => {
              const info = SBTI_INFO[t];
              const active = sbtiOverride === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setSbtiOverride(t); setOpen(false); }}
                  title={`${info.code} — ${info.cn}: ${info.intro}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "2px",
                    padding: "6px 4px",
                    borderRadius: "8px",
                    background: active ? `${info.color}22` : "transparent",
                    border: active ? `1px solid ${info.color}` : "1px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  <img
                    src={`/id/pixel/${t === "WOC!" ? "WOC" : t}.png`}
                    alt={info.code}
                    width={32}
                    height={32}
                    style={{ width: "32px", height: "32px", imageRendering: "pixelated" }}
                  />
                  <span style={{
                    fontSize: "0.625rem",
                    fontWeight: 700,
                    fontFamily: "monospace",
                    color: info.color,
                    letterSpacing: "0.02em",
                  }}>
                    {info.code}
                  </span>
                  <span style={{ fontSize: "0.5625rem", color: "var(--text-muted)" }}>{info.cn}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
