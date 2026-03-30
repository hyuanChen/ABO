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
    <div className="bg-slate-800/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-300">今日待办</h3>
        <span className="text-xs text-slate-500">
          {done}/{todos.length} · 完成率 {pct}%
        </span>
      </div>

      {todos.length > 0 && (
        <div className="h-1 bg-slate-700 rounded-full overflow-hidden mb-3">
          <div
            className="h-full rounded-full transition-all duration-500 bg-emerald-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <div className="space-y-1.5 mb-3">
        {todos.map((todo) => (
          <div key={todo.id} className="flex items-center gap-2 group">
            <button
              onClick={() => toggle(todo.id)}
              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0
                ${todo.done
                  ? "bg-emerald-500 border-emerald-500"
                  : "border-slate-600 hover:border-slate-400"
                }`}
              aria-label={todo.done ? "标记未完成" : "标记完成"}
            >
              {todo.done && <Check className="w-2.5 h-2.5 text-white" />}
            </button>
            <span
              className={`flex-1 text-sm ${
                todo.done ? "line-through text-slate-500" : "text-slate-300"
              }`}
            >
              {todo.text}
            </span>
            <button
              onClick={() => remove(todo.id)}
              className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-400"
              aria-label="删除"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTodo()}
          placeholder="添加今日任务..."
          className="flex-1 bg-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 border border-slate-600 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
        />
        <button
          onClick={addTodo}
          aria-label="添加"
          className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
