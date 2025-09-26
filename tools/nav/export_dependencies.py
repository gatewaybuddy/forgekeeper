#!/usr/bin/env python3
"""Export dependency graphs for Forgekeeper navigation tooling.

This script gathers Python import relationships and TypeScript dependency
information for both the frontend and backend projects. Results are written to
JSON artifacts under ``.forgekeeper/cache`` so that other tools (or agents) can
query the repository structure without expensive re-parsing.

When available the exporter consumes the repository-wide module index generated
by :mod:`tools.nav.build_module_index`. This enables accurate resolution of
relative imports and ensures that package ``__init__`` files are included in the
resulting graph. If the index is missing the exporter gracefully falls back to a
filesystem scan.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from importlib import util as importlib_util
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple

CACHE_DIR_NAME = ".forgekeeper/cache"
PYTHON_ARTIFACT = "python_import_graph.json"
FRONTEND_ARTIFACT = "frontend_dependency_graph.json"
BACKEND_ARTIFACT = "backend_dependency_graph.json"
SUMMARY_ARTIFACT = "dependency_summary.json"
MODULE_INDEX_CANDIDATES = (
    Path(CACHE_DIR_NAME) / "module_index.json",
    Path("module_index.json"),
)

TS_ANALYZER_SCRIPT = r"""
const fs = require('fs');
const path = require('path');

function loadTypeScript(projectRoot) {
  const searchPaths = [projectRoot, process.cwd()];
  for (const candidate of searchPaths) {
    try {
      const resolved = require.resolve('typescript', { paths: [candidate] });
      return require(resolved);
    } catch (error) {
      if (error && error.code !== 'MODULE_NOT_FOUND') {
        throw error;
      }
    }
  }
  throw new Error('Unable to resolve the `typescript` package. Ensure dependencies are installed.');
}

function collectFromSourceFile(ts, sourceFile) {
  const dependencies = new Set();
  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      dependencies.add(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      dependencies.add(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node)) {
      const ref = node.moduleReference;
      if (ts.isExternalModuleReference(ref) && ref.expression && ts.isStringLiteral(ref.expression)) {
        dependencies.add(ref.expression.text);
      }
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1) {
        const arg = node.arguments[0];
        if (ts.isStringLiteral(arg)) {
          dependencies.add(arg.text);
        }
      }
      if (ts.isIdentifier(node.expression) && node.expression.escapedText === 'require' && node.arguments.length === 1) {
        const arg = node.arguments[0];
        if (ts.isStringLiteral(arg)) {
          dependencies.add(arg.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return Array.from(dependencies).sort();
}

function analyseProject(projectRoot, tsconfigPath) {
  const ts = loadTypeScript(projectRoot);
  const absRoot = path.resolve(projectRoot);
  const absConfig = path.resolve(projectRoot, tsconfigPath);
  if (!fs.existsSync(absConfig)) {
    return { status: 'missing-config', message: `No tsconfig at ${absConfig}` };
  }

  const readResult = ts.readConfigFile(absConfig, ts.sys.readFile);
  if (readResult.error) {
    return { status: 'config-error', message: ts.formatDiagnosticsWithColorAndContext([readResult.error], {
      getCurrentDirectory: () => process.cwd(),
      getCanonicalFileName: f => f,
      getNewLine: () => '\n',
    }) };
  }

  const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, path.dirname(absConfig));
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  const dependencies = {};

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) {
      continue;
    }
    const fileName = sourceFile.fileName;
    if (!fileName.startsWith(absRoot)) {
      continue;
    }
    if (fileName.includes(`${path.sep}node_modules${path.sep}`)) {
      continue;
    }
    const relative = path.relative(absRoot, fileName);
    dependencies[relative] = collectFromSourceFile(ts, sourceFile);
  }

  return {
    status: 'ok',
    tsconfig: path.relative(absRoot, absConfig),
    fileCount: Object.keys(dependencies).length,
    files: dependencies,
  };
}

function main() {
  const [projectRoot, tsconfigPath] = process.argv.slice(2);
  try {
    const result = analyseProject(projectRoot, tsconfigPath);
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    process.stdout.write(JSON.stringify({ status: 'error', message: error.message, stack: error.stack }));
  }
}

