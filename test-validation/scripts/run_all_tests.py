#!/usr/bin/env python3
"""
Test orchestrator for ABO comprehensive test suite.
Runs all tests with retry logic and generates a summary report.
"""
import subprocess
import sys
import time
from pathlib import Path
from datetime import datetime
import json

# Test files in dependency order (independent tests first)
TEST_FILES = [
    ("test_01_config.py", "Config System"),
    ("test_02_sdk_types.py", "SDK Types"),
    ("test_03_store_cards.py", "Card Store"),
    ("test_04_module_arxiv.py", "ArXiv Module"),
    ("test_05_module_bilibili.py", "Bilibili Module"),
    ("test_06_module_xiaohongshu.py", "Xiaohongshu Module"),
    ("test_07_module_zhihu.py", "Zhihu Module"),
    ("test_08_module_xiaoyuzhou.py", "Xiaoyuzhou Module"),
    ("test_09_module_semantic_scholar.py", "Semantic Scholar Module"),
    ("test_10_module_folder_monitor.py", "Folder Monitor Module"),
    ("test_11_profile_store.py", "Profile Store"),
    ("test_12_profile_stats.py", "Profile Stats"),
    ("test_13_tools_xiaohongshu.py", "Xiaohongshu Tools"),
    ("test_14_tools_bilibili.py", "Bilibili Tools"),
    ("test_15_tools_zhihu.py", "Zhihu Tools"),
    ("test_16_api_routes.py", "API Routes"),
    ("test_17_websocket.py", "WebSocket"),
]

MAX_RETRIES = 3
RETRY_DELAY = 2


def run_test(test_file: str, test_name: str) -> tuple[bool, str]:
    """Run a single test file with retries."""
    script_dir = Path(__file__).parent
    test_path = script_dir / test_file

    if not test_path.exists():
        print(f"⚠️  {test_name}: Test file not found (skipping)")
        return True, "Skipped - file not found"

    for attempt in range(MAX_RETRIES):
        print(f"\n{'='*60}")
        print(f"Running: {test_name} (Attempt {attempt + 1}/{MAX_RETRIES})")
        print(f"{'='*60}")

        try:
            result = subprocess.run(
                [sys.executable, "-m", "pytest", str(test_path), "-v"],
                cwd=str(script_dir),
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode == 0:
                print(f"✅ {test_name}: PASSED")
                return True, "Passed"
            else:
                print(f"❌ {test_name}: FAILED")
                print(result.stdout)
                print(result.stderr)

                if attempt < MAX_RETRIES - 1:
                    print(f"⏳ Retrying in {RETRY_DELAY}s...")
                    time.sleep(RETRY_DELAY)

        except subprocess.TimeoutExpired:
            print(f"⏱️  {test_name}: TIMEOUT")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
        except Exception as e:
            print(f"💥 {test_name}: ERROR - {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)

    return False, "Failed after all retries"


def main():
    """Run all tests and generate report."""
    print("="*60)
    print("ABO Comprehensive Test Suite")
    print(f"Started: {datetime.now().isoformat()}")
    print("="*60)

    results = {}
    passed = 0
    failed = 0
    skipped = 0

    for test_file, test_name in TEST_FILES:
        success, message = run_test(test_file, test_name)
        results[test_name] = {"success": success, "message": message}

        if success:
            if message == "Skipped - file not found":
                skipped += 1
            else:
                passed += 1
        else:
            failed += 1

    # Generate report
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)

    for test_name, result in results.items():
        status = "✅ PASS" if result["success"] else "❌ FAIL"
        if result["message"] == "Skipped - file not found":
            status = "⚠️  SKIP"
        print(f"{status}: {test_name}")

    print("-"*60)
    print(f"Total: {passed + failed + skipped}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Skipped: {skipped}")

    # Save report
    report = {
        "timestamp": datetime.now().isoformat(),
        "summary": {"passed": passed, "failed": failed, "skipped": skipped},
        "results": results
    }

    report_path = Path(__file__).parent / "test_report.json"
    report_path.write_text(json.dumps(report, indent=2))
    print(f"\nReport saved to: {report_path}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
