// src/modules/profile/DailyTodo.tsx
import { useState } from "react";
import { Plus, X, Check } from "lucide-react";
import { api } from "../../core/api";

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

interface Props {
  todos: Todo[];
  onChange: (todos: Todo[]) => void;
}

export default function DailyTodo({ todos, onChange }: Props) {
  const [newText, setNewText] = useState("");

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

  function toggle(id: string) {
    sync(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function remove(id: string) {
    sync(todos.filter((t) => t.id !== id));
  }

  const done = todos.filter((t) => t.done).length;
  const pct = todos.length > 0 ? Math.round((done / todos.length) * 100) : 0;

  return (
    <div style={{ background: "var(--bg-card)", borderRadius: "var(--radius-lg)", padding: "16px", border: "1px solid var(--border-light)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-main)" }}>今日待办</h3>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          {done}/{todos.length} · 完成率 {pct}%
        </span>
      </div>

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
        {todos.map((todo) => (
          <div key={todo.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => toggle(todo.id)}
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "var(--radius-sm)",
                border: todo.done ? "none" : "1px solid var(--border-color)",
                background: todo.done ? "linear-gradient(135deg, #10B981, #34D399)" : "var(--bg-hover)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                cursor: "pointer",
              }}
              aria-label={todo.done ? "标记未完成" : "标记完成"}
            >
              {todo.done && <Check style={{ width: "12px", height: "12px", color: "white" }} />}
            </button>
            <span
              style={{
                flex: 1,
                fontSize: "0.875rem",
                color: todo.done ? "var(--text-muted)" : "var(--text-main)",
                textDecoration: todo.done ? "line-through" : "none",
              }}
            >
              {todo.text}
            </span>
            <button
              onClick={() => remove(todo.id)}
              style={{
                padding: "4px",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-muted)",
                opacity: 0,
                transition: "opacity 0.2s ease",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0"; }}
              aria-label="删除"
            >
              <X style={{ width: "14px", height: "14px" }} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTodo()}
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
    </div>
  );
}
