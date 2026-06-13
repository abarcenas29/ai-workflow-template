#!/usr/bin/env python3
"""graphify-framework-aware: detect project frameworks and generate .graphifyignore patterns.

Commands:
    detect <path>        Print JSON of detected frameworks and their markers.
    apply  <path>        Idempotently write/update .graphifyignore with FW patterns.
    show   <path>        Print FW patterns only (dry-run, no files written).

Exit codes: 0 = success, 1 = error (bad path, invalid args), 2 = nothing to apply.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

# ── Framework Registry ────────────────────────────────────────────────────────
# Adding a new framework:
#   1. Add detection marker(s) to FRAMEWORK_MARKERS.
#   2. Add exclude patterns to FRAMEWORK_EXCLUDES.
# Complex detection (Hugo theme) goes in _post_process_excludes().

FRAMEWORK_MARKERS: dict[str, list[str]] = {
    "angular":     ["angular.json"],
    "nextjs":      ["next.config.js", "next.config.ts", "next.config.mjs"],
    "svelte":      ["svelte.config.js"],
    "hugo":        ["hugo.toml", "hugo.yaml", "hugo.json"],
    "jekyll":      ["_config.yml"],
    "docusaurus":  ["docusaurus.config.js", "docusaurus.config.ts"],
    "flutter":     ["pubspec.yaml"],
    "wordpress":   ["wp-config.php"],
}

FRAMEWORK_EXCLUDES: dict[str, list[str]] = {
    "angular": [
        "**/*.spec.ts",
        "**/*.harness.ts",
        "e2e/",
        "src/environments/",
        "karma.conf.js",
        "src/test.ts",
    ],
    "nextjs": [
        "next-env.d.ts",
        "out/",
    ],
    "svelte": [
        "build/",
        "**/*.test.ts",
    ],
    "hugo": [],
    "jekyll": [
        "_site/",
        ".jekyll-cache/",
        ".jekyll-metadata",
    ],
    "docusaurus": [
        ".docusaurus/",
        "build/",
    ],
    "flutter": [
        ".dart_tool/",
        "build/",
        ".flutter-plugins",
        ".flutter-plugins-dependencies",
    ],
    "wordpress": [
        "wp-admin/",
        "wp-includes/",
        "wp-content/languages/",
        "wp-content/upgrade/",
    ],
}

# Marker section boundaries in .graphifyignore
_MARKER_START = "# ===== graphify-framework-aware (auto-generated) ====="
_MARKER_END   = "# ===== end graphify-framework-aware ====="

# Directories graphify already skips natively — don't duplicate them.
_GRAPHIFY_BUILTIN_SKIP = frozenset({
    "node_modules", "__pycache__", ".git", "dist", "build", "target", "out",
    "site-packages", "lib64", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    ".tox", ".eggs", "*.egg-info", "graphify-out",
    "coverage", "lcov-report", "visual-tests", "visual-test",
    "__snapshots__", "snapshots", "storybook-static", "dist-protected",
    ".next", ".nuxt", ".turbo", ".angular",
    ".idea", ".cache", ".parcel-cache", ".svelte-kit", ".terraform",
    ".serverless", ".graphify", ".worktrees",
    "venv", ".venv", "env", ".env",
})

# Lock files graphify already skips.
_GRAPHIFY_BUILTIN_SKIP_FILES = frozenset({
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "Cargo.lock", "poetry.lock", "Gemfile.lock",
    "composer.lock", "go.sum", "go.work.sum",
})


# ── Detection ─────────────────────────────────────────────────────────────────

def _glob_marker(root: Path, pattern: str) -> bool:
    """Check if a glob pattern matches any file in root (non-recursive by default)."""
    matches = list(root.glob(pattern))
    if matches:
        return any(m.is_file() for m in matches)
    return False


def detect_frameworks(root: Path) -> dict:
    """Scan project root for framework marker files.

    Returns:
        {"frameworks": ["angular", "nextjs"], "markers": {"angular": ["angular.json"], ...}}
    """
    root = root.resolve()
    if not root.is_dir():
        print(f"error: not a directory: {root}", file=sys.stderr)
        sys.exit(1)

    found: dict[str, list[str]] = {}
    for fw_name, markers in FRAMEWORK_MARKERS.items():
        matched = [m for m in markers if _glob_marker(root, m)]
        if matched:
            found[fw_name] = matched

    # Flutter: pubspec.yaml is generic — verify it's a Flutter project
    if "flutter" in found:
        pubspec = root / "pubspec.yaml"
        try:
            content = pubspec.read_text(encoding="utf-8")
            if "flutter" not in content.lower():
                del found["flutter"]
        except OSError:
            del found["flutter"]

    # Hugo: config.toml needs content check if not hugo.toml
    # (config.toml is too generic — many non-Hugo projects use it)
    if "hugo" in found:
        hugo_specific = any("hugo" in m.lower() for m in found["hugo"])
        if not hugo_specific:
            # Only matched generic config.toml — verify it's actually Hugo
            config_file = next((root / m for m in found["hugo"] if (root / m).exists()), None)
            if config_file:
                try:
                    content = config_file.read_text(encoding="utf-8")
                    if "baseURL" not in content and "title" not in content:
                        del found["hugo"]
                except OSError:
                    del found["hugo"]
            else:
                del found["hugo"]

    return {
        "frameworks": sorted(found.keys()),
        "markers": found,
    }


# ── Exclude pattern generation ────────────────────────────────────────────────

def _hugo_theme_is_vendored(root: Path) -> bool:
    """Check if Hugo themes/ directory contains git submodules or cloned themes."""
    themes_dir = root / "themes"
    if not themes_dir.is_dir():
        return False

    # Check for .gitmodules referencing themes
    gitmodules = root / ".gitmodules"
    if gitmodules.exists():
        try:
            content = gitmodules.read_text(encoding="utf-8")
            if "themes/" in content:
                return True
        except OSError:
            pass

    # Check if individual themes are git repos (submodules)
    for theme in themes_dir.iterdir():
        if theme.is_dir() and (theme / ".git").exists():
            return True

    return False


def _hugo_user_has_custom_layouts(root: Path) -> bool:
    """Check if the user has custom layouts at project root (outside themes/)."""
    layouts = root / "layouts"
    if not layouts.is_dir():
        return False
    # Has custom layouts if more than just _default/ and partials/ exist
    entries = list(layouts.iterdir())
    custom_entries = [e for e in entries
                      if e.name not in ("_default", "partials", "shortcodes")]
    return len(custom_entries) > 0


def _post_process_excludes(frameworks: dict, root: Path) -> dict[str, list[str]]:
    """Apply framework-specific heuristics to refine exclude patterns.

    Args:
        frameworks: Raw detection result {"frameworks": [...], "markers": {...}}.
        root: Project root path.

    Returns:
        Per-framework final exclude lists (may add/remove patterns).
    """
    excludes: dict[str, list[str]] = {}
    for fw in frameworks["frameworks"]:
        patterns = list(FRAMEWORK_EXCLUDES.get(fw, []))
        excludes[fw] = patterns

    # Hugo: refine based on theme/layout detection
    if "hugo" in excludes:
        patterns = excludes["hugo"]
        patterns.append("public/")
        patterns.append("resources/")

        if _hugo_theme_is_vendored(root):
            patterns.append("archetypes/")
            patterns.append("themes/**/archetypes/")
            patterns.append("themes/**/layouts/")
        else:
            patterns.append("archetypes/")

        # If user has custom layouts, only exclude defaults
        if not _hugo_user_has_custom_layouts(root):
            patterns.append("layouts/")
        else:
            patterns.append("layouts/_default/")
            patterns.append("layouts/partials/")
            patterns.append("layouts/shortcodes/")

    return excludes


# ── .graphifyignore management ────────────────────────────────────────────────

def _read_graphifyignore(root: Path) -> tuple[str, list[str]]:
    """Read .graphifyignore and split into preamble / our-section / postscript.

    Returns: (full_raw_content, lines_matching_our_section)
    """
    gf = root / ".graphifyignore"
    if not gf.exists():
        return ("", [])
    try:
        content = gf.read_text(encoding="utf-8")
    except OSError:
        return ("", [])
    return (content, _extract_marker_lines(content))


def _extract_marker_lines(content: str) -> list[str]:
    """Extract lines between our start/end markers (exclusive)."""
    lines = content.splitlines()
    in_block = False
    block_lines: list[str] = []
    for line in lines:
        if line.strip() == _MARKER_START:
            in_block = True
            continue
        if line.strip() == _MARKER_END:
            in_block = False
            continue
        if in_block:
            block_lines.append(line)
    return block_lines


def _normalize_ignore_line(line: str) -> str:
    """Strip comments and whitespace from a single .graphifyignore line."""
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return ""
    return stripped


def _build_marker_block(excludes: dict[str, list[str]]) -> list[str]:
    """Build the marker-delimited block of FW patterns."""
    lines: list[str] = [_MARKER_START]
    seen: set[str] = set()

    for fw_name, patterns in excludes.items():
        lines.append(f"# auto-detected framework: {fw_name}")
        for pat in patterns:
            normalized = _normalize_ignore_line(pat)
            if not normalized or normalized in seen:
                continue
            # Skip patterns graphify already skips natively
            if normalized.rstrip("/") in _GRAPHIFY_BUILTIN_SKIP:
                continue
            if normalized in _GRAPHIFY_BUILTIN_SKIP_FILES:
                continue
            seen.add(normalized)
            lines.append(pat)

    lines.append(_MARKER_END)
    return lines


def _write_graphifyignore(root: Path, excludes: dict[str, list[str]]) -> str:
    """Write or update .graphifyignore, replacing our marker section.

    Returns the summary string describing what was written.
    """
    gf = root / ".graphifyignore"
    existing_content, existing_block = _read_graphifyignore(root)

    new_block = _build_marker_block(excludes)
    new_block_text = "\n".join(new_block)

    # Compare ignoring comments (our own section header comments are stable)
    old_effective = [_normalize_ignore_line(l) for l in existing_block if _normalize_ignore_line(l)]
    new_effective = []
    for l in new_block:
        n = _normalize_ignore_line(l)
        if n and not n.startswith("#"):
            new_effective.append(n)

    if sorted(old_effective) == sorted(new_effective) and _MARKER_START in existing_content:
        return "unchanged"

    # Rebuild the file: remove old marker block, insert new one
    if _MARKER_START in existing_content:
        lines = existing_content.splitlines()
        out_lines: list[str] = []
        in_block = False
        for line in lines:
            if line.strip() == _MARKER_START:
                in_block = True
                continue
            if line.strip() == _MARKER_END:
                in_block = False
                continue
            if not in_block:
                out_lines.append(line)
        # Remove trailing blank lines before appending
        while out_lines and out_lines[-1].strip() == "":
            out_lines.pop()
        out_lines.append("")
        out_lines.append(new_block_text)
        result = "\n".join(out_lines)
        if not result.endswith("\n"):
            result += "\n"
    else:
        # No existing block — append
        if existing_content.strip():
            result = existing_content.rstrip() + "\n\n" + new_block_text + "\n"
        else:
            result = new_block_text + "\n"

    gf.write_text(result, encoding="utf-8")

    # Build summary
    fw_names = list(excludes.keys())
    pattern_count = len(new_effective)
    if pattern_count == 0:
        return f"frameworks detected ({', '.join(fw_names)}) but no additional patterns needed"
    return (
        f"detected {', '.join(fw_names)} — wrote {pattern_count} "
        f"exclusion pattern{'s' if pattern_count != 1 else ''} to .graphifyignore"
    )


# ── CLI ───────────────────────────────────────────────────────────────────────

def _cmd_detect(root: Path) -> None:
    result = detect_frameworks(root)
    print(json.dumps(result, indent=2))


def _cmd_show(root: Path) -> None:
    result = detect_frameworks(root)
    if not result["frameworks"]:
        print("No supported frameworks detected.", file=sys.stderr)
        sys.exit(2)
    excludes = _post_process_excludes(result, root)
    for fw, patterns in excludes.items():
        print(f"# {fw}")
        for pat in patterns:
            n = _normalize_ignore_line(pat)
            if n and n not in _GRAPHIFY_BUILTIN_SKIP and n not in _GRAPHIFY_BUILTIN_SKIP_FILES:
                print(pat)
        print()


def _cmd_apply(root: Path) -> None:
    result = detect_frameworks(root)
    if not result["frameworks"]:
        print("No supported frameworks detected.", file=sys.stderr)
        sys.exit(2)
    excludes = _post_process_excludes(result, root)
    summary = _write_graphifyignore(root, excludes)
    print(f"graphify-framework-aware: {summary}")


_CMD_TABLE: dict[str, callable] = {
    "detect": _cmd_detect,
    "show":   _cmd_show,
    "apply":  _cmd_apply,
}


def main() -> None:
    if len(sys.argv) < 3:
        print(f"usage: {sys.argv[0]} <detect|show|apply> <project-path>", file=sys.stderr)
        sys.exit(1)

    cmd = sys.argv[1]
    path = Path(sys.argv[2])

    if cmd not in _CMD_TABLE:
        print(f"error: unknown command '{cmd}' (expected: detect, show, apply)", file=sys.stderr)
        sys.exit(1)

    _CMD_TABLE[cmd](path)


if __name__ == "__main__":
    main()
