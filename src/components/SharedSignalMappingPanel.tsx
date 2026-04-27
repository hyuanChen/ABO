import { ChevronDown, ChevronRight, FolderTree } from "lucide-react";
import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { PaginationControls } from "./PaginationControls";

export interface SharedSignalEntry {
  signal: string;
  group_label: string;
  group_labels?: string[];
  count: number;
  platforms: string[];
  sample_authors: string[];
  sample_groups: string[];
}

interface SharedGroupOption {
  value: string;
  label: string;
}

interface SharedSignalMappingPanelProps {
  title?: string;
  description?: string;
  entries: SharedSignalEntry[];
  groupOptions: SharedGroupOption[];
  saving?: boolean;
  updatedAt?: string | null;
  onSave: (mapping: Record<string, string[]>) => Promise<void> | void;
}

const PAGE_SIZE_OPTIONS = [20, 50];
const MAX_VISIBLE_SUGGESTIONS = 5;

type MappingStatusFilter = "all" | "confirmed" | "unconfirmed";

function formatUpdatedAt(updatedAt?: string | null): string {
  if (!updatedAt) return "尚未保存";
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return updatedAt;
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeLabels(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  values.forEach((value) => {
    const label = String(value || "").trim();
    if (label && !result.includes(label)) result.push(label);
  });
  return result;
}

function labelsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((label, index) => label === right[index]);
}

function formatGroupLabels(labels: string[]): string {
  if (labels.length === 0) return "未指定";
  return labels.join(" · ");
}

function resolveEntryLabels(entry: SharedSignalEntry): string[] {
  if (entry.group_labels && entry.group_labels.length > 0) {
    return normalizeLabels(entry.group_labels);
  }
  return normalizeLabels([entry.group_label]);
}

