# 09 — New Feature Checklist

> Step-by-step checklist for adding any new feature end-to-end.

---

## Before You Start

1. Read `ref/00-architecture.md` to understand the project
2. Read the relevant feature guide from `ref/`
3. Run `npx tsc --noEmit` to verify current state compiles

---

## Backend Steps

### B1. Create Python Module (if new backend module)

```
abo/default_modules/{name}/
└── __init__.py
```

```python
from abo.sdk import Module, Item, Card, claude_json

class MyModule(Module):
    id       = "my-module"
    name     = "模块名"
    schedule = "0 8 * * *"
    icon     = "lucide-icon-name"
    output   = ["obsidian", "ui"]

    async def fetch(self) -> list[Item]: ...
    async def process(self, items, prefs) -> list[Card]: ...
```

### B2. Add API Routes (if custom endpoints needed)

Option A: Add directly to `abo/main.py`
Option B: Create `abo/{feature}/routes.py` with `APIRouter(prefix="/api/{feature}")`

If using APIRouter:
```python
# abo/{feature}/routes.py
from fastapi import APIRouter
router = APIRouter(prefix="/api/{feature}")

@router.get("")
async def get_data(): ...

# abo/main.py — add:
from .{feature}.routes import router as feature_router
app.include_router(feature_router)
```

### B3. Add Data Persistence (if new data)

For JSON data → follow pattern in `abo/profile/store.py`:
```python
def _read(filename, default): ...   # ~/.abo/{filename}
def _write(filename, data): ...     # Atomic: tmp + os.replace
```

For SQLite → extend `abo/store/cards.py` or create new store.

### B4. Verify Backend

```bash
python -m abo.main
curl http://127.0.0.1:8765/api/{feature}  # Test your endpoints
```

---

## Frontend Steps

### F1. Update Store (if new state needed)

Edit `src/core/store.ts`:
- Add new state fields + setters to `AboStore` interface
- Add initial values + setter implementations in `create<AboStore>`
- Export any new types

### F2. Add Tab to Navigation

**Only if this is a new navigable page** (not a sub-component):

1. `src/core/store.ts` — add to `ActiveTab` union type
2. `src/modules/nav/NavSidebar.tsx` — add to `MAIN` or `AUTO` array:
   ```typescript
   { id: "newtab", label: "标签名", Icon: LucideIconName },
   ```
3. `src/modules/MainContent.tsx` — add conditional render:
   ```tsx
   import NewComponent from "./newfeature/NewComponent";
   // In return:
   {activeTab === "newtab" && <NewComponent />}
   ```

### F3. Create Component

```
src/modules/{feature}/
└── FeatureName.tsx
```

Follow page structure pattern from `ref/02-frontend-patterns.md`:
- Header bar with icon + title
- Scrollable content area
- Empty state for no data
- Loading state

### F4. Connect to API

```typescript
import { api } from "../../core/api";

useEffect(() => {
  api.get<ResponseType>("/api/{feature}")
    .then(setData)
    .catch(() => {});
}, []);
```

### F5. Type Check

```bash
npx tsc --noEmit
```

Fix any errors before proceeding.

### F6. Visual Test

```bash
# Terminal 1
python -m abo.main

# Terminal 2
npm run dev
```

Open `http://localhost:1420`, navigate to your new tab, verify UI.

---

## Gamification Integration (if applicable)

### G1. Update Stats Calculator

Edit `abo/profile/stats.py` `calculate_stats()`:
- Add data source counting
- Update dimension score formula
- Document in `ref/03-profile-gamification.md`

### G2. Add Skill Nodes (optional)

Edit `src/modules/profile/SkillGrid.tsx`:
- Add skills to relevant dimension in `DIMENSIONS` array

### G3. Add Achievement (optional)

Edit `src/modules/profile/AchievementGallery.tsx`:
- Add to `ACHIEVEMENTS` array
- Backend: call `unlock_achievement()` when condition met

---

## Commit Convention

```bash
git add <specific files>
git commit -m "feat({feature}): short description"
```

Feature prefix examples: `feat(meeting)`, `feat(health)`, `feat(podcast)`, `feat(trends)`

---

## Common Pitfalls

1. **api.post requires body** — always pass `{}` even for empty body
2. **ActiveTab type** — must be added to union before using in components
3. **Dark mode** — every `bg-*` / `text-*` class needs a `dark:` variant
4. **Lucide icons** — import individually, use `aria-hidden` prop
5. **JSON persistence** — always use atomic write pattern (tmp + os.replace)
6. **Claude calls** — `claude_json()` returns `{}` on parse failure, handle gracefully
7. **Module config** — read from `~/.abo/preferences.json` under `modules.{module-id}`
8. **Score normalization** — Claude returns 1-10, Card.score is 0.0-1.0, divide by 10
