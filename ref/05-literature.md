# 05 — Literature Module

> Read this for literature library, PDF import, digest levels, or search changes.

---

## Overview

Literature module: PDF/DOI import → Claude note generation → SQLite FTS5 search → Obsidian integration.

---

## Backend

### Import (`abo/literature/importer.py`)

Two import modes:
- **DOI**: Fetches metadata via CrossRef API, downloads PDF
- **PDF**: Direct local file path

Both extract text via `pypdf` + `pdfminer.six`, then call Claude for structured notes.

### Indexer (`abo/literature/indexer.py`)

SQLite FTS5 full-text search on paper content.

### Routes (in `abo/main.py` or separate router)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/literature` | List all papers |
| GET | `/api/literature/search?q=...` | FTS5 search |
| GET | `/api/literature/{id}/note` | Get paper note with markdown content |
| POST | `/api/literature/import/doi` | Import via DOI |
| POST | `/api/literature/import/pdf` | Import via PDF path |
| POST | `/api/literature/{id}/digest` | Upgrade digest level |
| GET | `/api/fs/pick-pdf` | File picker (Tauri dialog) |

---

## Frontend (`src/modules/literature/Literature.tsx`)

### Digest Level System

5 levels representing reading depth:

| Level | Label | Color |
|-------|-------|-------|
| 0 | 收录 | slate |
| 1 | 扫读 | blue |
| 2 | 精读 | indigo |
| 3 | 内化 | violet |
| 4 | 融会 | amber |

Each upgrade triggers Claude to generate deeper notes. Upgrading awards XP.

### UI Structure

```
Header: title + search bar + "导入文献" button
Filter tabs: 全部 | Lv.0 收录 | Lv.1 扫读 | ...
Body: Paper list (left) + Paper detail panel (right, optional)
Import modal: DOI or PDF mode
```

### Paper Row

Shows: icon, title, authors, year, DOI link, digest badge, upgrade button, Obsidian link.

### Paper Detail Panel

Side panel (w-96) with:
- Title, authors, year, DOI
- Digest badge + upgrade button
- Markdown note content (rendered via ReactMarkdown + remarkGfm)
- "在 Obsidian 中打开" button

### Obsidian Integration

Opens via `obsidian://open?vault={name}&file={path}` URI:
```typescript
const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filePath)}`;
// Try Tauri plugin-opener first, fallback to window.open
```

---

## Vault Structure

Papers are stored as Markdown with YAML frontmatter:

```
{vault}/Literature/{PaperId}.md
```

Frontmatter includes: title, authors, year, doi, digest_level, abo-type.

---

## Impact on Gamification

- Literature count → 研究力 (research) dimension: `lit_count * 2`
- Digest upgrades → XP awards
- Reading milestones → skill unlocks
