#!/usr/bin/env python3
"""Build a repository-wide index of Python packages and modules.

This script walks the repository, skipping large vendor directories such as
``node_modules`` and typical cache folders. It inspects each Python package and
module, capturing module docstrings as well as top-level class and function
summaries. The collected data is written to both a machine-readable JSON file
and a human-friendly Markdown document.

Usage
-----
    python tools/nav/build_module_index.py [--root PATH]

By default the script assumes it lives inside ``tools/nav`` and walks the
repository root two directories above its location. Use ``--json-output`` and
``--markdown-output`` to override the destinations of the generated files.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence

SKIP_DIR_NAMES = {
    ".git",
    "__pycache__",
    ".mypy_cache",
    ".pytest_cache",
    "node_modules",
    ".venv",
    "venv",
}


@dataclass
class DefinitionSummary:
    """Description of a top-level class or function."""

    name: str
    docstring: Optional[str]

    def as_dict(self) -> Dict[str, Optional[str]]:
        return {"name": self.name, "docstring": self.docstring}


@dataclass
class ModuleSummary:
    """Summary of a Python module."""

    name: str
    path: str
    docstring: Optional[str]
    classes: List[DefinitionSummary] = field(default_factory=list)
    functions: List[DefinitionSummary] = field(default_factory=list)

    def as_dict(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "path": self.path,
            "docstring": self.docstring,
            "classes": [cls.as_dict() for cls in self.classes],
            "functions": [fn.as_dict() for fn in self.functions],
        }


@dataclass
class PackageSummary:
    """Summary of a Python package."""

    name: str
    path: str
    docstring: Optional[str]
    modules: List[ModuleSummary] = field(default_factory=list)

    def as_dict(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "path": self.path,
            "docstring": self.docstring,
            "modules": [module.as_dict() for module in self.modules],
        }


def normalize_docstring(doc: Optional[str]) -> Optional[str]:
    if not doc:
        return None
    cleaned = doc.strip()
    if not cleaned:
        return None
    return cleaned


def short_doc(doc: Optional[str]) -> str:
    """Return a single-line summary for Markdown output."""

    normalized = normalize_docstring(doc)
    if not normalized:
        return "_No docstring available._"
    first_line = normalized.splitlines()[0]
    truncated = first_line.strip()
    if len(truncated) > 160:
        truncated = truncated[:157].rstrip() + "..."
    return truncated


def parse_python_file(path: Path) -> ModuleSummary:
    """Parse a Python module and capture its docstrings."""

    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ModuleSummary(name=module_name_from_path(path), path=str(path), docstring=None)

    try:
        tree = ast.parse(source)
    except SyntaxError:
        return ModuleSummary(name=module_name_from_path(path), path=str(path), docstring=None)

    module_doc = normalize_docstring(ast.get_docstring(tree))
    classes: List[DefinitionSummary] = []
    functions: List[DefinitionSummary] = []

    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            doc = normalize_docstring(ast.get_docstring(node))
            classes.append(DefinitionSummary(name=node.name, docstring=doc))
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            doc = normalize_docstring(ast.get_docstring(node))
            functions.append(DefinitionSummary(name=node.name, docstring=doc))

    return ModuleSummary(
        name=module_name_from_path(path),
        path=str(path),
        docstring=module_doc,
        classes=classes,
        functions=functions,
    )


def module_name_from_path(path: Path) -> str:
    return ".".join(path.with_suffix("").parts)


def iter_python_files(root: Path) -> Iterable[Path]:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIR_NAMES]
        if any(part in SKIP_DIR_NAMES for part in Path(dirpath).parts):
            continue
        for filename in filenames:
            if filename.endswith(".py"):
                yield Path(dirpath, filename)


def find_package_parts(root: Path) -> Dict[Sequence[str], PackageSummary]:
    packages: Dict[Sequence[str], PackageSummary] = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIR_NAMES]
        if any(part in SKIP_DIR_NAMES for part in Path(dirpath).parts):
            continue
        if "__init__.py" not in filenames:
            continue
        directory = Path(dirpath)
        relative = directory.relative_to(root)
        parts = relative.parts
        package_name = ".".join(parts)
        init_path = directory / "__init__.py"
        module_summary = parse_python_file(init_path)
        packages[parts] = PackageSummary(
            name=package_name,
            path=str(relative),
            docstring=module_summary.docstring,
            modules=[],
        )
    return packages


def attach_modules_to_packages(
    root: Path,
    packages: Dict[Sequence[str], PackageSummary],
) -> List[ModuleSummary]:
    standalone: List[ModuleSummary] = []

    for module_path in iter_python_files(root):
        if module_path.name == "__init__.py":
            continue
        relative = module_path.relative_to(root)
        summary = parse_python_file(module_path)
        summary.path = str(relative)
        summary.name = ".".join(relative.with_suffix("").parts)

        parent_parts = relative.parent.parts
        assigned = False
        for depth in range(len(parent_parts), 0, -1):
            candidate = parent_parts[:depth]
            if candidate in packages:
                packages[candidate].modules.append(summary)
                assigned = True
                break
        if not assigned:
            standalone.append(summary)

    for package in packages.values():
        package.modules.sort(key=lambda m: m.name)

    standalone.sort(key=lambda m: m.name)
    return standalone


def build_index(
    root: Path, json_output: Path, markdown_output: Path
) -> Dict[str, object]:
    packages = find_package_parts(root)
    standalone_modules = attach_modules_to_packages(root, packages)

    index = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "root": str(root.resolve()),
        "packages": sorted((pkg.as_dict() for pkg in packages.values()), key=lambda p: p["name"]),
        "standalone_modules": [module.as_dict() for module in standalone_modules],
    }

    json_output.write_text(json.dumps(index, indent=2, sort_keys=False), encoding="utf-8")
    markdown_output.write_text(render_markdown(index), encoding="utf-8")

    return index


def render_markdown(index: Dict[str, object]) -> str:
    lines: List[str] = []
    timestamp = index.get("generated_at", "")
    lines.append("# Module Index")
    lines.append("")
    lines.append(f"Generated automatically on `{timestamp}` by `tools/nav/build_module_index.py`.")
    lines.append("Re-run this script after updating Python packages or modules to keep the index in sync.")
    lines.append("")

    packages = index.get("packages", [])
    if packages:
        lines.append("## Packages")
        lines.append("")
        for package in packages:
            lines.append(f"### `{package['name']}` ({package['path']})")
            lines.append("")
            doc = package.get("docstring")
            lines.append(f"{short_doc(doc)}")
            lines.append("")
            modules = package.get("modules", [])
            if modules:
                lines.append("| Module | Path | Summary |")
                lines.append("| --- | --- | --- |")
                for module in modules:
                    summary = short_doc(module.get("docstring"))
                    lines.append(
                        f"| `{module['name']}` | `{module['path']}` | {summary} |"
                    )
                lines.append("")
            for module in modules:
                lines.extend(render_module_details(module))
    else:
        lines.append("No Python packages with `__init__.py` files were found.")

    standalone = index.get("standalone_modules", [])
    if standalone:
        lines.append("## Standalone Modules")
        lines.append("")
        lines.append("| Module | Path | Summary |")
        lines.append("| --- | --- | --- |")
        for module in standalone:
            lines.append(
                f"| `{module['name']}` | `{module['path']}` | {short_doc(module.get('docstring'))} |"
            )
        lines.append("")
        for module in standalone:
            lines.extend(render_module_details(module))

    return "\n".join(lines).rstrip() + "\n"


def render_module_details(module: Dict[str, object]) -> List[str]:
    lines: List[str] = []
    classes = module.get("classes", [])
    functions = module.get("functions", [])

    if not classes and not functions:
        return lines

    lines.append(f"#### Details for `{module['name']}`")
    lines.append("")

    if classes:
        lines.append("**Classes**")
        for cls in classes:
            lines.append(f"- `{cls['name']}` – {short_doc(cls.get('docstring'))}")
        lines.append("")

    if functions:
        lines.append("**Functions**")
        for fn in functions:
            lines.append(f"- `{fn['name']}` – {short_doc(fn.get('docstring'))}")
        lines.append("")

    return lines


def parse_args() -> argparse.Namespace:
    default_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Build a module index for the repository.")
    parser.add_argument(
        "--root",
        type=Path,
        default=default_root,
        help="Repository root to scan (defaults to the project root).",
    )
    parser.add_argument(
        "--json-output",
        type=Path,
        default=None,
        help="Path to write the JSON summary (defaults to <root>/module_index.json).",
    )
    parser.add_argument(
        "--markdown-output",
        type=Path,
        default=None,
        help="Path to write the Markdown summary (defaults to <root>/MODULES.md).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = args.root.resolve()
    json_output = (args.json_output or root / "module_index.json").resolve()
    markdown_output = (args.markdown_output or root / "MODULES.md").resolve()

    json_output.parent.mkdir(parents=True, exist_ok=True)
    markdown_output.parent.mkdir(parents=True, exist_ok=True)

    build_index(root=root, json_output=json_output, markdown_output=markdown_output)


if __name__ == "__main__":
    main()
