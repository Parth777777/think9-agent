// Hierarchical agent graph: Orchestrator -> 3 Pods -> agents, per docs/HLD.md §2.
// P0 only wires Nazariya (Intelligence), Consumer Shastra (Synthesis), and the full
// Karigar<->Pehredar->Human Approval loop (Creative) — see docs/LLD.md §3 P0 note.
//
// This component owns the poll loop (GET /pipeline/{run_id} every 1.5s while the run
// hasn't reached a terminal status) since it's the one place that needs the live state
// to derive node color. It reports each fetched state up via onStateChange so the
// embedding page (ContentPipeline) doesn't need a second poll loop.
import { useEffect, useRef, useState } from "react";
import { ReactFlow, Background, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getPipelineState } from "../lib/api";
import type { PipelineState } from "../lib/types";
import Pill, { type PillTone } from "./Pill";

const POLL_MS = 1500;

type Status = "pending" | "active" | "done" | "flagged";

const STATUS_LABEL: Record<Status, string> = {
  pending: "Pending",
  active: "Active",
  done: "Done",
  flagged: "Flagged",
};

const STATUS_TONE: Record<Status, PillTone> = {
  pending: "neutral",
  active: "active",
  done: "done",
  flagged: "flagged",
};

// Token reads (not hardcoded hexes) — CSS custom properties resolve fine
// inside inline style objects, so these stay in sync with index.css.
const STATUS_BORDER: Record<Status, string> = {
  pending: "var(--border)",
  active: "var(--haldi)",
  done: "var(--mehendi)",
  flagged: "var(--sindoor)",
};

function statusOf(s: PipelineState | null, key: string): Status {
  if (!s) return "pending";
  switch (key) {
    case "orchestrator":
      return "done";
    case "nazariya":
      return s.signals.length > 0 ? "done" : "active";
    case "consumer_shastra":
      if (s.brief) return "done";
      return s.signals.length > 0 ? "active" : "pending";
    case "karigar":
      if (s.content_drafts.length > 0) return "done";
      return s.brief ? "active" : "pending";
    case "pehredar":
      if (s.compliance_result) return s.compliance_result.passed ? "done" : "flagged";
      return s.content_drafts.length > 0 ? "active" : "pending";
    case "human_approval":
      if (s._run_status === "completed") return "done";
      if (s._run_status === "rejected") return "flagged";
      if (s._paused) return "active";
      return "pending";
    default:
      return "pending";
  }
}

function baseNode(id: string, title: string, subtitle: string, x: number, y: number, status: Status, width = 172): Node {
  return {
    id,
    position: { x, y },
    data: {
      label: (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--fg)" }}>{title}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>{subtitle}</div>
          <Pill tone={STATUS_TONE[status]} label={STATUS_LABEL[status]} />
        </div>
      ),
    },
    style: {
      background: "var(--surface)",
      border: `1.5px solid ${STATUS_BORDER[status]}`,
      borderRadius: 14,
      padding: 12,
      width,
      textAlign: "left",
      boxShadow:
        status === "active"
          ? "0 0 0 3px color-mix(in srgb, var(--haldi) 15%, transparent)"
          : "var(--shadow-sm)",
    },
  };
}

function podLabel(id: string, label: string, x: number, y: number): Node {
  return {
    id,
    position: { x, y },
    data: { label },
    draggable: false,
    selectable: false,
    connectable: false,
    style: {
      background: "transparent",
      border: "none",
      color: "var(--muted)",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      pointerEvents: "none",
      width: 220,
    },
  };
}

export default function AgentGraphViz({
  runId,
  onStateChange,
}: {
  runId: string | null;
  onStateChange?: (state: PipelineState | null) => void;
}) {
  const [state, setState] = useState<PipelineState | null>(null);
  const cb = useRef(onStateChange);
  cb.current = onStateChange;

  useEffect(() => {
    if (!runId) {
      setState(null);
      cb.current?.(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const s = await getPipelineState(runId as string);
        if (cancelled) return;
        setState(s);
        cb.current?.(s);
        const terminal = s._run_status === "completed" || s._run_status === "rejected";
        if (!terminal) timer = setTimeout(poll, POLL_MS);
      } catch {
        if (!cancelled) timer = setTimeout(poll, POLL_MS);
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId]);

  const iterationCount = state?.iteration_count ?? 0;
  const loopActive = iterationCount > 1;

  const nodes: Node[] = [
    baseNode("orchestrator", "Orchestrator", "Trigger classifier", 350, 0, statusOf(state, "orchestrator"), 200),

    podLabel("lbl_intel", "Intelligence Pod", 20, 100),
    baseNode("nazariya", "Nazariya", "Trend Scout", 20, 128, statusOf(state, "nazariya")),

    podLabel("lbl_synth", "Synthesis Pod", 280, 100),
    baseNode("consumer_shastra", "Consumer Shastra", "Insight Synthesizer", 280, 128, statusOf(state, "consumer_shastra"), 200),

    podLabel("lbl_creative", "Creative Pod", 560, 100),
    baseNode("karigar", "Karigar", "Content Strategist", 540, 128, statusOf(state, "karigar")),
    baseNode("pehredar", "Pehredar", "Brand Guardian", 540, 248, statusOf(state, "pehredar")),
    baseNode("human_approval", "Human Approval", "interrupt()", 540, 368, statusOf(state, "human_approval")),
  ];

  const edges: Edge[] = [
    { id: "e1", source: "orchestrator", target: "nazariya" },
    { id: "e2", source: "nazariya", target: "consumer_shastra" },
    { id: "e3", source: "consumer_shastra", target: "karigar" },
    { id: "e4", source: "karigar", target: "pehredar" },
    { id: "e5", source: "pehredar", target: "human_approval" },
    {
      id: "loop",
      source: "pehredar",
      target: "karigar",
      label: loopActive ? `looping (iteration ${iterationCount})` : "loop-back (unused this run)",
      animated: loopActive,
      style: {
        stroke: loopActive ? "var(--haldi)" : "var(--border)",
        strokeDasharray: "6 4",
        strokeWidth: loopActive ? 2.5 : 1.5,
      },
      labelStyle: { fill: loopActive ? "var(--haldi)" : "var(--muted)", fontSize: 11, fontWeight: 600 },
    },
  ];

  return (
    <div className="graph-card">
      <div style={{ height: 460 }}>
        <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.2 }} nodesDraggable proOptions={{ hideAttribution: true }}>
          <Background color="var(--border)" />
        </ReactFlow>
      </div>
      <div className="graph-legend">
        <Pill tone="neutral" label="Pending" />
        <Pill tone="active" label="Active" />
        <Pill tone="done" label="Done" />
        <Pill tone="flagged" label="Flagged / rejected" />
      </div>
    </div>
  );
}
