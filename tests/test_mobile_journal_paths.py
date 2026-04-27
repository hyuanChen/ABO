from fastapi.testclient import TestClient

from abo.journal_mobile import cleanup_mobile_journal_exports, describe_mobile_journal_paths
from abo.main import app
import abo.main as main_module


def test_cleanup_mobile_journal_exports_removes_legacy_and_canonical_content(tmp_path):
    legacy_daily = tmp_path / "日记"
    legacy_daily.mkdir()
    (legacy_daily / "legacy.md").write_text("legacy", encoding="utf-8")
    legacy_mobile_root = tmp_path / "手机" / "周记"
    legacy_mobile_root.mkdir(parents=True)
    (legacy_mobile_root / "wrong.md").write_text("wrong", encoding="utf-8")

    canonical_daily = tmp_path / "手记" / "日记"
    canonical_daily.mkdir(parents=True)
    (canonical_daily / "today.md").write_text("today", encoding="utf-8")
    (tmp_path / "手记" / "周记").mkdir(parents=True)
    (tmp_path / "手记" / "月记").mkdir(parents=True)
    (tmp_path / "手记" / "年记").mkdir(parents=True)

    result = cleanup_mobile_journal_exports(tmp_path)

    assert result["root_path"] == "手记"
    assert result["folders"] == {
        "daily": "手记/日记",
        "weekly": "手记/周记",
        "monthly": "手记/月记",
        "yearly": "手记/年记",
    }
    assert sorted(result["deleted"]) == ["手机", "手记/日记/today.md", "日记"]
    assert result["deleted_count"] == 3
    assert not legacy_daily.exists()
    assert not (tmp_path / "手机").exists()
    assert canonical_daily.is_dir()
    assert list(canonical_daily.iterdir()) == []


def test_describe_mobile_journal_paths_creates_expected_structure(tmp_path):
    payload = describe_mobile_journal_paths(tmp_path)

    assert payload["root_path"] == "手记"
    assert payload["folders"]["daily"] == "手记/日记"
    assert (tmp_path / "手记" / "日记").is_dir()
    assert (tmp_path / "手记" / "周记").is_dir()
    assert (tmp_path / "手记" / "月记").is_dir()
    assert (tmp_path / "手记" / "年记").is_dir()


def test_mobile_journal_api_returns_paths_and_cleans_exports(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "get_vault_path", lambda: tmp_path)

    with TestClient(app) as client:
        paths_response = client.get("/api/journal/mobile-paths")
        assert paths_response.status_code == 200
        assert paths_response.json()["folders"]["daily"] == "手记/日记"

        exported = tmp_path / "手记" / "月记" / "2026-04.md"
        exported.parent.mkdir(parents=True, exist_ok=True)
        exported.write_text("month", encoding="utf-8")

        cleanup_response = client.post("/api/journal/mobile/cleanup")
        assert cleanup_response.status_code == 200
        data = cleanup_response.json()
        assert data["deleted_count"] == 1
        assert data["deleted"] == ["手记/月记/2026-04.md"]
        assert not exported.exists()
