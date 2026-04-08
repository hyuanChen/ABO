#!/usr/bin/env python3
"""Claude Session Cleaner — browse and delete Claude Code conversation sessions.

Usage: python scripts/claude_session_cleaner.py
Opens http://localhost:8234 in your browser.

Data sources (what /resume actually reads):
  ~/.claude/projects/<project-dir>/<sessionId>.jsonl  — session transcripts
  ~/.claude/projects/<project-dir>/<sessionId>/       — subagent data, tool results
  ~/.claude/history.jsonl                             — global command history
  ~/.claude/file-history/<sessionId>/                 — file change tracking
"""

import json
import shutil
import os
import webbrowser
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

CLAUDE_DIR = Path.home() / ".claude"
PROJECTS_DIR = CLAUDE_DIR / "projects"
HISTORY_FILE = CLAUDE_DIR / "history.jsonl"
FILE_HISTORY_DIR = CLAUDE_DIR / "file-history"
PORT = 8234


def _extract_session_info(session_path: Path) -> dict:
    """Extract first user message, timestamps, and cwd from a session .jsonl file."""
    first_msg = ""
    first_ts = ""
    last_ts = ""
    cwd = ""
    try:
        with open(session_path, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                ts = obj.get("timestamp", "")
                if ts:
                    if not first_ts:
                        first_ts = ts
                    last_ts = ts
                if not cwd and obj.get("cwd"):
                    cwd = obj["cwd"]
                if obj.get("type") == "user" and not first_msg:
                    msg = obj.get("message", {})
                    if isinstance(msg, dict):
                        content = msg.get("content", "")
                        if isinstance(content, list):
                            parts = []
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    parts.append(block.get("text", ""))
                                elif isinstance(block, str):
                                    parts.append(block)
                            content = " ".join(parts)
                        first_msg = str(content)[:120]
                    elif isinstance(msg, str):
                        first_msg = msg[:120]
    except Exception:
        pass
    return {"firstMsg": first_msg, "firstTs": first_ts, "lastTs": last_ts, "cwd": cwd}


def _iso_to_epoch_ms(iso_str: str) -> int:
    """Convert ISO 8601 timestamp to epoch milliseconds."""
    if not iso_str:
        return 0
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except Exception:
        return 0


def parse_sessions() -> list[dict]:
    """Scan ~/.claude/projects/*/*.jsonl to build session list (matches /resume)."""
    sessions = []
    if not PROJECTS_DIR.exists():
        return sessions

    for project_dir in PROJECTS_DIR.iterdir():
        if not project_dir.is_dir():
            continue
        for jsonl_file in project_dir.glob("*.jsonl"):
            sid = jsonl_file.stem
            # Skip non-UUID filenames
            if len(sid) < 30:
                continue
            info = _extract_session_info(jsonl_file)
            sessions.append({
                "sessionId": sid,
                "firstDisplay": info["firstMsg"],
                "project": info["cwd"] or project_dir.name,
                "projectDir": project_dir.name,
                "firstTs": _iso_to_epoch_ms(info["firstTs"]),
                "lastTs": _iso_to_epoch_ms(info["lastTs"]),
                "hasFileHistory": (FILE_HISTORY_DIR / sid).is_dir(),
                "hasSubdir": (project_dir / sid).is_dir(),
                "fileSize": jsonl_file.stat().st_size,
            })

    # Sort by lastTs descending (most recent first)
    sessions.sort(key=lambda x: x["lastTs"], reverse=True)
    return sessions


def delete_sessions(session_ids: list[str]) -> dict:
    """Delete sessions from all locations."""
    ids_set = set(session_ids)
    files_removed = 0
    dirs_removed = 0

    # 1. Remove session .jsonl files and subdirs from projects/
    if PROJECTS_DIR.exists():
        for project_dir in PROJECTS_DIR.iterdir():
            if not project_dir.is_dir():
                continue
            for sid in session_ids:
                # Remove .jsonl transcript
                jsonl = project_dir / f"{sid}.jsonl"
                if jsonl.exists():
                    jsonl.unlink()
                    files_removed += 1
                # Remove session subdir (subagents, tool-results)
                subdir = project_dir / sid
                if subdir.is_dir():
                    shutil.rmtree(subdir)
                    dirs_removed += 1

    # 2. Remove from history.jsonl
    history_lines_removed = 0
    if HISTORY_FILE.exists():
        kept_lines = []
        for line in HISTORY_FILE.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
                if obj.get("sessionId", "") in ids_set:
                    history_lines_removed += 1
                    continue
            except json.JSONDecodeError:
                pass
            kept_lines.append(line)
        tmp = HISTORY_FILE.with_suffix(".tmp")
        tmp.write_text("\n".join(kept_lines) + ("\n" if kept_lines else ""), encoding="utf-8")
        os.replace(tmp, HISTORY_FILE)

    # 3. Remove file-history directories
    for sid in session_ids:
        d = FILE_HISTORY_DIR / sid
        if d.is_dir():
            shutil.rmtree(d)
            dirs_removed += 1

    return {
        "filesRemoved": files_removed,
        "dirsRemoved": dirs_removed,
        "historyLinesRemoved": history_lines_removed,
    }


def get_session_messages(session_id: str) -> list[dict]:
    """Read all user messages from a session transcript file."""
    messages = []
    if not PROJECTS_DIR.exists():
        return messages
    for project_dir in PROJECTS_DIR.iterdir():
        if not project_dir.is_dir():
            continue
        jsonl = project_dir / f"{session_id}.jsonl"
        if not jsonl.exists():
            continue
        try:
            with open(jsonl, "r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip():
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if obj.get("type") != "user":
                        continue
                    msg = obj.get("message", {})
                    content = ""
                    if isinstance(msg, dict):
                        content = msg.get("content", "")
                        if isinstance(content, list):
                            parts = []
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    parts.append(block.get("text", ""))
                                elif isinstance(block, str):
                                    parts.append(block)
                            content = " ".join(parts)
                    elif isinstance(msg, str):
                        content = msg
                    if content:
                        messages.append({
                            "content": str(content)[:500],
                            "timestamp": obj.get("timestamp", ""),
                        })
        except Exception:
            pass
        break  # Found the file, no need to check other project dirs
    return messages


# ── HTML template (inline) ───────────────────────────────────────────
HTML_PAGE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Session Cleaner</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         background: #0d1117; color: #c9d1d9; min-height: 100vh; }
  .container { max-width: 1060px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22px; font-weight: 600; margin-bottom: 8px; color: #f0f6fc; }
  .subtitle { font-size: 13px; color: #8b949e; margin-bottom: 20px; }
  .toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  .toolbar input[type="text"] {
    flex: 1; min-width: 200px; padding: 8px 12px; border-radius: 6px;
    border: 1px solid #30363d; background: #161b22; color: #c9d1d9; font-size: 14px;
  }
  .toolbar input[type="text"]:focus { outline: none; border-color: #58a6ff; }
  .btn { padding: 8px 16px; border-radius: 6px; border: 1px solid #30363d;
         background: #21262d; color: #c9d1d9; cursor: pointer; font-size: 13px;
         transition: background .15s; white-space: nowrap; }
  .btn:hover { background: #30363d; }
  .btn-danger { background: #da3633; border-color: #f85149; color: #fff; }
  .btn-danger:hover { background: #b62324; }
  .btn-danger:disabled { opacity: .4; cursor: not-allowed; }
  .stats { font-size: 13px; color: #8b949e; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 10px 12px; font-size: 12px; color: #8b949e;
       border-bottom: 1px solid #21262d; font-weight: 500; text-transform: uppercase;
       letter-spacing: .5px; position: sticky; top: 0; background: #0d1117; z-index: 10; }
  td { padding: 10px 12px; border-bottom: 1px solid #161b22; font-size: 13px; vertical-align: top; }
  tr:hover td { background: #161b22; }
  tr.selected td { background: #1c2128; }
  .display-text { max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #f0f6fc; cursor: pointer; }
  .display-text:hover { color: #58a6ff; }
  .msg-detail { display: none; margin-top: 8px; }
  .msg-detail.open { display: block; }
  .msg-detail-item { padding: 6px 10px; margin: 4px 0; background: #0d1117; border-left: 2px solid #30363d;
    border-radius: 4px; font-size: 12px; color: #c9d1d9; white-space: pre-wrap; word-break: break-all; line-height: 1.5; }
  .msg-detail-item .msg-time { color: #484f58; font-size: 11px; margin-bottom: 2px; }
  .msg-detail-loading { color: #8b949e; font-size: 12px; padding: 6px 0; }
  .project-text { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #8b949e; font-size: 12px; }
  .time-text { color: #8b949e; font-size: 12px; white-space: nowrap; }
  .size-text { color: #8b949e; font-size: 12px; white-space: nowrap; }
  input[type="checkbox"] { accent-color: #58a6ff; width: 16px; height: 16px; cursor: pointer; }
  .confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6);
    display: flex; align-items: center; justify-content: center; z-index: 100; }
  .confirm-box { background: #161b22; border: 1px solid #30363d; border-radius: 12px;
    padding: 24px; max-width: 440px; width: 90%; }
  .confirm-box h3 { color: #f85149; margin-bottom: 12px; font-size: 16px; }
  .confirm-box p { color: #8b949e; margin-bottom: 16px; font-size: 14px; line-height: 1.5; }
  .confirm-box .actions { display: flex; gap: 12px; justify-content: flex-end; }
  .hidden { display: none; }
  .toast { position: fixed; bottom: 24px; right: 24px; background: #238636; color: #fff;
    padding: 12px 20px; border-radius: 8px; font-size: 14px; z-index: 200;
    animation: fadeIn .3s; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .loading { text-align: center; padding: 40px; color: #8b949e; }
  tr { cursor: pointer; user-select: none; }
  .shortcut-hint { font-size: 11px; color: #484f58; margin-top: 4px; }
</style>
</head>
<body>
<div class="container">
  <h1>Claude Session Cleaner</h1>
  <p class="subtitle">Scans <code>~/.claude/projects/</code> for session transcripts (same source as <code>/resume</code>). Deletes from all locations.</p>

  <div class="toolbar">
    <input type="text" id="search" placeholder="Search by message text, project path, or session ID...">
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:#8b949e;">
      <input type="checkbox" id="selectAll"> Select all visible
    </label>
    <button class="btn btn-danger" id="deleteBtn" disabled>Delete selected (0)</button>
    <span class="stats" id="statsText"></span>
  </div>
  <p class="shortcut-hint">Click to select. Shift+Click to select range. Cmd/Ctrl+Click to toggle single.</p>

  <table>
    <thead>
      <tr>
        <th style="width:36px;"></th>
        <th>First Message</th>
        <th>Project</th>
        <th>Last Active</th>
        <th>Size</th>
      </tr>
    </thead>
    <tbody id="tbody"><tr><td colspan="5" class="loading">Loading sessions...</td></tr></tbody>
  </table>
</div>

<div class="confirm-overlay hidden" id="confirmOverlay">
  <div class="confirm-box">
    <h3>Confirm Deletion</h3>
    <p id="confirmText"></p>
    <div class="actions">
      <button class="btn" id="cancelBtn">Cancel</button>
      <button class="btn btn-danger" id="confirmBtn">Delete permanently</button>
    </div>
  </div>
</div>

<script>
let sessions = [];
let selected = new Set();
let lastClickedIndex = -1; // For shift+click range selection

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1024/1024).toFixed(1) + ' MB';
}

function getFiltered() {
  const q = document.getElementById('search').value.toLowerCase();
  return sessions.filter(s =>
    s.firstDisplay.toLowerCase().includes(q) ||
    s.project.toLowerCase().includes(q) ||
    s.sessionId.toLowerCase().includes(q)
  );
}

async function load() {
  const res = await fetch('/api/sessions');
  sessions = await res.json();
  const totalSize = sessions.reduce((a,s) => a + (s.fileSize||0), 0);
  document.getElementById('statsText').textContent =
    `${sessions.length} sessions (${fmtSize(totalSize)} total)`;
  lastClickedIndex = -1;
  render();
}

function render() {
  const tbody = document.getElementById('tbody');
  const filtered = getFiltered();
  tbody.innerHTML = filtered.map((s, i) => {
    const checked = selected.has(s.sessionId) ? 'checked' : '';
    const cls = selected.has(s.sessionId) ? 'selected' : '';
    const date = s.lastTs ? new Date(s.lastTs).toLocaleString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '\u2014';
    return `<tr class="${cls}" data-sid="${s.sessionId}" data-idx="${i}">
      <td><input type="checkbox" ${checked} data-sid="${s.sessionId}" data-idx="${i}"></td>
      <td>
        <div class="display-text" data-expand="${s.sessionId}" title="Click to expand messages">${esc(s.firstDisplay) || '<em style="color:#484f58">(no user message)</em>'}</div>
        <div class="msg-detail" id="detail-${s.sessionId}"></div>
      </td>
      <td><div class="project-text" title="${esc(s.project)}">${esc(s.project.replace(/^\/Users\/huanc\//,'~/'))}</div></td>
      <td class="time-text">${date}</td>
      <td class="size-text">${fmtSize(s.fileSize||0)}</td>
    </tr>`;
  }).join('');
  updateDeleteBtn();
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function updateDeleteBtn() {
  const btn = document.getElementById('deleteBtn');
  btn.textContent = `Delete selected (${selected.size})`;
  btn.disabled = selected.size === 0;
}

// Expand/collapse message detail on display-text click
let expandedCache = {}; // sessionId -> messages array
document.getElementById('tbody').addEventListener('click', async e => {
  // Handle display-text click -> expand messages
  const expandEl = e.target.closest('[data-expand]');
  if (expandEl) {
    e.stopPropagation();
    const sid = expandEl.dataset.expand;
    const detail = document.getElementById('detail-' + sid);
    if (!detail) return;
    if (detail.classList.contains('open')) {
      detail.classList.remove('open');
      return;
    }
    // Load messages if not cached
    if (!expandedCache[sid]) {
      detail.innerHTML = '<div class="msg-detail-loading">Loading messages...</div>';
      detail.classList.add('open');
      const res = await fetch('/api/messages/' + sid);
      expandedCache[sid] = await res.json();
    }
    const msgs = expandedCache[sid];
    if (msgs.length === 0) {
      detail.innerHTML = '<div class="msg-detail-loading">No user messages found</div>';
    } else {
      detail.innerHTML = msgs.map(m => {
        const t = m.timestamp ? new Date(m.timestamp).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
        return `<div class="msg-detail-item"><div class="msg-time">${t}</div>${esc(m.content)}</div>`;
      }).join('');
    }
    detail.classList.add('open');
    return;
  }

  // Handle row click -> selection (checkbox, shift, ctrl)
  const tr = e.target.closest('tr');
  if (!tr) return;
  const sid = tr.dataset.sid;
  const idx = parseInt(tr.dataset.idx, 10);
  const filtered = getFiltered();
  if (isNaN(idx) || !sid) return;

  if (e.shiftKey && lastClickedIndex >= 0) {
    const lo = Math.min(lastClickedIndex, idx);
    const hi = Math.max(lastClickedIndex, idx);
    for (let i = lo; i <= hi; i++) {
      if (filtered[i]) selected.add(filtered[i].sessionId);
    }
  } else if (e.metaKey || e.ctrlKey) {
    if (selected.has(sid)) selected.delete(sid); else selected.add(sid);
  } else {
    if (selected.has(sid)) selected.delete(sid); else selected.add(sid);
  }
  lastClickedIndex = idx;
  render();
});

// Prevent checkbox default so our click handler manages everything
document.getElementById('tbody').addEventListener('change', e => {
  if (e.target.type === 'checkbox') e.preventDefault();
});

document.getElementById('search').addEventListener('input', () => {
  lastClickedIndex = -1;
  render();
});

document.getElementById('selectAll').addEventListener('change', e => {
  const visible = getFiltered();
  if (e.target.checked) visible.forEach(s => selected.add(s.sessionId));
  else visible.forEach(s => selected.delete(s.sessionId));
  render();
});

document.getElementById('deleteBtn').addEventListener('click', () => {
  const totalSize = sessions.filter(s => selected.has(s.sessionId)).reduce((a,s) => a + (s.fileSize||0), 0);
  document.getElementById('confirmText').textContent =
    `This will permanently delete ${selected.size} session(s) (${fmtSize(totalSize)}) from all locations: projects/, history.jsonl, and file-history/. This cannot be undone.`;
  document.getElementById('confirmOverlay').classList.remove('hidden');
});

document.getElementById('cancelBtn').addEventListener('click', () => {
  document.getElementById('confirmOverlay').classList.add('hidden');
});

document.getElementById('confirmBtn').addEventListener('click', async () => {
  document.getElementById('confirmOverlay').classList.add('hidden');
  const ids = [...selected];
  const res = await fetch('/api/delete', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({sessionIds: ids})
  });
  const result = await res.json();
  selected.clear();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = `Deleted: ${result.filesRemoved} files, ${result.dirsRemoved} dirs, ${result.historyLinesRemoved} history lines`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
  load();
});

load();
</script>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/sessions":
            data = parse_sessions()
            self._json(200, data)
        elif path.startswith("/api/messages/"):
            sid = path.split("/api/messages/", 1)[1]
            msgs = get_session_messages(sid)
            self._json(200, msgs)
        elif path == "/" or path == "":
            self._html(200, HTML_PAGE)
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/delete":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            ids = body.get("sessionIds", [])
            result = delete_sessions(ids)
            self._json(200, result)
        else:
            self._json(404, {"error": "not found"})

    def _json(self, code, data):
        payload = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _html(self, code, html):
        payload = html.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass  # Suppress request logs


def main():
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}"
    print(f"Claude Session Cleaner running at {url}")
    print("Press Ctrl+C to stop.\n")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
