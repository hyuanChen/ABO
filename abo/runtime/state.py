import json
import os
from pathlib import Path

from abo.runtime.discovery import ModuleRegistry
from abo.storage_paths import get_module_runtime_path

_STATE_PATH = get_module_runtime_path()


class ModuleStateStore:
    _path: Path

    def __init__(self, path: Path | None = None):
        self._path = path or _STATE_PATH

    def _default_data(self, registry: ModuleRegistry) -> dict:
        return {
            m.id: {"enabled": m.enabled, "schedule": m.schedule}
            for m in registry.all()
        }

    def load(self, registry: ModuleRegistry) -> dict:
        defaults = self._default_data(registry)
        if not self._path.exists():
            data = defaults
            self.save(data)
            return data

        stored = json.loads(self._path.read_text(encoding="utf-8"))
        # merge defaults (add missing modules)
        for module_id, state in defaults.items():
            stored.setdefault(module_id, state)
        # clean stale entries
        valid_ids = {m.id for m in registry.all()}
        cleaned = {k: v for k, v in stored.items() if k in valid_ids}
        if cleaned != stored:
            self.save(cleaned)
        return cleaned

    def save(self, data: dict) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self._path)

    def apply_to_registry(self, registry: ModuleRegistry) -> None:
        data = self.load(registry)
        for module_id, state in data.items():
            module = registry.get(module_id)
            if module is not None:
                module.enabled = state.get("enabled", module.enabled)
                module.schedule = state.get("schedule", module.schedule)

    def update_module(
        self,
        module_id: str,
        enabled: bool | None = None,
        schedule: str | None = None,
        registry: ModuleRegistry | None = None,
    ) -> dict:
        if registry is None:
            raise ValueError("registry is required")
        data = self.load(registry)
        module_state = data.setdefault(module_id, {})
        module = registry.get(module_id)
        if enabled is not None:
            module_state["enabled"] = enabled
            if module is not None:
                module.enabled = enabled
        if schedule is not None:
            module_state["schedule"] = schedule
            if module is not None:
                module.schedule = schedule
        self.save(data)
        return module_state.copy()
