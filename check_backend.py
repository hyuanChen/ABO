#!/usr/bin/env python3
"""
后端日志查看和诊断脚本

用法:
    python check_backend.py          # 查看最近的后端日志
    python check_backend.py -f       # 实时跟踪日志
    python check_backend.py -t       # 测试 API 端点
"""

import subprocess
import sys
import time
import os

def check_backend_status():
    """检查后端是否在运行"""
    result = subprocess.run(
        ["lsof", "-i", ":8765"],
        capture_output=True,
        text=True
    )
    if result.returncode == 0 and result.stdout.strip():
        lines = result.stdout.strip().split('\n')
        if len(lines) > 1:
            print("✓ 后端正在运行")
            print(f"  {lines[1]}")
            return True
    print("✗ 后端未运行")
    return False

def view_logs(follow=False):
    """查看后端日志"""
    log_file = "/tmp/abo_backend.log"

    if not os.path.exists(log_file):
        print(f"日志文件不存在: {log_file}")
        print("尝试从 launchctl 查看...")
        # 如果后端是通过 launchctl 启动的
        result = subprocess.run(
            ["launchctl", "list", "|", "grep", "abo"],
            capture_output=True,
            text=True,
            shell=True
        )
        print(result.stdout or "未找到 abo 服务")
        return

    if follow:
        print(f"实时查看日志 (按 Ctrl+C 退出): {log_file}")
        print("-" * 60)
        subprocess.run(["tail", "-f", log_file])
    else:
        print(f"最近的后端日志: {log_file}")
        print("-" * 60)
        subprocess.run(["tail", "-100", log_file])

def test_api():
    """测试后端 API 是否响应"""
    import urllib.request
    import json

    print("\n测试后端 API...")
    print("-" * 60)

    endpoints = [
        ("健康检查", "http://127.0.0.1:8765/api/health"),
        ("模块列表", "http://127.0.0.1:8765/api/modules"),
        ("B站配置", "http://127.0.0.1:8765/api/tools/bilibili/config"),
    ]

    for name, url in endpoints:
        try:
            req = urllib.request.Request(url, method='GET')
            req.add_header('Accept', 'application/json')
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode())
                print(f"✓ {name}: OK")
                print(f"  响应: {json.dumps(data, ensure_ascii=False)[:100]}...")
        except Exception as e:
            print(f"✗ {name}: {e}")

def restart_backend():
    """重启后端服务"""
    print("重启后端服务...")

    # 杀掉现有进程
    subprocess.run(["kill", "$(lsof -t -i:8765)"], shell=True, capture_output=True)
    time.sleep(1)

    # 启动新进程
    log_file = "/tmp/abo_backend.log"
    with open(log_file, 'a') as f:
        process = subprocess.Popen(
            [sys.executable, "-m", "abo.main"],
            stdout=f,
            stderr=subprocess.STDOUT,
            cwd="/Users/huanc/Desktop/ABO"
        )

    time.sleep(3)

    # 检查是否启动成功
    if check_backend_status():
        print(f"✓ 后端重启成功，PID: {process.pid}")
        print(f"  日志文件: {log_file}")
    else:
        print("✗ 后端启动失败")

def main():
    if len(sys.argv) > 1:
        if sys.argv[1] == '-f':
            view_logs(follow=True)
        elif sys.argv[1] == '-t':
            test_api()
        elif sys.argv[1] == '-r':
            restart_backend()
        elif sys.argv[1] == '-h':
            print(__doc__)
        else:
            print(f"未知选项: {sys.argv[1]}")
            print(__doc__)
    else:
        # 默认操作
        check_backend_status()
        view_logs()
        test_api()

if __name__ == "__main__":
    main()
