"""Context builder for Claude prompts — injects vault + game state."""
from pathlib import Path

import frontmatter

from abo.config import load_config
from abo.game.state import load_state


def build_context(vault_path: str, current_file: str | None = None) -> str:
    parts = [f"当前 Vault 路径: {vault_path}"]

    if current_file:
        md = Path(vault_path) / current_file
        if md.exists():
            post = frontmatter.load(str(md))
            parts.append(f"当前文献: {post.get('title', md.stem)}")
            if post.content.strip():
                parts.append(f"内容摘要:\n{post.content[:2000]}")

    state = load_state(vault_path)
    energy = state["energy"]
    parts.append(f"用户精力值: {energy['current']}/{energy['max']} ({_energy_label(energy['current'], energy['max'])})")
    parts.append(f"用户等级: Lv.{state.get('level', 1)} {state.get('title', '')}")

    return "\n".join(parts)


def _energy_label(current: int, max_e: int) -> str:
    pct = (current / max_e) * 100
    if pct >= 80: return "高效模式"
    if pct >= 50: return "正常模式"
    if pct >= 20: return "疲惫模式"
    return "耗尽状态"
