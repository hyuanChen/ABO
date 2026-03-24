import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow as ReactFlowComponent,
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  MiniMap,
  Node,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Network, Plus, Trash2, Zap,
  Save, Loader2, X, Lightbulb,
  ChevronDown,
} from "lucide-react";
import { api } from "../../core/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Canvas {
  id: string;
  name: string;
  node_count: number;
  updated_at: string;
}

interface CollideResult {
  hypothesis: string;
  method: string;
  novelty: string;
}

// ── Idea node (custom) ────────────────────────────────────────────────────────

function IdeaNode({ data, selected }: { data: Record<string, unknown>; selected: boolean }) {
  const label = String(data.label ?? "");
  const color = String(data.color ?? "");
  return (
    <div className={`px-4 py-3 rounded-2xl border-2 shadow-sm min-w-[120px] max-w-[200px] text-center transition-all ${
      selected
        ? "border-indigo-500 shadow-indigo-200 dark:shadow-indigo-900/40"
        : "border-slate-200 dark:border-slate-600"
    } ${color === "amber"
        ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700"
        : "bg-white dark:bg-slate-800"
    }`}>
      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug">{label}</p>
    </div>
  );
}

const nodeTypes = { idea: IdeaNode };

// ── A+B Collider modal ────────────────────────────────────────────────────────

function ColliderModal({
  ideaA, ideaB, onClose, onInsert,
}: {
  ideaA: string; ideaB: string;
  onClose: () => void;
  onInsert: (hypothesis: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CollideResult | null>(null);
  const [error, setError] = useState("");

  const runCollide = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await api.post<CollideResult>("/api/mindmap/collide", {
        idea_a: ideaA, idea_b: ideaB,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "碰撞失败");
    } finally { setLoading(false); }
  }, [ideaA, ideaB]);

  useEffect(() => { runCollide(); }, [runCollide]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl w-full max-w-lg mx-4 p-6"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-amber-500" aria-hidden />
            </div>
            <h3 className="font-heading text-lg text-slate-800 dark:text-slate-100">A+B 创意撞击</h3>
          </div>
          <button onClick={onClose} aria-label="关闭"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        {/* Ideas preview */}
        <div className="flex items-center gap-3 mb-5 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
          <div className="flex-1 p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-xs text-indigo-700 dark:text-indigo-300 font-medium text-center truncate">
            {ideaA}
          </div>
          <Zap className="w-4 h-4 text-amber-500 shrink-0" aria-hidden />
          <div className="flex-1 p-2 rounded-lg bg-violet-50 dark:bg-violet-900/30 text-xs text-violet-700 dark:text-violet-300 font-medium text-center truncate">
            {ideaB}
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" aria-hidden />
            <p className="text-sm text-slate-500 dark:text-slate-400">Claude 正在进行创意碰撞…</p>
          </div>
        )}

        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        {result && !loading && (
          <div className="flex flex-col gap-3">
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1.5 flex items-center gap-1">
                <Lightbulb className="w-3 h-3" aria-hidden /> 研究假设
              </p>
              <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed">{result.hypothesis}</p>
            </div>

            {result.method && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">方法论思路</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{result.method}</p>
              </div>
            )}

            {result.novelty && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">新颖性</p>
                <p className="text-xs text-slate-700 dark:text-slate-300">{result.novelty}</p>
              </div>
            )}

            <div className="flex gap-2 mt-1">
              <button onClick={() => { onInsert(result.hypothesis); onClose(); }}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors cursor-pointer">
                插入画布
              </button>
              <button onClick={runCollide}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm transition-colors cursor-pointer">
                重新碰撞
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Canvas selector ───────────────────────────────────────────────────────────

