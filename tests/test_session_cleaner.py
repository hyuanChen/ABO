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


def test_delete_sessions(tmp_path):
    history = tmp_path / "history.jsonl"
    history.write_text(
        '{"display":"a","pastedContents":{},"timestamp":1000,"project":"/tmp","sessionId":"aaa-111"}\n'
        '{"display":"b","pastedContents":{},"timestamp":2000,"project":"/tmp","sessionId":"aaa-111"}\n'
        '{"display":"c","pastedContents":{},"timestamp":3000,"project":"/foo","sessionId":"bbb-222"}\n'
        '{"display":"d","pastedContents":{},"timestamp":4000,"project":"/bar","sessionId":"ccc-333"}\n'
    )
    fh = tmp_path / "file-history"
    (fh / "aaa-111").mkdir(parents=True)
    (fh / "aaa-111" / "data").write_text("x")
    (fh / "bbb-222").mkdir(parents=True)

    from claude_session_cleaner import delete_sessions
    result = delete_sessions(["aaa-111", "bbb-222"], history, fh)

    assert result["linesRemoved"] == 3  # 2 from aaa + 1 from bbb
    assert result["dirsRemoved"] == 2

    # Verify remaining content
    remaining = history.read_text().strip().splitlines()
    assert len(remaining) == 1
    assert '"ccc-333"' in remaining[0]

    # Verify dirs are gone
    assert not (fh / "aaa-111").exists()
    assert not (fh / "bbb-222").exists()
