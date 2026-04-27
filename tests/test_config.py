import abo.config as config_module
import abo.main as main_module


def test_load_defaults_disable_paper_ai_scoring(tmp_path, monkeypatch):
    config_path = tmp_path / "abo-config.json"
    monkeypatch.setattr(config_module, "_CONFIG_PATH", config_path)

    loaded = config_module.load()

    assert loaded["paper_ai_scoring_enabled"] is False
    assert loaded["intelligence_delivery_enabled"] is True
    assert loaded["intelligence_delivery_time"] == "09:00"
    assert config_module.is_paper_ai_scoring_enabled() is False


def test_save_persists_paper_ai_scoring_flag(tmp_path, monkeypatch):
    config_path = tmp_path / "abo-config.json"
    monkeypatch.setattr(config_module, "_CONFIG_PATH", config_path)

    config_module.save({"paper_ai_scoring_enabled": True})

    assert config_module.load()["paper_ai_scoring_enabled"] is True
    assert config_module.is_paper_ai_scoring_enabled() is True


def test_save_normalizes_intelligence_delivery_time(tmp_path, monkeypatch):
    config_path = tmp_path / "abo-config.json"
    monkeypatch.setattr(config_module, "_CONFIG_PATH", config_path)

    config_module.save({"intelligence_delivery_time": "9:30"})
    assert config_module.load()["intelligence_delivery_time"] == "09:30"

    config_module.save({"intelligence_delivery_time": "bad-input"})
    assert config_module.load()["intelligence_delivery_time"] == "09:30"


def test_save_persists_intelligence_delivery_enabled_flag(tmp_path, monkeypatch):
    config_path = tmp_path / "abo-config.json"
    monkeypatch.setattr(config_module, "_CONFIG_PATH", config_path)

    config_module.save({"intelligence_delivery_enabled": False})

    assert config_module.load()["intelligence_delivery_enabled"] is False


def test_apply_intelligence_schedule_config_updates_module_schedules(monkeypatch):
    class FakeModule:
        def __init__(self, module_id: str):
            self.id = module_id
            self.schedule = ""

    class FakeRegistry:
        def __init__(self, modules: list[FakeModule]):
            self._modules = {module.id: module for module in modules}

        def get(self, module_id: str):
            return self._modules.get(module_id)

    class FakeStateStore:
        def update_module(self, module_id: str, enabled=None, schedule=None, registry=None):
            module = registry.get(module_id)
            if module is not None and schedule is not None:
                module.schedule = schedule
            return {"schedule": schedule}

    modules = [
        FakeModule("arxiv-tracker"),
        FakeModule("semantic-scholar-tracker"),
        FakeModule("xiaohongshu-tracker"),
        FakeModule("bilibili-tracker"),
        FakeModule("xiaoyuzhou-tracker"),
        FakeModule("zhihu-tracker"),
    ]
    registry = FakeRegistry(modules)

    monkeypatch.setattr(main_module, "_registry", registry)
    monkeypatch.setattr(main_module, "_state_store", FakeStateStore())
    monkeypatch.setattr(main_module, "_scheduler", None)

    schedule_map = main_module._apply_intelligence_schedule_config("09:00")

    assert schedule_map["arxiv-tracker"] == "0 9 * * *"
    assert schedule_map["semantic-scholar-tracker"] == "0 9 * * *"
    assert schedule_map["xiaohongshu-tracker"] == "30 8 * * *"
    assert schedule_map["bilibili-tracker"] == "30 8 * * *"
    assert schedule_map["xiaoyuzhou-tracker"] == "0 9 * * *"
    assert schedule_map["zhihu-tracker"] == "0 9 * * *"


def test_set_intelligence_delivery_enabled_updates_scheduler_without_overwriting_module_flags(monkeypatch):
    class FakeModule:
        def __init__(self, module_id: str, enabled: bool = True):
            self.id = module_id
            self.enabled = enabled

    class FakeRegistry:
        def __init__(self, modules: list[FakeModule]):
            self._modules = {module.id: module for module in modules}

        def get(self, module_id: str):
            return self._modules.get(module_id)

    class FakeScheduler:
        def __init__(self):
            self.calls: list[tuple[str, bool]] = []

        def update_enabled(self, module, enabled: bool):
            self.calls.append((module.id, enabled))

    modules = [
        FakeModule("arxiv-tracker", True),
        FakeModule("semantic-scholar-tracker", False),
        FakeModule("xiaohongshu-tracker", True),
        FakeModule("bilibili-tracker", True),
        FakeModule("xiaoyuzhou-tracker", True),
        FakeModule("zhihu-tracker", True),
    ]
    scheduler = FakeScheduler()

    monkeypatch.setattr(main_module, "_registry", FakeRegistry(modules))
    monkeypatch.setattr(main_module, "_scheduler", scheduler)

    main_module._set_intelligence_delivery_enabled(False)
    assert scheduler.calls == [
        ("arxiv-tracker", False),
        ("semantic-scholar-tracker", False),
        ("xiaoyuzhou-tracker", False),
        ("zhihu-tracker", False),
        ("xiaohongshu-tracker", False),
        ("bilibili-tracker", False),
    ]

    scheduler.calls.clear()
    main_module._set_intelligence_delivery_enabled(True)
    assert scheduler.calls == [
        ("arxiv-tracker", True),
        ("semantic-scholar-tracker", False),
        ("xiaoyuzhou-tracker", True),
        ("zhihu-tracker", True),
        ("xiaohongshu-tracker", True),
        ("bilibili-tracker", True),
    ]
