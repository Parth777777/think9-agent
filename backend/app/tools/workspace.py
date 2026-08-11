"""Workspace filesystem helpers — all paths are relative to app/workspace/.

Every agent output in this system is a real file on disk under this tree
(docs/HLD.md §6): this module is the only place that touches that filesystem
so path handling / directory creation stays in one spot.
"""
import json
import os

WORKSPACE_ROOT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "workspace")

FOLDER_TREE = [
    "01_Signals_Intelligence/trends",
    "02_Insights",
    "03_Creative_Studio",
    "04_Brand_Bibles",
    "05_Portfolio_Intelligence",
    "06_Stakeholder_Rooms",
    "07_Creator_Outreach",
    "08_Knowledge_Base",
]


def ensure_workspace_dirs() -> None:
    for folder in FOLDER_TREE:
        os.makedirs(os.path.join(WORKSPACE_ROOT, folder), exist_ok=True)


def _abs_path(relative_path: str) -> str:
    # ponytail: no per-segment traversal allowlist, good enough for a POC with no auth;
    # upgrade to a strict path-confinement check if this API is ever exposed publicly for writes.
    safe = relative_path.replace("\\", "/").lstrip("/")
    abs_path = os.path.normpath(os.path.join(WORKSPACE_ROOT, safe))
    if not abs_path.startswith(os.path.normpath(WORKSPACE_ROOT)):
        raise ValueError("path escapes workspace root")
    return abs_path


def write_json(relative_path: str, obj: dict) -> None:
    path = _abs_path(relative_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)


def write_text(relative_path: str, content: str) -> None:
    path = _abs_path(relative_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def read_text(relative_path: str) -> str:
    with open(_abs_path(relative_path), "r", encoding="utf-8") as f:
        return f.read()


def list_tree(root: str = "") -> dict:
    """Recursive {name, type, children?} tree for GET /workspace/tree."""
    abs_root = _abs_path(root) if root else WORKSPACE_ROOT
    name = os.path.basename(abs_root) or "Think9_PULSE_Workspace"

    if not os.path.isdir(abs_root):
        return {"name": name, "type": "file"}

    children = []
    for entry in sorted(os.listdir(abs_root)):
        entry_path = os.path.join(abs_root, entry)
        rel = os.path.relpath(entry_path, WORKSPACE_ROOT).replace("\\", "/")
        if os.path.isdir(entry_path):
            children.append(list_tree(rel))
        else:
            children.append({"name": entry, "type": "file"})
    return {"name": name, "type": "directory", "children": children}
