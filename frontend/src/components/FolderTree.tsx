import { useState } from "react";
import type { WorkspaceNode } from "../lib/types";

interface Props {
  node: WorkspaceNode;
  path: string; // relative path built up from the root, joined with "/"
  depth?: number;
  onSelectFile: (path: string) => void;
  selectedPath: string | null;
}

export default function FolderTree({ node, path, depth = 0, onSelectFile, selectedPath }: Props) {
  const [open, setOpen] = useState(depth < 1); // top-level folders start expanded

  if (node.type === "file") {
    const isSelected = selectedPath === path;
    return (
      <div
        className={`tree-file${isSelected ? " tree-file-selected" : ""}`}
        style={{ paddingLeft: depth * 16 + 20 }}
        onClick={() => onSelectFile(path)}
      >
        {node.name}
      </div>
    );
  }

  return (
    <div>
      <div className="tree-dir" style={{ paddingLeft: depth * 16 }} onClick={() => setOpen((o) => !o)}>
        <span className="tree-caret">{open ? "▾" : "▸"}</span> {node.name}
      </div>
      {open &&
        node.children?.map((child) => (
          <FolderTree
            key={path ? `${path}/${child.name}` : child.name}
            node={child}
            path={path ? `${path}/${child.name}` : child.name}
            depth={depth + 1}
            onSelectFile={onSelectFile}
            selectedPath={selectedPath}
          />
        ))}
    </div>
  );
}
