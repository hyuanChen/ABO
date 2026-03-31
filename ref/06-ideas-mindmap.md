# 06 — Ideas / Mind Map

> Read this for Idea Workshop, canvas, or A+B collider changes.

---

## Overview

React Flow-based mind map for brainstorming research ideas.
Canvas data saved to Obsidian Vault. A+B Collider uses Claude to generate hypotheses.

---

## Frontend (`src/modules/ideas/MindMap.tsx`)

### Architecture

```
ReactFlowProvider
└── MindMapInner
    ├── CanvasSelector (dropdown)
    ├── Toolbar (add node, A+B collide, delete, save)
    ├── Flow canvas (React Flow)
    │   ├── IdeaNode (custom node type)
    │   ├── Background (dots)
    │   ├── Controls
    │   └── MiniMap
    └── ColliderModal (when 2 nodes selected)
```

### Custom Node: IdeaNode

- Double-click to edit label
- Colors: default white, collision result = amber
- Rounded corners, shadow on select
- Inline edit with commit on Enter/blur, cancel on Escape

### Canvas Management

```typescript
// List canvases
api.get<{ canvases: Canvas[] }>("/api/mindmap/canvases")

// Load canvas data
api.get<{ nodes: Node[], edges: Edge[] }>("/api/mindmap/{id}")

// Save canvas
api.put("/api/mindmap/{id}", { nodes: cleanNodes, edges })

// Create new canvas
api.post<{ id, name }>("/api/mindmap/canvases", { name })
```

**Important**: Before saving, strip function callbacks from node data:
```typescript
const cleanNodes = nodes.map((n) => ({
  ...n,
  data: Object.fromEntries(
    Object.entries(n.data).filter(([, v]) => typeof v !== "function")
  ),
}));
```

### A+B Collider

When 2+ nodes are selected, "A+B 撞击" button appears.

```typescript
// Collision API
api.post<CollideResult>("/api/mindmap/collide", {
  idea_a: selectedNodes[0].data.label,
  idea_b: selectedNodes[1].data.label,
})

// Response
interface CollideResult {
  hypothesis: string;  // Research hypothesis
  method: string;      // Methodology suggestion
  novelty: string;     // Novelty assessment
}
```

Result can be inserted as a new amber-colored node on the canvas.

### Interactions

- Double-click canvas → add new node at click position
- Drag nodes to reposition
- Connect nodes by dragging handles
- Select + Backspace or "删除" button to remove
- Dirty tracking → "保存*" indicator

---

## Backend API Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/mindmap/canvases` | List all canvases |
| POST | `/api/mindmap/canvases` | Create new canvas |
| GET | `/api/mindmap/{id}` | Load canvas data (nodes + edges) |
| PUT | `/api/mindmap/{id}` | Save canvas data |
| POST | `/api/mindmap/collide` | A+B idea collision via Claude |

---

## Vault Structure

```
{vault}/Ideas/
├── canvas-{uuid}.json      # Canvas metadata
└── idea-{uuid}.md           # Individual idea notes (optional)
```

---

## Impact on Gamification

- Idea node count → 产出力 (output) dimension: `idea_count * 5`