function CanvasSelector({
  canvases, current, onChange, onCreate,
}: {
  canvases: Canvas[];
  current: string | null;
  onChange: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const currentCanvas = canvases.find((c) => c.id === current);

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 hover:border-indigo-300 transition-colors cursor-pointer">
        <Network className="w-4 h-4 text-indigo-500" aria-hidden />
        <span className="max-w-32 truncate">{currentCanvas?.name ?? "选择画布"}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" aria-hidden />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-lg overflow-hidden">
          <div className="p-2 max-h-48 overflow-y-auto">
            {canvases.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-400">暂无画布</p>
            )}
            {canvases.map((c) => (
              <button key={c.id} onClick={() => { onChange(c.id); setOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors cursor-pointer ${
                  c.id === current
                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                    : "hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                }`}>
                <span className="truncate">{c.name}</span>
                <span className="text-xs text-slate-400 shrink-0 ml-2">{c.node_count} 节点</span>
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100 dark:border-slate-700 p-2 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="新画布名称…"
              className="flex-1 px-2 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  onCreate(newName.trim());
                  setNewName(""); setOpen(false);
                }
              }}
            />
            <button
              onClick={() => { if (newName.trim()) { onCreate(newName.trim()); setNewName(""); setOpen(false); } }}
              disabled={!newName.trim()}
              className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-40">
              新建
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main MindMap ──────────────────────────────────────────────────────────────

// @xyflow/react v12 default export workaround for TS "typeof module" issue
const Flow = ReactFlowComponent as unknown as React.ComponentType<Parameters<typeof ReactFlowComponent>[0]>;

export default function MindMap() {
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [colliderOpen, setColliderOpen] = useState(false);

  const selectedNodes = nodes.filter((n) => n.selected);

  // Load canvas list
  useEffect(() => {
    api.get<{ canvases: Canvas[] }>("/api/mindmap/canvases")
      .then((r) => {
        setCanvases(r.canvases);
        if (r.canvases.length > 0) setCurrentId(r.canvases[0].id);
      })
      .catch(() => {});
  }, []);

  // Load canvas data when switching
  useEffect(() => {
    if (!currentId) return;
    api.get<{ nodes: Node[]; edges: Edge[] }>(`/api/mindmap/${currentId}`)
      .then((r) => { setNodes(r.nodes ?? []); setEdges(r.edges ?? []); setDirty(false); })
      .catch(() => {});
  }, [currentId]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    setDirty(true);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
    setDirty(true);
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge(connection, eds));
    setDirty(true);
  }, []);

  async function saveCanvas() {
    if (!currentId) return;
    setSaving(true);
    try {
      await api.put(`/api/mindmap/${currentId}`, { nodes, edges });
      setDirty(false);
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  async function createCanvas(name: string) {
    const r = await api.post<{ id: string; name: string }>("/api/mindmap/canvases", { name });
    setCanvases((prev) => [...prev, { id: r.id, name: r.name, node_count: 0, updated_at: "" }]);
    setCurrentId(r.id);
    setNodes([]); setEdges([]); setDirty(false);
  }

  function addNode() {
    const id = crypto.randomUUID();
    setNodes((prev) => [
      ...prev,
      {
        id, type: "idea",
        position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
        data: { label: "新想法" },
      },
    ]);
    setDirty(true);
  }

  function deleteSelected() {
    const selectedIds = new Set(selectedNodes.map((n) => n.id));
    setNodes((prev) => prev.filter((n) => !selectedIds.has(n.id)));
    setEdges((prev) => prev.filter((e) => !selectedIds.has(e.source) && !selectedIds.has(e.target)));
    setDirty(true);
  }

  function insertCollisionNode(hypothesis: string) {
    const id = crypto.randomUUID();
    setNodes((prev) => [
      ...prev,
      {
        id, type: "idea",
        position: { x: 200, y: 300 },
        data: { label: hypothesis.slice(0, 80), color: "amber" },
      },
    ]);
    setDirty(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">
      {/* Header toolbar */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center gap-3 flex-wrap">
        <CanvasSelector
          canvases={canvases}
          current={currentId}
          onChange={setCurrentId}
          onCreate={createCanvas}
        />

        <div className="flex-1" />

        <button onClick={addNode}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors cursor-pointer">
          <Plus className="w-4 h-4" aria-hidden />
          添加节点
        </button>

        {selectedNodes.length >= 2 && (
          <button onClick={() => setColliderOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors cursor-pointer">
            <Zap className="w-4 h-4" aria-hidden />
            A+B 撞击
          </button>
        )}

        {selectedNodes.length > 0 && (
          <button onClick={deleteSelected}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 dark:border-red-700/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm transition-colors cursor-pointer">
            <Trash2 className="w-4 h-4" aria-hidden />
            删除
          </button>
        )}

        <button onClick={saveCanvas} disabled={!dirty || !currentId || saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-40">
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            : <Save className="w-4 h-4" aria-hidden />
          }
          {dirty ? "保存*" : "保存"}
        </button>
      </div>

      {/* Canvas area */}
      <div className="flex-1 relative">
        {!currentId ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <Network className="w-8 h-8 text-emerald-400" aria-hidden />
            </div>
            <div>
              <p className="font-heading text-lg text-slate-700 dark:text-slate-200">Idea 思维导图</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                创建一个画布开始探索你的想法
              </p>
            </div>
          </div>
        ) : (
          <Flow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDoubleClick={(e: React.MouseEvent) => {
              const target = e.target as HTMLElement;
              if (target.closest(".react-flow__node")) return;
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
              const id = crypto.randomUUID();
              setNodes((prev) => [
                ...prev,
                { id, type: "idea", position: pos, data: { label: "新想法" } },
              ]);
              setDirty(true);
            }}
            fitView
            className="bg-slate-50 dark:bg-slate-950"
            defaultEdgeOptions={{ animated: false, style: { stroke: "#6366F1", strokeWidth: 1.5 } }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#CBD5E1" />
            <Controls />
            <MiniMap nodeColor={() => "#6366F1"} />
          </Flow>
        )}

        {/* Hint overlay */}
        {currentId && nodes.length === 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 shadow-sm pointer-events-none">
            双击画布添加节点 · 选中2个节点后可进行 A+B 撞击
          </div>
        )}
      </div>

      {/* A+B Collider modal */}
      {colliderOpen && selectedNodes.length >= 2 && (
        <ColliderModal
          ideaA={String(selectedNodes[0].data.label)}
          ideaB={String(selectedNodes[1].data.label)}
          onClose={() => setColliderOpen(false)}
          onInsert={insertCollisionNode}
        />
      )}
    </div>
  );
}
