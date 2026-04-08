import sys, json
from pathlib import Path

# Add scripts dir to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))


def test_parse_sessions(tmp_path):
    """Write a fake history.jsonl and verify parse_sessions returns correct data."""
    history = tmp_path / "history.jsonl"
    history.write_text(
        '{"display":"hello","pastedContents":{},"timestamp":1000,"project":"/tmp","sessionId":"aaa-111"}\n'
        '{"display":"world","pastedContents":{},"timestamp":2000,"project":"/tmp","sessionId":"aaa-111"}\n'
        '{"display":"other","pastedContents":{},"timestamp":3000,"project":"/foo","sessionId":"bbb-222"}\n'
    )

    from claude_session_cleaner import parse_sessions
    sessions = parse_sessions(history)
    assert len(sessions) == 2
    s1 = next(s for s in sessions if s["sessionId"] == "aaa-111")
    assert s1["msgCount"] == 2
    assert s1["firstDisplay"] == "hello"
    assert s1["project"] == "/tmp"


def test_parse_empty(tmp_path):
    """parse_sessions returns empty list for non-existent file."""
    from claude_session_cleaner import parse_sessions
    sessions = parse_sessions(tmp_path / "nonexistent.jsonl")
    assert sessions == []
