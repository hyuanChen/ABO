"""CLI 检测和管理模块"""

import subprocess
import os
import json
import shlex
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime

from ..storage_paths import resolve_app_data_file
from .env import get_enhanced_cli_env, resolve_cli_command, reset_enhanced_cli_env_cache


@dataclass
class CliInfo:
    """CLI 信息"""
    id: str
    name: str
    command: str
    check_cmd: str
    version: str = ""
    is_available: bool = False
    acp_args: List[str] = None
    protocol: str = "raw"  # raw only for now
    last_check: int = 0

    def __post_init__(self):
        if self.acp_args is None:
            self.acp_args = []


class CliDetector:
    """CLI 工具检测器 - 自动发现和验证本地 CLI"""

    REGISTRY: Dict[str, CliInfo] = {
        "codex": CliInfo(
            id="codex",
            name="OpenAI Codex",
            command="codex",
            check_cmd="codex --version",
            acp_args=["exec", "--full-auto", "--skip-git-repo-check", "--color", "never"],
            protocol="raw"
        ),
        "claude": CliInfo(
            id="claude",
            name="Claude Code",
            command="claude",
            check_cmd="claude --version",
            acp_args=["--print"],
            protocol="raw"
        ),
        "gemini": CliInfo(
            id="gemini",
            name="Gemini CLI",
            command="gemini",
            check_cmd="gemini --version",
            acp_args=["--experimental-acp"],
            protocol="acp"
        ),
        "openclaw": CliInfo(
            id="openclaw",
            name="OpenClaw",
            command="openclaw",
            check_cmd="openclaw --version",
            acp_args=[],
            protocol="websocket"
        ),
    }

    def __init__(self, db_path: str | None = None):
        resolved = db_path or str(resolve_app_data_file("cli_configs.json"))
        self.db_path = os.path.expanduser(resolved)
        self._cache: Dict[str, CliInfo] = {}
        self._load_cache()

    def detect_all(self, force: bool = False) -> List[CliInfo]:
        """检测所有已知的 CLI 工具"""
        if force:
            reset_enhanced_cli_env_cache()
        available = []

        for cli_id, info in self.REGISTRY.items():
            detected = self._detect_single(info)
            self._cache[cli_id] = detected

            if detected.is_available:
                available.append(detected)

        return available

    def _detect_single(self, info: CliInfo) -> CliInfo:
        """检测单个 CLI"""
        result = CliInfo(
            id=info.id,
            name=info.name,
            command=info.command,
            check_cmd=info.check_cmd,
            acp_args=info.acp_args,
            protocol=info.protocol
        )
        result.last_check = int(datetime.now().timestamp())

        env = self._get_enhanced_env()
        resolved_command = resolve_cli_command(info.command, env=env)
        if not resolved_command:
            return result

        # 尝试执行版本检查
        try:
            check_parts = shlex.split(info.check_cmd)
            if not check_parts:
                return result
            check_parts[0] = resolved_command
            proc = subprocess.run(
                check_parts,
                capture_output=True,
                text=True,
                timeout=10,
                env=env,
            )

            if proc.returncode == 0:
                result.is_available = True
                result.version = proc.stdout.strip()[:100]
            else:
                result.is_available = True
                result.version = "unknown"

        except subprocess.TimeoutExpired:
            result.version = "timeout"
        except Exception as e:
            result.version = f"error: {str(e)[:50]}"

        return result

    def _get_enhanced_env(self) -> dict:
        """获取增强的环境变量（包含 shell 配置）"""
        return get_enhanced_cli_env()

    def get_cli_info(self, cli_id: str) -> Optional[CliInfo]:
        """获取特定 CLI 的信息"""
        if cli_id in self._cache:
            return self._cache[cli_id]

        if cli_id in self.REGISTRY:
            return self._detect_single(self.REGISTRY[cli_id])

        return None

    def _load_cache(self) -> None:
        """从文件加载缓存"""
        try:
            if os.path.exists(self.db_path):
                with open(self.db_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for item in data:
                        self._cache[item['id']] = CliInfo(**item)
        except (json.JSONDecodeError, KeyError, TypeError):
            self._cache = {}

    def _save_cache(self) -> None:
        """保存缓存到文件"""
        try:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            data = [asdict(info) for info in self._cache.values()]
            with open(self.db_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
        except (OSError, TypeError):
            pass

    def add_custom_cli(self, info: CliInfo) -> None:
        """添加自定义 CLI 到注册表"""
        self.REGISTRY[info.id] = info
        detected = self._detect_single(info)
        self._cache[info.id] = detected
        self._save_cache()


# 全局检测器实例
detector = CliDetector()