export function SharedSignalMappingPanel({
  title = "共享分组规则",
  description = "原始标签 -> 共享规则 -> 共享组 -> 作者入组。此处管理的是笔记标签和分组的关系；作者会根据样本笔记命中的标签，在下一次整理时自动加入对应的共享组。",
  entries,
  groupOptions,
  saving = false,
  updatedAt,
  onSave,
}: SharedSignalMappingPanelProps) {
  const [open, setOpen] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<MappingStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [expandedSuggestionSignals, setExpandedSuggestionSignals] = useState<Set<string>>(new Set());
  const datalistId = useId();

  useEffect(() => {
    const nextDraft: Record<string, string[]> = {};
    const nextDraftInputs: Record<string, string> = {};
    for (const entry of entries) {
      nextDraft[entry.signal] = resolveEntryLabels(entry);
      nextDraftInputs[entry.signal] = "";
    }
    setDraft(nextDraft);
    setDraftInputs(nextDraftInputs);
    setExpandedSuggestionSignals(new Set());
  }, [entries]);

  useEffect(() => {
    setPage(1);
  }, [entries, query, statusFilter, open, pageSize]);

  const getDraftLabels = (signal: string): string[] => normalizeLabels(draft[signal] || []);
  const getDraftInput = (signal: string): string => draftInputs[signal] || "";
  const setSignalDraftLabels = (signal: string, labels: string[]) => {
    setDraft((prev) => ({ ...prev, [signal]: normalizeLabels(labels) }));
  };
  const updateDraftInput = (signal: string, value: string) => {
    setDraftInputs((prev) => ({ ...prev, [signal]: value }));
  };
  const addDraftLabel = (signal: string, label: string) => {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) return;
    setSignalDraftLabels(signal, [...getDraftLabels(signal), normalizedLabel]);
    updateDraftInput(signal, "");
  };
  const removeDraftLabel = (signal: string, label: string) => {
    setSignalDraftLabels(
      signal,
      getDraftLabels(signal).filter((item) => item !== label),
    );
  };
  const toggleDraftLabel = (signal: string, label: string) => {
    const current = getDraftLabels(signal);
    if (current.includes(label)) {
      removeDraftLabel(signal, label);
      return;
    }
    setSignalDraftLabels(signal, [...current, label]);
  };
  const toggleSuggestionExpansion = (signal: string) => {
    setExpandedSuggestionSignals((prev) => {
      const next = new Set(prev);
      if (next.has(signal)) next.delete(signal);
      else next.add(signal);
      return next;
    });
  };

  const filteredEntries = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return entries;
    return entries.filter((entry) => {
      const haystack = [
        entry.signal,
        ...resolveEntryLabels(entry),
        ...entry.sample_authors,
        ...entry.sample_groups,
        ...entry.platforms,
      ].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [entries, query]);

  const statusFilteredEntries = useMemo(() => {
    if (statusFilter === "all") return filteredEntries;
    return filteredEntries.filter((entry) => {
      const confirmed = getDraftLabels(entry.signal).length > 0;
      return statusFilter === "confirmed" ? confirmed : !confirmed;
    });
  }, [filteredEntries, statusFilter, draft]);

  const changedCount = entries.filter((entry) => !labelsEqual(getDraftLabels(entry.signal), resolveEntryLabels(entry))).length;
  const suggestionLabels = Array.from(new Set(groupOptions.map((item) => item.label).filter(Boolean)));
  const effectiveGroupLabels = Array.from(
    new Set([
      ...suggestionLabels,
      ...entries.flatMap((entry) => resolveEntryLabels(entry)),
    ]),
  );
  const mappedCount = entries.filter((entry) => getDraftLabels(entry.signal).length > 0).length;
  const unmappedCount = Math.max(0, entries.length - mappedCount);
  const totalPages = Math.max(1, Math.ceil(statusFilteredEntries.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedEntries = statusFilteredEntries.slice((safePage - 1) * pageSize, safePage * pageSize);
  const sampleAuthors = useMemo(() => {
    const nextAuthors: string[] = [];
    for (const entry of entries) {
      for (const author of entry.sample_authors) {
        if (author && !nextAuthors.includes(author)) nextAuthors.push(author);
        if (nextAuthors.length >= 4) return nextAuthors;
      }
    }
    return nextAuthors;
  }, [entries]);
  const summaryText = entries.length > 0
    ? "原始标签 -> 共享规则 -> 共享组 -> 作者入组。这里管的是标签和分组的关系，不是直接编辑作者名单。"
    : "先执行一次“共享智能分组”，这里才会出现跨平台共用的共享规则词典。";

  return (
    <div
      style={{
        padding: "14px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-light)",
        background: "var(--bg-card)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <datalist id={datalistId}>
        {suggestionLabels.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          width: "100%",
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: "12px",
            alignItems: "start",
          }}
        >
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", minWidth: 0 }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "10px",
                display: "grid",
                placeItems: "center",
                background: "rgba(14, 165, 233, 0.10)",
                color: "#0284C7",
                flexShrink: 0,
              }}
            >
              <FolderTree size={16} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "var(--text-main)" }}>{title}</div>
                <span style={summaryChipStyle}>跨平台共用</span>
              </div>
              <div style={{ marginTop: "4px", fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {summaryText}
              </div>
              <div style={{ marginTop: "6px", fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                博主 / UP 会根据其样本笔记标签的命中情况加入对应共享组；你在这里修改的是“标签怎么归组”。
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                <span style={summaryChipStyle}>共享组 {effectiveGroupLabels.length}</span>
                <span style={summaryChipStyle}>原始标签 {entries.length}</span>
                <span style={summaryChipStyle}>已确认 {mappedCount}</span>
                {unmappedCount > 0 && (
                  <span style={{ ...summaryChipStyle, background: "rgba(245, 158, 11, 0.12)", color: "#B45309" }}>
                    待确认 {unmappedCount}
                  </span>
                )}
              </div>
              {sampleAuthors.length > 0 && (
                <div style={{ marginTop: "8px", fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                  当前规则会影响：{sampleAuthors.join("、")}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              最近更新 {formatUpdatedAt(updatedAt)}
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "999px",
                border: "1px solid var(--border-light)",
                background: "var(--bg-base)",
                color: "var(--text-secondary)",
                fontSize: "0.75rem",
                fontWeight: 700,
              }}
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {open ? "收起规则" : "展开查看"}
            </div>
          </div>
        </div>
      </button>

      {open && (
        <>
          <div style={{ height: "1px", background: "var(--border-light)" }} />

          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>怎么用</div>
              <div style={{ marginTop: "4px", fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: "760px" }}>
                {description}
              </div>
            </div>
            <button
              type="button"
              disabled={saving || changedCount === 0}
              onClick={() => void onSave(draft)}
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid rgba(59, 130, 246, 0.28)",
                background: saving || changedCount === 0 ? "var(--bg-muted)" : "linear-gradient(135deg, #3B82F6, #0891B2)",
                color: saving || changedCount === 0 ? "var(--text-muted)" : "white",
                fontSize: "0.8125rem",
                fontWeight: 700,
                cursor: saving || changedCount === 0 ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "保存中..." : `保存规则${changedCount > 0 ? ` (${changedCount})` : ""}`}
            </button>
          </div>

          <div
            style={{
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(14, 165, 233, 0.16)",
              background: "rgba(14, 165, 233, 0.06)",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setShowExample((value) => !value)}
              aria-expanded={showExample}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>
                    例子：标签如何把作者挂进共享组
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                    最简单的链路：先定义标签归属，再重新整理作者。
                  </div>
                </div>
                <div style={{ ...summaryChipStyle, background: "rgba(255, 255, 255, 0.78)" }}>
                  {showExample ? "收起例子" : "展开例子"}
                </div>
              </div>
            </button>

            {showExample && (
              <div style={{ padding: "0 12px 12px", borderTop: "1px solid rgba(14, 165, 233, 0.16)", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.7, marginTop: "10px" }}>
                  <strong style={{ color: "var(--text-main)" }}>原始标签</strong>
                  {" -> "}
                  <strong style={{ color: "var(--text-main)" }}>共享规则</strong>
                  {" -> "}
                  <strong style={{ color: "var(--text-main)" }}>共享组</strong>
                  {" -> "}
                  <strong style={{ color: "var(--text-main)" }}>作者入组</strong>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {[
                    "Obsidian -> 知识管理 / Obsidian",
                    "双链笔记 -> 知识管理 / Obsidian",
                    "卡片笔记 -> 知识管理 / Obsidian",
                  ].map((item) => (
                    <span key={item} style={exampleChipStyle}>{item}</span>
                  ))}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                  某个 B 站 UP 的最近 3 条里出现了 <strong style={{ color: "var(--text-main)" }}>Obsidian、双链笔记</strong>；
                  某个小红书博主的本地笔记里出现了 <strong style={{ color: "var(--text-main)" }}>卡片笔记</strong>。
                  重新整理作者后，这两个人都会被加入同一个共享组：
                  <strong style={{ color: "var(--text-main)" }}> 知识管理 / Obsidian</strong>。
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索原始标签 / 共享组 / 作者"
              style={{
                flex: "1 1 260px",
                minWidth: 0,
                padding: "9px 11px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-base)",
                color: "var(--text-main)",
                fontSize: "0.8125rem",
              }}
            />
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {[
                { value: "all" as const, label: `全部 ${entries.length}` },
                { value: "confirmed" as const, label: `已确认 ${mappedCount}` },
                { value: "unconfirmed" as const, label: `未确认 ${unmappedCount}` },
              ].map((option) => {
                const active = statusFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
                    style={{
                      padding: "7px 10px",
                      borderRadius: "999px",
                      border: "1px solid",
                      borderColor: active ? "#0284C7" : "var(--border-light)",
                      background: active ? "rgba(14, 165, 233, 0.10)" : "var(--bg-base)",
                      color: active ? "#0369A1" : "var(--text-secondary)",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              共 {entries.length} 个原始标签，当前命中 {statusFilteredEntries.length} 个
            </div>
          </div>

          <PaginationControls
            totalCount={statusFilteredEntries.length}
            page={safePage}
            pageSize={pageSize}
            itemLabel="个标签"
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => setPageSize(nextPageSize === 50 ? 50 : 20)}
            emptyText="当前没有匹配的标签"
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "560px", overflow: "auto", paddingRight: "2px" }}>
            {statusFilteredEntries.length === 0 ? (
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                没有匹配的原始标签。
              </div>
            ) : pagedEntries.map((entry) => {
              const entryLabels = resolveEntryLabels(entry);
              const draftLabels = getDraftLabels(entry.signal);
              const changed = !labelsEqual(draftLabels, entryLabels);
              const expandedSuggestions = expandedSuggestionSignals.has(entry.signal);
              const visibleSuggestionLabels = expandedSuggestions
                ? suggestionLabels
                : suggestionLabels.slice(0, MAX_VISIBLE_SUGGESTIONS);
              const draftInput = getDraftInput(entry.signal);

              return (
                <div
                  key={entry.signal}
                  style={{
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: `1px solid ${changed ? "rgba(245, 158, 11, 0.28)" : "var(--border-light)"}`,
                    background: changed ? "rgba(245, 158, 11, 0.08)" : "var(--bg-base)",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>{entry.signal}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>出现 {entry.count} 次</span>
                      {entry.platforms.map((platform) => (
                        <span key={`${entry.signal}-${platform}`} style={platformChipStyle}>
                          {platform}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      现在会归到：{formatGroupLabels(entryLabels)}
                    </div>
                    {entry.sample_groups.length > 0 && (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                        已影响分组：{entry.sample_groups.join(" / ")}
                      </div>
                    )}
                    {entry.sample_authors.length > 0 && (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                        示例作者：{entry.sample_authors.join("、")}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                        目标共享组
                      </span>
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                        已选 {draftLabels.length} 个
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {draftLabels.length > 0 ? draftLabels.map((label) => (
                        <button
                          key={`${entry.signal}-selected-${label}`}
                          type="button"
                          onClick={() => removeDraftLabel(entry.signal, label)}
                          style={{
                            padding: "5px 9px",
                            borderRadius: "999px",
                            border: "1px solid rgba(59, 130, 246, 0.20)",
                            background: "rgba(59, 130, 246, 0.10)",
                            color: "#2563EB",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {label} ×
                        </button>
                      )) : (
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          还没有指定共享组
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <input
                        list={datalistId}
                        value={draftInput}
                        onChange={(event) => updateDraftInput(entry.signal, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addDraftLabel(entry.signal, draftInput);
                          }
                        }}
                        placeholder="输入共享组名后回车添加"
                        style={{
                          flex: "1 1 220px",
                          minWidth: 0,
                          padding: "9px 11px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-light)",
                          background: "white",
                          color: "var(--text-main)",
                          fontSize: "0.8125rem",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => addDraftLabel(entry.signal, draftInput)}
                        disabled={!draftInput.trim()}
                        style={{
                          padding: "8px 10px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-light)",
                          background: draftInput.trim() ? "var(--bg-card)" : "var(--bg-muted)",
                          color: draftInput.trim() ? "var(--text-secondary)" : "var(--text-muted)",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: draftInput.trim() ? "pointer" : "not-allowed",
                        }}
                      >
                        添加
                      </button>
                      <button
                        type="button"
                        onClick={() => setSignalDraftLabels(entry.signal, [])}
                        disabled={draftLabels.length === 0}
                        style={{
                          padding: "8px 10px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-light)",
                          background: draftLabels.length > 0 ? "var(--bg-card)" : "var(--bg-muted)",
                          color: draftLabels.length > 0 ? "var(--text-secondary)" : "var(--text-muted)",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: draftLabels.length > 0 ? "pointer" : "not-allowed",
                        }}
                      >
                        清空
                      </button>
                    </div>

                    {suggestionLabels.length > 0 && (
                      <div
                        style={{
                          padding: "10px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid rgba(15, 23, 42, 0.08)",
                          background: "rgba(15, 23, 42, 0.02)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                          快速加入共享组。可多选；点一次加入，再点一次移除。
                        </div>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {visibleSuggestionLabels.map((label) => {
                            const active = draftLabels.includes(label);
                            return (
                              <button
                                key={`${entry.signal}-${label}`}
                                type="button"
                                onClick={() => toggleDraftLabel(entry.signal, label)}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "999px",
                                  border: `1px solid ${active ? "rgba(59, 130, 246, 0.24)" : "var(--border-light)"}`,
                                  background: active ? "rgba(59, 130, 246, 0.12)" : "transparent",
                                  color: active ? "#2563EB" : "var(--text-secondary)",
                                  fontSize: "0.6875rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                {active ? `已选 ${label}` : `加入 ${label}`}
                              </button>
                            );
                          })}
                          {suggestionLabels.length > MAX_VISIBLE_SUGGESTIONS && (
                            <button
                              type="button"
                              onClick={() => toggleSuggestionExpansion(entry.signal)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: "999px",
                                border: "1px dashed var(--border-light)",
                                background: "transparent",
                                color: "var(--text-secondary)",
                                fontSize: "0.6875rem",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              {expandedSuggestions ? "收起分组" : `... 全部 ${suggestionLabels.length} 个智能分组`}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const summaryChipStyle: CSSProperties = {
  padding: "3px 8px",
  borderRadius: "999px",
  background: "rgba(15, 23, 42, 0.06)",
  color: "var(--text-secondary)",
  fontSize: "0.6875rem",
  fontWeight: 700,
};

const exampleChipStyle: CSSProperties = {
  padding: "5px 9px",
  borderRadius: "999px",
  background: "rgba(59, 130, 246, 0.10)",
  color: "#2563EB",
  fontSize: "0.75rem",
  fontWeight: 700,
};

const platformChipStyle: CSSProperties = {
  padding: "2px 7px",
  borderRadius: "999px",
  background: "rgba(15, 23, 42, 0.06)",
  color: "var(--text-secondary)",
  fontSize: "0.6875rem",
  fontWeight: 700,
};
