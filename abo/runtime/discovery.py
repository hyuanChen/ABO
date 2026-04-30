import importlib
import importlib.util
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from ..sdk.base import Module
from ..storage_paths import get_user_modules_dir


class ModuleRegistry:
    _BUILTIN_MODULE_IMPORTS = [
        "abo.default_modules.arxiv",
        "abo.default_modules.semantic_scholar_tracker",
        "abo.default_modules.xiaohongshu",
        "abo.default_modules.bilibili",
        "abo.default_modules.xiaoyuzhou",
        "abo.default_modules.zhihu",
        "abo.default_modules.folder_monitor",
    ]

    def __init__(self):
        self._modules: dict[str, Module] = {}

    def load_all(self) -> None:
        self._modules = {}
        self._load_builtin_modules()

        # 用户自定义模块
        user_dir = get_user_modules_dir()
        user_dir.mkdir(parents=True, exist_ok=True)
        for pkg in sorted(user_dir.iterdir(), key=lambda item: item.name):
            if pkg.is_dir() and (pkg / "__init__.py").exists():
                self._load_pkg(pkg)

    def _load_builtin_modules(self) -> None:
        for module_path in self._BUILTIN_MODULE_IMPORTS:
            try:
                mod = importlib.import_module(module_path)
                self._register_module_types(mod)
            except Exception as e:
                print(f"[discovery] Failed to load builtin module {module_path}: {e}")

    def _load_pkg(self, pkg_dir: Path):
        try:
            spec = importlib.util.spec_from_file_location(
                f"abo_module_{pkg_dir.name}", pkg_dir / "__init__.py"
            )
            if spec is None or spec.loader is None:
                raise RuntimeError("无法创建模块 spec")
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            self._register_module_types(mod)
        except Exception as e:
            print(f"[discovery] Failed to load {pkg_dir.name}: {e}")

    def _register_module_types(self, mod) -> None:
        for attr in vars(mod).values():
            if (
                isinstance(attr, type)
                and issubclass(attr, Module)
                and attr is not Module
                and getattr(attr, "id", "")
            ):
                instance = attr()
                self._modules[instance.id] = instance
                print(f"[discovery] Loaded: {instance.name} ({instance.id})")

    # Desired module order
    MODULE_ORDER = [
        "arxiv-tracker",
        "semantic-scholar-tracker",
        "xiaohongshu-tracker",
        "bilibili-tracker",
        "xiaoyuzhou-tracker",
        "zhihu-tracker",
        "folder-monitor",
    ]

    def all(self) -> list[Module]:
        # Sort modules according to desired order
        modules = list(self._modules.values())
        order_map = {name: idx for idx, name in enumerate(self.MODULE_ORDER)}
        return sorted(modules, key=lambda m: order_map.get(m.id, 999))

    def enabled(self) -> list[Module]:
        return [m for m in self._modules.values() if m.enabled]

    def get(self, module_id: str) -> Module | None:
        return self._modules.get(module_id)


def start_watcher(registry: ModuleRegistry, on_change):
    class _Handler(FileSystemEventHandler):
        def on_created(self, event):
            if "__init__.py" in event.src_path:
                registry.load_all()
                on_change(registry)
                print("[discovery] Hot-reloaded after new module detected")

    user_dir = get_user_modules_dir()
    observer = Observer()
    observer.schedule(_Handler(), str(user_dir), recursive=True)
    observer.daemon = True
    observer.start()
    return observer
