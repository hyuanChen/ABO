"""CLI 检测和诊断路由"""
import shutil
import subprocess
from typing import TypedDict
from fastapi import APIRouter

cli_router = APIRouter(prefix="/api/cli")


class CliConfig(TypedDict):
    name: str
    check: str


CLI_REGISTRY: dict[str, CliConfig] = {
    'codex': {'name': 'OpenAI Codex', 'check': 'codex --version'},
    'claude': {'name': 'Claude Code', 'check': 'claude --version'},
    'gemini': {'name': 'Gemini CLI', 'check': 'gemini --version'},
}

VERSION_MAX_LEN = 50


@cli_router.get("/detect")
async def detect_clis() -> list[dict]:
    """检测本地可用的 CLI 工具"""
    available = []

    for cli_id, config in CLI_REGISTRY.items():
        check_cmd = config['check'].split()
        cmd = check_cmd[0]
        if not shutil.which(cmd):
            continue

        try:
            result = subprocess.run(
                check_cmd,
                capture_output=True,
                timeout=5
            )
            if result.returncode == 0:
                available.append({
                    'id': cli_id,
                    'name': config['name'],
                    'version': result.stdout.decode().strip()[:VERSION_MAX_LEN]
                })
        except (subprocess.SubprocessError, subprocess.TimeoutExpired, OSError):
            pass

    return available


@cli_router.get("/debug/{cli_type}")
async def debug_cli(cli_type: str) -> dict:
    """诊断 CLI 连接"""
    config = CLI_REGISTRY.get(cli_type, {})
    check_cmd = config.get('check', '').split()
    cmd = check_cmd[0] if check_cmd else cli_type

    result = {
        "cli_type": cli_type,
        "in_path": shutil.which(cmd) is not None,
        "path_location": shutil.which(cmd),
    }

    if result["in_path"] and config:
        try:
            proc = subprocess.run(
                check_cmd,
                capture_output=True,
                text=True,
                timeout=10
            )
            result["version_check"] = {
                "returncode": proc.returncode,
                "stdout": proc.stdout[:200] if proc.stdout else "",
                "stderr": proc.stderr[:200] if proc.stderr else "",
            }
        except (subprocess.SubprocessError, subprocess.TimeoutExpired, OSError) as e:
            result["error"] = str(e)

    return result