main();
"""


@dataclass
class ModuleInfo:
    name: str
    path: Path
    relative_path: Path
    package_parts: Tuple[str, ...]


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export Python and TypeScript dependency graphs.")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="Repository root. Defaults to two directories above this script.",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        help="Directory for cached artifacts. Defaults to <root>/.forgekeeper/cache.",
    )
    parser.add_argument(
        "--module-index",
        type=Path,
        help="Optional explicit path to module_index.json generated by build_module_index.py.",
    )
    parser.add_argument(
        "--frontend",
        type=Path,
        help="Path to the frontend project (expects a tsconfig.json). Defaults to <root>/frontend if present.",
    )
    parser.add_argument(
        "--backend",
        type=Path,
        help="Path to the backend project (expects a tsconfig.json). Defaults to <root>/backend if present.",
    )
    parser.add_argument(
        "--frontend-tsconfig",
        default="tsconfig.json",
        help="Frontend tsconfig file relative to the project directory.",
    )
    parser.add_argument(
        "--backend-tsconfig",
        default="tsconfig.json",
        help="Backend tsconfig file relative to the project directory.",
    )
    parser.add_argument(
        "--no-summary",
        action="store_true",
        help="Skip writing the combined dependency_summary.json artifact.",
    )
    return parser.parse_args(argv)


def ensure_cache_dir(root: Path, cache_dir: Optional[Path]) -> Path:
    directory = cache_dir or root / CACHE_DIR_NAME
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def load_module_index(root: Path, explicit: Optional[Path], cache_dir: Path) -> Tuple[Optional[Mapping[str, object]], Optional[Path]]:
    candidates = []
    if explicit:
        candidates.append(explicit)
    else:
        for candidate in MODULE_INDEX_CANDIDATES:
            if candidate.is_absolute():
                candidates.append(candidate)
            else:
                candidates.append(root / candidate)
    for candidate in candidates:
        if candidate.exists():
            try:
                with candidate.open("r", encoding="utf-8") as handle:
                    return json.load(handle), candidate
            except json.JSONDecodeError:
                continue
    return None, None


def collect_module_info(root: Path, module_index: Optional[Mapping[str, object]]) -> Dict[str, ModuleInfo]:
    modules: Dict[str, ModuleInfo] = {}

    def add_module(name: str, path: Path) -> None:
        absolute = path if path.is_absolute() else (root / path)
        if not absolute.exists():
            return
        if absolute.suffix != ".py":
            return
        package_parts: Tuple[str, ...]
        if absolute.name == "__init__.py":
            package_parts = tuple(name.split("."))
        else:
            parts = name.split(".")
            package_parts = tuple(parts[:-1])
        try:
            relative_path = absolute.relative_to(root)
        except ValueError:
            relative_path = absolute
        modules[name] = ModuleInfo(
            name=name,
            path=absolute,
            relative_path=relative_path,
            package_parts=package_parts,
        )

    if module_index:
        index_root = Path(module_index.get("root", root))
        if not index_root.is_absolute():
            index_root = (root / index_root).resolve()
        packages = module_index.get("packages", [])
        for package in packages:
            pkg_name = package.get("name")
            pkg_path = package.get("path")
            if pkg_name and pkg_path:
                add_module(pkg_name, index_root / pkg_path / "__init__.py")
            for module in package.get("modules", []):
                mod_name = module.get("name")
                mod_path = module.get("path")
                if mod_name and mod_path:
                    add_module(mod_name, index_root / mod_path)
        for module in module_index.get("standalone_modules", []):
            mod_name = module.get("name")
            mod_path = module.get("path")
            if mod_name and mod_path:
                add_module(mod_name, index_root / mod_path)
    else:
        for py_path in iter_python_files(root):
            rel = py_path.relative_to(root)
            module_name = ".".join(rel.with_suffix("").parts)
            add_module(module_name, py_path)

    return modules


def iter_python_files(root: Path) -> Iterable[Path]:
    skip_dirs = {".git", "__pycache__", ".mypy_cache", ".pytest_cache", "node_modules", ".venv", "venv"}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        if any(part in skip_dirs for part in Path(dirpath).parts):
            continue
        for filename in filenames:
            if filename.endswith(".py"):
                yield Path(dirpath) / filename


def parse_python_imports(modules: Mapping[str, ModuleInfo]) -> Dict[str, object]:
    graph: Dict[str, Dict[str, object]] = {}

    for module_name in sorted(modules):
        info = modules[module_name]
        try:
            source = info.path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        try:
            tree = ast.parse(source, filename=str(info.path))
        except SyntaxError:
            continue

        dependencies: Set[str] = set()
        detailed: List[Dict[str, object]] = []

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    target = alias.name
                    dependencies.add(target)
                    detailed.append(
                        {
                            "type": "import",
                            "module": target,
                            "alias": alias.asname,
                        }
                    )
            elif isinstance(node, ast.ImportFrom):
                resolved = resolve_from_import(info.package_parts, node)
                if resolved:
                    dependencies.add(resolved)
                detailed.append(
                    {
                        "type": "from",
                        "module": node.module,
                        "resolved": resolved,
                        "level": node.level,
                        "names": [alias.name for alias in node.names],
                    }
                )

        graph[module_name] = {
            "path": str(info.relative_path),
            "imports": sorted(dependencies),
            "details": detailed,
            "internal": sorted(dep for dep in dependencies if dep in modules),
        }

    return graph


def python_graph_stats(graph: Mapping[str, Mapping[str, object]]) -> Dict[str, int]:
    module_count = len(graph)
    import_edges = sum(len(entry.get("imports", [])) for entry in graph.values())
    internal_edges = sum(len(entry.get("internal", [])) for entry in graph.values())
    return {
        "module_count": module_count,
        "import_edges": import_edges,
        "internal_edges": internal_edges,
    }


def resolve_from_import(package_parts: Sequence[str], node: ast.ImportFrom) -> Optional[str]:
    module = node.module or ""
    level = node.level or 0
    package = ".".join(package_parts)

    if level == 0:
        return module or None

    if not package:
        return module or None

    target = "." * level + module
    try:
        resolved = importlib_util.resolve_name(target or ".", package)
    except (ImportError, ValueError):
        return module or None
    return resolved


def run_ts_dependency_scan(project_root: Optional[Path], tsconfig: str) -> Dict[str, object]:
    if not project_root:
        return {"status": "skipped", "message": "Project directory not provided."}
    project_root = project_root.resolve()
    tsconfig_path = project_root / tsconfig
    if not tsconfig_path.exists():
        return {"status": "missing-config", "message": f"No {tsconfig} found in {project_root}"}

    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as handle:
        handle.write(TS_ANALYZER_SCRIPT)
        temp_path = Path(handle.name)
    try:
        result = subprocess.run(
            ["node", str(temp_path), str(project_root), tsconfig],
            cwd=project_root,
            check=False,
            capture_output=True,
            text=True,
        )
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass

    if result.returncode != 0:
        return {
            "status": "error",
            "message": result.stderr.strip() or f"Node exited with {result.returncode}",
        }

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        return {
            "status": "error",
            "message": f"Failed to parse analyzer output: {exc}",
            "stdout": result.stdout,
            "stderr": result.stderr,
        }

    return data


def write_json(path: Path, payload: Mapping[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def make_summary(
    python_graph: Mapping[str, object],
    frontend_graph: Mapping[str, object],
    backend_graph: Mapping[str, object],
    module_index_path: Optional[Path],
) -> Dict[str, object]:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "module_index": str(module_index_path) if module_index_path else None,
        "python": python_graph_stats(python_graph),
        "frontend": frontend_graph,
        "backend": backend_graph,
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    root = args.root.resolve()
    cache_dir = ensure_cache_dir(root, args.cache_dir)
    module_index, module_index_path = load_module_index(root, args.module_index, cache_dir)

    modules = collect_module_info(root, module_index)
    python_graph = parse_python_imports(modules)

    frontend_dir = args.frontend or (root / "frontend" if (root / "frontend").exists() else None)
    backend_dir = args.backend or (root / "backend" if (root / "backend").exists() else None)

    frontend_graph = run_ts_dependency_scan(frontend_dir, args.frontend_tsconfig)
    backend_graph = run_ts_dependency_scan(backend_dir, args.backend_tsconfig)

    write_json(cache_dir / PYTHON_ARTIFACT, {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "module_index": str(module_index_path) if module_index_path else None,
        "stats": python_graph_stats(python_graph),
        "modules": python_graph,
    })

    write_json(cache_dir / FRONTEND_ARTIFACT, {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project_root": str(frontend_dir) if frontend_dir else None,
        "graph": frontend_graph,
    })

    write_json(cache_dir / BACKEND_ARTIFACT, {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project_root": str(backend_dir) if backend_dir else None,
        "graph": backend_graph,
    })

    if not args.no_summary:
        summary = make_summary(python_graph, frontend_graph, backend_graph, module_index_path)
        write_json(cache_dir / SUMMARY_ARTIFACT, summary)

    print(f"Python graph written to {cache_dir / PYTHON_ARTIFACT}")
    print(f"Frontend dependencies written to {cache_dir / FRONTEND_ARTIFACT}")
    print(f"Backend dependencies written to {cache_dir / BACKEND_ARTIFACT}")
    if not args.no_summary:
        print(f"Summary written to {cache_dir / SUMMARY_ARTIFACT}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
