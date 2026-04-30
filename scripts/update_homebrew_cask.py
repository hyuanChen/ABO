#!/usr/bin/env python3
"""Generate a Homebrew cask file for the current macOS release artifact."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TAURI_CONFIG_PATH = ROOT / "src-tauri" / "tauri.conf.json"
DEFAULT_CASK_PATH = ROOT / "Casks" / "abo.rb"
DEFAULT_RELEASE_DIR = ROOT / "release"
DEFAULT_REPO_SLUG = "hyuanChen/ABO"

ARCH_DEPENDENCIES = {
    "aarch64": ":arm64",
    "arm64": ":arm64",
    "x86_64": ":x86_64",
    "intel": ":x86_64",
}


def _load_tauri_config() -> dict:
    return json.loads(TAURI_CONFIG_PATH.read_text(encoding="utf-8"))


def _detect_repo_slug() -> str:
    try:
        result = subprocess.run(
            ["git", "config", "--get", "remote.origin.url"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError:
        return DEFAULT_REPO_SLUG

    remote = result.stdout.strip()
    patterns = (
        r"github\.com[:/](?P<slug>[^/]+/[^/.]+?)(?:\.git)?$",
        r"^git@github\.com:(?P<slug>[^/]+/[^/.]+?)(?:\.git)?$",
    )
    for pattern in patterns:
        match = re.search(pattern, remote)
        if match:
            return match.group("slug")
    return DEFAULT_REPO_SLUG


def _resolve_dmg_path(product_name: str, version: str, explicit: str | None) -> Path:
    if explicit:
        dmg_path = Path(explicit).expanduser().resolve()
        if not dmg_path.exists():
            raise FileNotFoundError(f"DMG not found: {dmg_path}")
        return dmg_path

    candidates = sorted(DEFAULT_RELEASE_DIR.glob(f"{product_name}_{version}_*.dmg"))
    if not candidates:
        raise FileNotFoundError(
            f"No release DMG found in {DEFAULT_RELEASE_DIR} for {product_name} {version}"
        )
    if len(candidates) > 1:
        names = ", ".join(path.name for path in candidates)
        raise RuntimeError(f"Multiple DMGs found, please specify --dmg explicitly: {names}")
    return candidates[0]


def _extract_arch_token(dmg_name: str, version: str) -> str | None:
    match = re.match(rf"^ABO_{re.escape(version)}_(?P<arch>.+)\.dmg$", dmg_name)
    if not match:
        return None
    return match.group("arch")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _build_cask_content(
    *,
    product_name: str,
    version: str,
    dmg_name: str,
    sha256_value: str,
    repo_slug: str,
) -> str:
    arch_token = _extract_arch_token(dmg_name, version)
    depends_on_line = ""
    if arch_token in ARCH_DEPENDENCIES:
        depends_on_line = f"  depends_on arch: {ARCH_DEPENDENCIES[arch_token]}\n\n"

    versioned_dmg_name = dmg_name.replace(version, "#{version}", 1)

    return (
        'cask "abo" do\n'
        f'  version "{version}"\n'
        f'  sha256 "{sha256_value}"\n\n'
        f'  url "https://github.com/{repo_slug}/releases/download/v#{{version}}/{versioned_dmg_name}"\n'
        f'  name "{product_name}"\n'
        '  desc "Another Brain Odyssey desktop workspace"\n'
        f'  homepage "https://github.com/{repo_slug}"\n\n'
        f"{depends_on_line}"
        f'  app "{product_name}.app"\n\n'
        "  zap trash: [\n"
        '    "~/Library/Application Support/ABO App",\n'
        '    "~/Library/Application Support/com.huanc.abo",\n'
        '    "~/Library/Application Support/com.abo.app",\n'
        "  ]\n"
        "end\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Homebrew cask metadata for ABO.")
    parser.add_argument("--dmg", help="Path to the release DMG. Defaults to release/ABO_<version>_*.dmg")
    parser.add_argument("--repo-slug", help="GitHub repo slug like owner/repo")
    parser.add_argument("--output", default=str(DEFAULT_CASK_PATH), help="Output cask path")
    args = parser.parse_args()

    tauri_config = _load_tauri_config()
    product_name = str(tauri_config["productName"])
    version = str(tauri_config["version"])
    repo_slug = args.repo_slug or _detect_repo_slug()

    dmg_path = _resolve_dmg_path(product_name, version, args.dmg)
    sha256_value = _sha256(dmg_path)

    cask_content = _build_cask_content(
        product_name=product_name,
        version=version,
        dmg_name=dmg_path.name,
        sha256_value=sha256_value,
        repo_slug=repo_slug,
    )

    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(cask_content, encoding="utf-8")
    print(output_path)


if __name__ == "__main__":
    main()
