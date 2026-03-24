"""A+B idea collision — uses Claude batch_call to generate research hypothesis."""
from abo.claude_bridge.runner import batch_call


async def collide_ab(idea_a: str, idea_b: str) -> dict:
    """Collide two ideas and return hypothesis + reasoning."""
    prompt = (
        "你是一位科研创意撞击助手。请将以下两个研究想法进行创意碰撞，"
        "生成一个新颖的研究假设（hypothesis）和简短的方法论思路（method）。\n\n"
        f"想法 A: {idea_a}\n"
        f"想法 B: {idea_b}\n\n"
        "请用以下格式回复（只输出 JSON，不要其他文字）：\n"
        '{"hypothesis": "...", "method": "...", "novelty": "..."}'
    )
    raw = await batch_call(prompt)

    # Try to extract JSON from the response
    import json
    import re
    match = re.search(r'\{[^{}]+\}', raw, re.DOTALL)
    if match:
        try:
            result = json.loads(match.group())
            return {
                "hypothesis": result.get("hypothesis", raw),
                "method": result.get("method", ""),
                "novelty": result.get("novelty", ""),
            }
        except Exception:
            pass
    return {"hypothesis": raw, "method": "", "novelty": ""}
