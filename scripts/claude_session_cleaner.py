#!/usr/bin/env python3
"""Claude Session Cleaner — browse and delete Claude Code conversation sessions.

Usage: python scripts/claude_session_cleaner.py
Opens http://localhost:8234 in your browser.
"""

import json
import shutil
import os
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

CLAUDE_DIR = Path.home() / ".claude"
HISTORY_FILE = CLAUDE_DIR / "history.jsonl"
FILE_HISTORY_DIR = CLAUDE_DIR / "file-history"
PORT = 8234


def parse_sessions(history_path: Path) -> list[dict]:
    """Parse history.jsonl into a list of session summaries."""
    sessions: dict[str, dict] = {}
    if not history_path.exists():
        return []
    for line in history_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        obj = json.loads(line)
        sid = obj.get("sessionId", "")
        ts = obj.get("timestamp", 0)
        if sid not in sessions:
            sessions[sid] = {
                "sessionId": sid,
                "firstDisplay": obj.get("display", "")[:120],
                "project": obj.get("project", ""),
                "msgCount": 0,
                "firstTs": ts,
                "lastTs": ts,
            }
        s = sessions[sid]
        s["msgCount"] += 1
        if ts < s["firstTs"]:
            s["firstTs"] = ts
            s["firstDisplay"] = obj.get("display", "")[:120]
        if ts > s["lastTs"]:
            s["lastTs"] = ts
    # Sort by lastTs descending (most recent first)
    result = sorted(sessions.values(), key=lambda x: x["lastTs"], reverse=True)
    # Check if file-history dir exists for each session
    for s in result:
        s["hasFileHistory"] = (FILE_HISTORY_DIR / s["sessionId"]).is_dir()
    return result


def delete_sessions(session_ids: list[str], history_path: Path, file_history_dir: Path) -> dict:
    """Delete sessions from history.jsonl and file-history directories."""
    ids_set = set(session_ids)
    # 1. Rewrite history.jsonl without matching lines
    kept_lines = []
    removed_count = 0
    if history_path.exists():
        for line in history_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            obj = json.loads(line)
            if obj.get("sessionId", "") in ids_set:
                removed_count += 1
            else:
                kept_lines.append(line)
        # Atomic write
        tmp = history_path.with_suffix(".tmp")
        tmp.write_text("\n".join(kept_lines) + ("\n" if kept_lines else ""), encoding="utf-8")
        os.replace(tmp, history_path)

    # 2. Remove file-history directories
    dirs_removed = 0
    for sid in session_ids:
        d = file_history_dir / sid
        if d.is_dir():
            shutil.rmtree(d)
            dirs_removed += 1

    return {"linesRemoved": removed_count, "dirsRemoved": dirs_removed}


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
  .container { max-width: 960px; margin: 0 auto; padding: 24px; }
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
       letter-spacing: .5px; position: sticky; top: 0; background: #0d1117; }
  td { padding: 10px 12px; border-bottom: 1px solid #161b22; font-size: 13px; vertical-align: top; }
  tr:hover td { background: #161b22; }
  tr.selected td { background: #1c2128; }
  .display-text { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #f0f6fc; }
  .project-text { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #8b949e; font-size: 12px; }
  .time-text { color: #8b949e; font-size: 12px; white-space: nowrap; }
  .msg-count { color: #58a6ff; font-weight: 500; }
  .no-dir { color: #f0883e; font-size: 11px; }
  .has-dir { color: #3fb950; font-size: 11px; }
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
</style>
</head>
<body>
<div class="container">
  <h1>Claude Session Cleaner</h1>
  <p class="subtitle">Select conversations to delete from <code>~/.claude/history.jsonl</code> and <code>~/.claude/file-history/</code></p>

  <div class="toolbar">
    <input type="text" id="search" placeholder="Search by display text or project path...">
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:#8b949e;">
      <input type="checkbox" id="selectAll"> Select all visible
    </label>
    <button class="btn btn-danger" id="deleteBtn" disabled>Delete selected (0)</button>
    <span class="stats" id="statsText"></span>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:36px;"></th>
        <th>First Message</th>
        <th>Project</th>
        <th>Msgs</th>
        <th>Last Active</th>
        <th>Data</th>
      </tr>
    </thead>
    <tbody id="tbody"></tbody>
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

async function load() {
  const res = await fetch('/api/sessions');
  sessions = await res.json();
  document.getElementById('statsText').textContent = `${sessions.length} sessions, ${sessions.reduce((a,s)=>a+s.msgCount,0)} messages total`;
  render();
}

function render() {
  const q = document.getElementById('search').value.toLowerCase();
  const tbody = document.getElementById('tbody');
  const filtered = sessions.filter(s =>
    s.firstDisplay.toLowerCase().includes(q) || s.project.toLowerCase().includes(q) || s.sessionId.toLowerCase().includes(q)
  );
  tbody.innerHTML = filtered.map(s => {
    const checked = selected.has(s.sessionId) ? 'checked' : '';
    const cls = selected.has(s.sessionId) ? 'selected' : '';
    const date = new Date(s.lastTs).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    const dirBadge = s.hasFileHistory ? '<span class="has-dir">dir</span>' : '<span class="no-dir">no dir</span>';
    return `<tr class="${cls}" data-sid="${s.sessionId}">
      <td><input type="checkbox" ${checked} data-sid="${s.sessionId}"></td>
      <td><div class="display-text" title="${esc(s.firstDisplay)}">${esc(s.firstDisplay) || '<em style="color:#484f58">(empty)</em>'}</div></td>
      <td><div class="project-text" title="${esc(s.project)}">${esc(s.project.replace(/^\/Users\/huanc\//,'~/'))}</div></td>
      <td class="msg-count">${s.msgCount}</td>
      <td class="time-text">${date}</td>
      <td>${dirBadge}</td>
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

document.getElementById('tbody').addEventListener('change', e => {
  if (e.target.type === 'checkbox') {
    const sid = e.target.dataset.sid;
    if (e.target.checked) selected.add(sid); else selected.delete(sid);
    render();
  }
});

document.getElementById('search').addEventListener('input', () => {
  render();
});

document.getElementById('selectAll').addEventListener('change', e => {
  const q = document.getElementById('search').value.toLowerCase();
  const visible = sessions.filter(s =>
    s.firstDisplay.toLowerCase().includes(q) || s.project.toLowerCase().includes(q) || s.sessionId.toLowerCase().includes(q)
  );
  if (e.target.checked) visible.forEach(s => selected.add(s.sessionId));
  else visible.forEach(s => selected.delete(s.sessionId));
  render();
});

document.getElementById('deleteBtn').addEventListener('click', () => {
  const msgs = sessions.filter(s => selected.has(s.sessionId)).reduce((a,s)=>a+s.msgCount, 0);
  document.getElementById('confirmText').textContent =
    `This will permanently delete ${selected.size} session(s) (${msgs} messages) from history.jsonl and remove their file-history directories. This cannot be undone.`;
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
  // Show toast
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = `Deleted: ${result.linesRemoved} lines, ${result.dirsRemoved} directories`;
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
            data = parse_sessions(HISTORY_FILE)
            self._json(200, data)
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
            result = delete_sessions(ids, HISTORY_FILE, FILE_HISTORY_DIR)
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
