import { useEffect, useState } from "react";
import FolderTree from "../components/FolderTree";
import { getWorkspaceFile, getWorkspaceTree } from "../lib/api";
import type { WorkspaceNode } from "../lib/types";

function isJsonPath(path: string) {
  return path.toLowerCase().endsWith(".json") || path.toLowerCase().endsWith(".jsonl");
}

export default function WorkspaceBrowser() {
  const [tree, setTree] = useState<WorkspaceNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWorkspaceTree()
      .then(setTree)
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingTree(false));
  }, []);

  async function handleSelectFile(path: string) {
    setSelectedPath(path);
    setLoadingFile(true);
    setError(null);
    try {
      const res = await getWorkspaceFile(path);
      setFileContent(res.content);
    } catch (e) {
      setError(String(e));
      setFileContent(null);
    } finally {
      setLoadingFile(false);
    }
  }

  let prettyContent = fileContent;
  if (fileContent && selectedPath && isJsonPath(selectedPath)) {
    try {
      // .jsonl is one JSON object per line — pretty-print each line separately.
      if (selectedPath.toLowerCase().endsWith(".jsonl")) {
        prettyContent = fileContent
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => JSON.stringify(JSON.parse(l), null, 2))
          .join("\n\n");
      } else {
        prettyContent = JSON.stringify(JSON.parse(fileContent), null, 2);
      }
    } catch {
      prettyContent = fileContent; // not actually valid JSON, show raw
    }
  }

  return (
    <div className="page">
      <h1 className="hero">Workspace Browser</h1>
      <p className="page-sub">
        Read-only view of the real <code>Think9_PULSE_Workspace/</code> folder on the backend filesystem —
        every agent writes its output here as it runs.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <div className="workspace-layout">
        <div className="tree-pane">
          {loadingTree && <p className="muted">Loading tree…</p>}
          {tree && (
            <FolderTree node={tree} path="" onSelectFile={handleSelectFile} selectedPath={selectedPath} />
          )}
        </div>
        <div className="preview-pane">
          {!selectedPath && <p className="muted">Select a file to preview its contents.</p>}
          {selectedPath && (
            <>
              <div className="preview-path">{selectedPath}</div>
              {loadingFile ? <p className="muted">Loading…</p> : <pre className="json-block">{prettyContent}</pre>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
