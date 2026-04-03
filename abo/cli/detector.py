"""CLI 检测和管理模块"""

import shutil
import subprocess
import os
import json
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime


@dataclass
class CliInfo:
    id: str
    name: str
    command: str
    check_cmd: str
    version: str = ""
    is_available: bool = False
    acp_args: List[str] = None
    protocol: str = "raw"  # raw, acp, websocket
    last_check: int = 0

    def __post_init__(self):
        if self.acp_args is None:
            self.acp_args = []


class CliDetector:
    """CLI 工具检测器 - 自动发现和验证本地 CLI"""

    REGISTRY: Dict[str, CliInfo] = {
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
            acp_args=["gateway"],
            protocol="websocket"
        ),
        "codex": CliInfo(
            id="codex",
            name="OpenAI Codex",
            command="codex",
            check_cmd="codex --version",
            acp_args=["--acp"],
            protocol="acp"
        ),
    }

    def __init__(self, db_path: str = "~/.abo/data/cli_configs.json"):
        self.db_path = os.path.expanduser(db_path)
        self._cache: Dict[str, CliInfo] = {}
        self._load_cache()

    def _load_cache(self):
        """加载缓存的检测结果"""
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, 'r') as f:
                    data = json.load(f)
                    for item in data:
                        self._cache[item['id']] = CliInfo(**item)
            except Exception:
                pass

    def _save_cache(self):
        """保存检测结果到缓存"""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        with open(self.db_path, 'w') as f:
            json.dump([asdict(info) for info in self._cache.values()], f, indent=2)

    def detect_all(self, force: bool = False) -> List[CliInfo]:
        """
        检测所有已知的 CLI 工具

        Args:
            force: 强制重新检测，忽略缓存

        Returns:
            可用的 CLI 列表
        """
        available = []

        for cli_id, info in self.REGISTRY.items():
            # 检查缓存
            if not force and cli_id in self._cache:
                cached = self._cache[cli_id]
                # 缓存 5 分钟内有效
                if datetime.now().timestamp() - cached.last_check < 300:
                    if cached.is_available:
                        available.append(cached)
                    continue

            # 执行检测
            detected = self._detect_single(info)
            self._cache[cli_id] = detected

            if detected.is_available:
                available.append(detected)

        self._save_cache()
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

        # 检查命令是否在 PATH 中
        if not shutil.which(info.command):
            return result

        # 尝试执行版本检查
        try:
            proc = subprocess.run(
                info.check_cmd.split(),
                capture_output=True,
                text=True,
                timeout=10,
                env=self._get_enhanced_env()
            )

            if proc.returncode == 0:
                result.is_available = True
                result.version = proc.stdout.strip()[:100]
            else:
                # 有些 CLI 返回非零但可用
                result.is_available = True
                result.version = "unknown"

        except subprocess.TimeoutExpired:
            result.version = "timeout"
        except Exception as e:
            result.version = f"error: {str(e)[:50]}"

        return result

    def _get_enhanced_env(self) -> dict:
        """获取增强的环境变量（包含 shell 配置）"""
        env = dict(os.environ)

        # 尝试加载 shell 环境
        shell = os.environ.get('SHELL', '/bin/zsh')
        try:
            result = subprocess.run(
                [shell, '-l', '-c', 'env'],
                capture_output=True,
                text=True,
                timeout=5
            )

            for line in result.stdout.strip().split('\n'):
                if '=' in line:
                    key, value = line.split('=', 1)
                    if key in ['PATH', 'HOME', 'ANTHROPIC_API_KEY',
                               'GEMINI_API_KEY', 'OPENAI_API_KEY']:
                        env[key] = value
        except Exception:
            pass

        return env

    def get_cli_info(self, cli_id: str) -> Optional[CliInfo]:
        """获取特定 CLI 的信息"""
        if cli_id in self._cache:
            return self._cache[cli_id]

        if cli_id in self.REGISTRY:
            return self._detect_single(self.REGISTRY[cli_id])

        return None

    def add_custom_cli(self, info: CliInfo):
        """添加自定义 CLI 配置"""
        self.REGISTRY[info.id] = info
        self._cache[info.id] = self._detect_single(info)
        self._save_cache()


# 全局检测器实例
detector = CliDetector()
