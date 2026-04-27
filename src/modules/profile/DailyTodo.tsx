// src/modules/profile/DailyTodo.tsx
import { useState, useRef, useEffect } from "react";
import { Plus, X, Check, Play } from "lucide-react";
import { api } from "../../core/api";
import { isActionEnterKey, isComposingKeyboardEvent } from "../../core/keyboard";

interface Todo {
  id: string;
  text: string;
  done: boolean;
  started_at?: number | null;   // unix seconds when started (in_progress)
  duration_ms?: number | null;  // total duration in ms once completed
  source?: string;
  priority?: string;
  reason?: string;
  evidence?: string[];
  generated_at?: string;
}

interface Props {
  todos: Todo[];
  onChange: (todos: Todo[]) => void;
  showHeader?: boolean;
}

// Default target duration: 25 min pomodoro
const TARGET_MS = 25 * 60 * 1000;

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h} 时 ${m} 分 ${s} 秒`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

function getPriorityBadge(priority?: string) {
  if (priority === "high") return { label: "高优先", color: "#D66B6B", bg: "rgba(214, 107, 107, 0.12)" };
  if (priority === "low") return { label: "低优先", color: "#5D89C7", bg: "rgba(93, 137, 199, 0.12)" };
  return { label: "中优先", color: "#A47A2A", bg: "rgba(245, 200, 140, 0.18)" };
}

export default function DailyTodo({ todos, onChange, showHeader = true }: Props) {
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [, forceTick] = useState(0);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Re-render every second if any todo is in progress
  const hasRunning = todos.some((t) => !t.done && t.started_at);
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [hasRunning]);

  async function sync(updated: Todo[]) {
    onChange(updated);
    try {
      await api.post("/api/profile/todos", { todos: updated });
    } catch { /* silent */ }
  }

  function addTodo() {
    if (!newText.trim()) return;
    const updated = [
      ...todos,
      { id: crypto.randomUUID(), text: newText.trim(), done: false },
    ];
    setNewText("");
    sync(updated);
  }

  // Three-state click: pending → in_progress → completed
  function cycleState(id: string) {
    const nowSec = Math.floor(Date.now() / 1000);
    sync(
      todos.map((t) => {
        if (t.id !== id) return t;
        // Completed → back to pending (undo)
        if (t.done) {
          return { ...t, done: false, started_at: null, duration_ms: null };
        }
        // In progress → completed
        if (t.started_at) {
          const duration_ms = Date.now() - t.started_at * 1000;
          return { ...t, done: true, duration_ms };
        }
        // Pending → in progress
        return { ...t, started_at: nowSec, duration_ms: null };
      })
    );
  }

  function remove(id: string) {
    sync(todos.filter((t) => t.id !== id));
  }

  function startEdit(todo: Todo) {
    setEditingId(todo.id);
    setEditText(todo.text);
  }

  function commitEdit() {
    if (editingId === null) return;
    const trimmed = editText.trim();
    if (!trimmed) {
      sync(todos.filter((t) => t.id !== editingId));
    } else {
      sync(todos.map((t) => (t.id === editingId ? { ...t, text: trimmed } : t)));
    }
    setEditingId(null);
    setEditText("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  const done = todos.filter((t) => t.done).length;
  const pct = todos.length > 0 ? Math.round((done / todos.length) * 100) : 0;

  return (
    <div style={{ background: "var(--bg-card)", borderRadius: "var(--radius-lg)", padding: "16px", border: "1px solid var(--border-light)" }}>
      {showHeader && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-main)" }}>今日待办</h3>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {done}/{todos.length} · 完成率 {pct}%
          </span>
        </div>
      )}

      {todos.length > 0 && (
        <div style={{ height: "4px", background: "var(--bg-hover)", borderRadius: "var(--radius-full)", overflow: "hidden", marginBottom: "12px" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: "linear-gradient(135deg, #10B981, #34D399)",
              borderRadius: "var(--radius-full)",
              transition: "width 0.5s ease",
            }}
          />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
        {todos.map((todo) => {
          const isEditing = editingId === todo.id;
          const inProgress = !todo.done && !!todo.started_at;
          const elapsedMs = inProgress ? Date.now() - (todo.started_at as number) * 1000 : todo.duration_ms ?? 0;
          const progressPct = inProgress ? Math.min(100, (elapsedMs / TARGET_MS) * 100) : 0;
          const over = inProgress && elapsedMs > TARGET_MS;
          const priorityBadge = getPriorityBadge(todo.priority);
          const metaItems = [
            todo.source === "agent" ? "AI" : "",
            todo.reason ?? "",
          ].filter(Boolean);

          return (
            <div
              key={todo.id}
              className="daily-todo-row"
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                padding: "6px 8px",
                borderRadius: "var(--radius-sm)",
                background: inProgress ? "rgba(188, 164, 227, 0.08)" : "transparent",
                border: inProgress ? "1px solid rgba(188, 164, 227, 0.25)" : "1px solid transparent",
                transition: "background 0.15s ease, border-color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!inProgress) e.currentTarget.style.background = "var(--bg-hover)";
                const del = e.currentTarget.querySelector<HTMLButtonElement>(".todo-delete-btn");
                if (del) del.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                if (!inProgress) e.currentTarget.style.background = "transparent";
                const del = e.currentTarget.querySelector<HTMLButtonElement>(".todo-delete-btn");
                if (del) del.style.opacity = "0";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={() => cycleState(todo.id)}
                  title={
                    todo.done
                      ? "点击撤销完成"
                      : inProgress
                      ? "点击完成任务"
                      : "点击启动任务"
                  }
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "var(--radius-sm)",
                    border: todo.done
                      ? "none"
                      : inProgress
                      ? "1px solid var(--color-primary)"
                      : "1px solid var(--border-color)",
                    background: todo.done
                      ? "linear-gradient(135deg, #10B981, #34D399)"
                      : inProgress
                      ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))"
                      : "var(--bg-hover)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    boxShadow: inProgress ? "0 0 10px rgba(188, 164, 227, 0.5)" : "none",
                  }}
                  aria-label={todo.done ? "已完成" : inProgress ? "进行中" : "待启动"}
                >
                  {todo.done ? (
                    <Check style={{ width: "12px", height: "12px", color: "white" }} />
                  ) : inProgress ? (
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "white",
                        animation: "pulse 1.2s ease-in-out infinite",
                      }}
                    />
                  ) : (
                    <Play style={{ width: "10px", height: "10px", color: "var(--text-muted)", marginLeft: "1px" }} />
                  )}
                </button>
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (isComposingKeyboardEvent(e)) return;
                      if (isActionEnterKey(e)) commitEdit();
                      else if (e.key === "Escape") cancelEdit();
                    }}
                    style={{
                      flex: 1,
                      fontSize: "0.875rem",
                      color: "var(--text-main)",
                      background: "var(--bg-app)",
                      border: "1px solid var(--color-primary)",
                      borderRadius: "var(--radius-sm)",
                      padding: "4px 8px",
                      outline: "none",
                    }}
                  />
                ) : (
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span
                      onDoubleClick={() => startEdit(todo)}
                      title="双击修改"
                      style={{
                        fontSize: "0.875rem",
                        color: todo.done ? "var(--text-muted)" : "var(--text-main)",
                        textDecoration: todo.done ? "line-through" : "none",
                        cursor: "text",
                        userSelect: "none",
                        fontWeight: inProgress ? 600 : 400,
                        lineHeight: 1.55,
                      }}
                    >
                      {todo.text}
                    </span>
                    {(todo.source === "agent" || todo.reason || todo.priority) && (
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
                        {todo.priority && (
                          <span
                            style={{
                              padding: "2px 7px",
                              borderRadius: "999px",
                              background: priorityBadge.bg,
                              color: priorityBadge.color,
                              fontSize: "0.625rem",
                              fontWeight: 700,
                            }}
                          >
                            {priorityBadge.label}
                          </span>
                        )}
                        {metaItems.length > 0 && (
                          <span
                            style={{
                              fontSize: "0.6875rem",
                              color: "var(--text-light)",
                              lineHeight: 1.5,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              minWidth: 0,
                            }}
                            title={metaItems.join(" · ")}
                          >
                            {metaItems.join(" · ")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {/* Status label */}
                {inProgress && (
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      color: over ? "#E85D5D" : "var(--color-primary)",
                      fontFamily: "monospace",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {formatDuration(elapsedMs)}
                  </span>
                )}
                {todo.done && todo.duration_ms != null && (
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      color: "var(--text-muted)",
                      fontFamily: "monospace",
                      flexShrink: 0,
                    }}
                  >
                    用时 {formatDuration(todo.duration_ms)}
                  </span>
                )}
                {!isEditing && (
                  <button
                    className="todo-delete-btn"
                    onClick={() => remove(todo.id)}
                    style={{
                      padding: "4px",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-muted)",
                      opacity: 0,
                      transition: "opacity 0.2s ease, color 0.15s ease",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#E85D5D"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                    aria-label="删除"
                  >
                    <X style={{ width: "14px", height: "14px" }} />
                  </button>
                )}
              </div>

              {/* Progress bar (shown only when in progress) */}
              {inProgress && (
                <div
                  style={{
                    marginLeft: "28px",
                    height: "3px",
                    background: "var(--bg-hover)",
                    borderRadius: "var(--radius-full)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${progressPct}%`,
                      background: over
                        ? "linear-gradient(90deg, #E85D5D, #FFB4B2)"
                        : "linear-gradient(90deg, var(--color-primary), var(--color-primary-dark))",
                      borderRadius: "var(--radius-full)",
                      transition: "width 1s linear",
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (isActionEnterKey(e)) {
              e.preventDefault();
              addTodo();
            }
          }}
          placeholder="添加今日任务..."
          style={{
            flex: 1,
            background: "var(--bg-hover)",
            color: "var(--text-main)",
            fontSize: "0.875rem",
            borderRadius: "var(--radius-md)",
            padding: "8px 12px",
            border: "1px solid var(--border-light)",
            outline: "none",
          }}
        />
        <button
          onClick={addTodo}
          aria-label="添加"
          style={{
            padding: "8px",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-hover)",
            border: "1px solid var(--border-light)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--color-primary)";
            e.currentTarget.style.color = "white";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <Plus style={{ width: "16px", height: "16px" }} />
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
