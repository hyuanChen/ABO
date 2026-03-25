"""ABO CLI — command-line interface for all core features.

Usage:
  python -m abo.cli paper import <pdf_or_doi>
  python -m abo.cli paper search <query>
  python -m abo.cli paper digest <paper_id> <level>
  python -m abo.cli energy log <event_type>
  python -m abo.cli energy status
  python -m abo.cli skill list
  python -m abo.cli skill xp add <skill_id> <amount>
  python -m abo.cli obsidian open <file_path>
  python -m abo.cli obsidian search <query>
  python -m abo.cli stats
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys


# ── helpers ───────────────────────────────────────────────────────────────────

def _get_vault() -> str:
    from abo.config import load_config
    cfg = load_config()
    if not cfg.get("is_configured"):
        print("Error: ABO not configured. Run the desktop app first to set a vault path.", file=sys.stderr)
        sys.exit(1)
    return cfg["vault_path"]


def _ok(msg: str) -> None:
    print(f"\033[32m✓\033[0m  {msg}")


def _err(msg: str) -> None:
    print(f"\033[31m✗\033[0m  {msg}", file=sys.stderr)


def _json(obj) -> None:
    print(json.dumps(obj, ensure_ascii=False, indent=2))


# ── paper sub-commands ────────────────────────────────────────────────────────

def cmd_paper_import(args) -> None:
    vault = _get_vault()
    value: str = args.value

    async def _run():
        from abo.literature.importer import import_doi, import_pdf
        if value.startswith("10.") or ("/" in value and not value.startswith("/")):
            paper = await import_doi(value, vault)
        else:
            paper = await import_pdf(value, vault)
        _ok(f"Imported: {paper['title']} [{paper['paper_id']}]")
        _ok(f"+5 XP  ·  digest_level={paper['digest_level']}")

    asyncio.run(_run())


def cmd_paper_search(args) -> None:
    vault = _get_vault()
    from abo.literature.indexer import search_papers
    results = search_papers(vault, args.query)
    if not results:
        print("No results found.")
        return
    for p in results:
        authors_short = (p.get("authors") or "Unknown")[:40]
        year = p.get("year") or "?"
        print(f"  [{p['paper_id']}]  {p['title'][:60]}  —  {authors_short} ({year})  Lv.{p.get('digest_level', 0)}")


def cmd_paper_digest(args) -> None:
    vault = _get_vault()
    from abo.literature.importer import upgrade_digest
    result = upgrade_digest(vault, args.paper_id, int(args.level))
    _ok(f"Digest upgraded to Lv.{result['digest_level']}  paper={args.paper_id}")
    if result.get("xp_awarded", 0) > 0:
        _ok(f"+{result['xp_awarded']} XP")


# ── energy sub-commands ───────────────────────────────────────────────────────

def cmd_energy_log(args) -> None:
    vault = _get_vault()
    from abo.game.energy import log_energy_event, ALL_EVENTS
    if args.event_type not in ALL_EVENTS:
        _err(f"Unknown event type: {args.event_type}")
        _err(f"Valid events: {', '.join(ALL_EVENTS)}")
        sys.exit(1)
    state = log_energy_event(vault, args.event_type)
    energy = state["energy"]
    _ok(f"Energy: {energy['current']}/{energy['max']}  ({args.event_type})")


def cmd_energy_status(args) -> None:
    vault = _get_vault()
    from abo.game.state import load_state
    from abo.game.energy import get_status_label
    state = load_state(vault)
    energy = state["energy"]
    cur, mx = energy["current"], energy["max"]
    pct = int(cur / mx * 100)
    label = get_status_label(cur, mx)
    bar_filled = int(pct / 5)
    bar = "█" * bar_filled + "░" * (20 - bar_filled)
    print(f"  精力值  [{bar}]  {cur}/{mx} ({pct}%)  {label}")
    log = energy.get("log", [])
    if log:
        print("\n  最近记录:")
        for entry in log[-5:]:
            sign = "+" if entry["delta"] >= 0 else ""
            print(f"    {entry['time']}  {sign}{entry['delta']}  {entry['reason']}")


# ── skill sub-commands ────────────────────────────────────────────────────────

def cmd_skill_list(args) -> None:
    vault = _get_vault()
    from abo.game.skills import get_skills_with_state
    skills = get_skills_with_state(vault)
    if not skills:
        print("No skills found. Ensure skill-tree.yaml exists in your vault.")
        return
    print(f"  {'ID':<22} {'Name':<18} {'Lv':>4}  {'XP':>8}  Status")
    print("  " + "-" * 64)
    for sk in skills:
        status = "✓ unlocked" if sk["unlocked"] else "  locked"
        bar_pct = int((sk["xp_in_level"] / max(sk["xp_for_next"], 1)) * 10)
        bar = "▓" * bar_pct + "░" * (10 - bar_pct)
        print(f"  {sk['id']:<22} {sk['name']:<18} {sk['level']:>4}  {sk['xp_total']:>8}  [{bar}] {status}")


def cmd_skill_xp_add(args) -> None:
    vault = _get_vault()
    from abo.game.skills import award_xp
    result = award_xp(vault, args.skill_id, int(args.amount))
    _ok(f"+{args.amount} XP  →  skill={args.skill_id}")
    li = result.get("level_info", {})
    if li.get("leveled_up"):
        _ok(f"Level up!  Lv.{li['new_level']} {li['new_title']}")
    for ach in result.get("new_achievements", []):
        _ok(f"Achievement unlocked: {ach['name']}  —  {ach['desc']}")


# ── obsidian sub-commands ─────────────────────────────────────────────────────

def cmd_obsidian_open(args) -> None:
    vault = _get_vault()
    from pathlib import Path
    vault_name = Path(vault).name
    from abo.obsidian.uri import open_file
    open_file(vault_name, args.file_path)
    _ok(f"Opened in Obsidian: {args.file_path}")


def cmd_obsidian_search(args) -> None:
    vault = _get_vault()
    from pathlib import Path
    vault_name = Path(vault).name
    from abo.obsidian.uri import search_vault
    search_vault(vault_name, args.query)
    _ok(f"Searching Obsidian for: {args.query}")


# ── stats ─────────────────────────────────────────────────────────────────────

def cmd_stats(args) -> None:
    vault = _get_vault()
    from abo.game.state import load_state
    state = load_state(vault)
    print(f"  Lv.{state.get('level', 1)}  {state.get('title', '初入江湖')}  —  Total XP: {state.get('total_xp', 0)}")
    stats = state.get("stats", {})
    rows = [
        ("任务完成", stats.get("tasks_completed_total", 0)),
        ("文献导入", stats.get("papers_imported", 0)),
        ("A+B 撞击", stats.get("ab_collisions", 0)),
        ("Claude 会话", stats.get("claude_sessions", 0)),
        ("活跃天数", len(stats.get("active_days", []))),
    ]
    print()
    for label, val in rows:
        print(f"  {label:<12}  {val}")
    achs = state.get("achievements", [])
    if achs:
        print(f"\n  成就 ({len(achs)}): {', '.join(achs)}")


# ── argument parser ───────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m abo.cli",
        description="ABO — Academic Buddy OS CLI",
    )
    sub = p.add_subparsers(dest="command", required=True)

    # paper
    paper = sub.add_parser("paper", help="Literature management")
    paper_sub = paper.add_subparsers(dest="subcommand", required=True)

    pi = paper_sub.add_parser("import", help="Import a paper by DOI or PDF path")
    pi.add_argument("value", help="DOI (e.g. 10.48550/arXiv.1706.03762) or /path/to/paper.pdf")
    pi.set_defaults(func=cmd_paper_import)

    ps = paper_sub.add_parser("search", help="Full-text search literature")
    ps.add_argument("query")
    ps.set_defaults(func=cmd_paper_search)

    pd = paper_sub.add_parser("digest", help="Upgrade digest level (0-4)")
    pd.add_argument("paper_id")
    pd.add_argument("level", type=int, choices=range(1, 5))
    pd.set_defaults(func=cmd_paper_digest)

    # energy
    energy = sub.add_parser("energy", help="Energy system")
    energy_sub = energy.add_subparsers(dest="subcommand", required=True)

    el = energy_sub.add_parser("log", help="Log an energy event")
    el.add_argument("event_type", help="rest|exercise|meditation|coffee|sleep|focus|review|light|meeting|ai_test")
    el.set_defaults(func=cmd_energy_log)

    es = energy_sub.add_parser("status", help="Show current energy")
    es.set_defaults(func=cmd_energy_status)

    # skill
    skill = sub.add_parser("skill", help="Skill tree")
    skill_sub = skill.add_subparsers(dest="subcommand", required=True)

    sl = skill_sub.add_parser("list", help="List all skills with XP/level")
    sl.set_defaults(func=cmd_skill_list)

    sx = skill_sub.add_parser("xp", help="Award XP to a skill")
    sx_sub = sx.add_subparsers(dest="subsubcommand", required=True)
    sxa = sx_sub.add_parser("add", help="Add XP to a skill")
    sxa.add_argument("skill_id")
    sxa.add_argument("amount", type=int)
    sxa.set_defaults(func=cmd_skill_xp_add)

    # obsidian
    obs = sub.add_parser("obsidian", help="Obsidian integration")
    obs_sub = obs.add_subparsers(dest="subcommand", required=True)

    oo = obs_sub.add_parser("open", help="Open a file in Obsidian")
    oo.add_argument("file_path", help="Relative path within vault (e.g. Literature/paper.md)")
    oo.set_defaults(func=cmd_obsidian_open)

    oq = obs_sub.add_parser("search", help="Search in Obsidian")
    oq.add_argument("query")
    oq.set_defaults(func=cmd_obsidian_search)

    # stats
    st = sub.add_parser("stats", help="Show research statistics and achievements")
    st.set_defaults(func=cmd_stats)

    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except KeyboardInterrupt:
        print("\nAborted.", file=sys.stderr)
        sys.exit(130)
    except Exception as e:
        _err(str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
