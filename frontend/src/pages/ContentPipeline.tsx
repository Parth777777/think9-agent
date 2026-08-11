import { useEffect, useState } from "react";
import AgentGraphViz from "../components/AgentGraphViz";
import Pill, { type PillTone } from "../components/Pill";
import { approvePipeline, getBrands, runPipeline } from "../lib/api";
import type { Brand, Decision, PipelineState } from "../lib/types";

const RUN_STATUS_PILL: Record<string, { tone: PillTone; label: string }> = {
  idle: { tone: "neutral", label: "Idle" },
  running: { tone: "active", label: "Running" },
  paused_for_approval: { tone: "active", label: "Paused for approval" },
  completed: { tone: "done", label: "Completed" },
  rejected: { tone: "flagged", label: "Rejected" },
};

export default function ContentPipeline() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState<string>("");
  const [runId, setRunId] = useState<string | null>(null);
  const [pipelineState, setPipelineState] = useState<PipelineState | null>(null);
  const [running, setRunning] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Note: PulseState.final_output is never populated on the graph itself (confirmed by
  // reading backend/app/graphs/state.py + routes.py) — only the approve response
  // synthesizes it. Polling GET /pipeline/{run_id} will never show it, so we keep the
  // approve call's own response here instead of trusting pipelineState.final_output.
  const [finalOutput, setFinalOutput] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    getBrands()
      .then((b) => {
        setBrands(b);
        if (b.length > 0) setBrandId(b[0].id);
      })
      .catch((e) => setError(String(e)));
  }, []);

  async function handleRun() {
    if (!brandId) return;
    setError(null);
    setRunning(true);
    setPipelineState(null);
    setFinalOutput(null);
    try {
      const res = await runPipeline(brandId);
      setRunId(res.run_id);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  async function handleDecision(decision: Decision) {
    if (!runId) return;
    setError(null);
    setDeciding(true);
    try {
      const res = await approvePipeline(runId, decision, notes || undefined);
      setNotes("");
      setFinalOutput(res.final_output);
      // the AgentGraphViz poll loop will pick up the resulting terminal status
    } catch (e) {
      setError(String(e));
    } finally {
      setDeciding(false);
    }
  }

  const latestDraft = pipelineState?.content_drafts[pipelineState.content_drafts.length - 1] ?? null;
  const canDecide = pipelineState?._paused && pipelineState._run_status === "paused_for_approval";
  const runStatusKey = pipelineState?._run_status ?? "idle";
  const runStatusPill = RUN_STATUS_PILL[runStatusKey] ?? RUN_STATUS_PILL.idle;

  return (
    <div className="page">
      <h1 className="hero">Content Pipeline</h1>
      <p className="page-sub">Trigger a signal → content → approval run and watch the agent graph light up.</p>

      <div className="toolbar">
        <div className="toolbar-left">
          <span className="toolbar-label">Brand</span>
          <div className="chip-row">
            {brands.map((b) => (
              <button
                key={b.id}
                className={brandId === b.id ? "chip selected" : "chip"}
                disabled={running}
                onClick={() => setBrandId(b.id)}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {runId && <Pill tone={runStatusPill.tone} label={runStatusPill.label} />}
          <button className="btn-pill btn-run" onClick={handleRun} disabled={!brandId || running}>
            {running ? "Running…" : "Run pipeline"}
          </button>
        </div>
      </div>

      {runId && <p className="muted" style={{ marginTop: -12, marginBottom: 20 }}>run_id: {runId}</p>}

      {error && <div className="error-banner">{error}</div>}

      {pipelineState && (
        <div className="stat-row">
          <div className="stat-tile">
            <div className="stat-value">{pipelineState.signals.length}</div>
            <div className="stat-label">Signals fetched</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{pipelineState.iteration_count}</div>
            <div className="stat-label">Guardian iterations</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">
              {pipelineState.compliance_result ? `${(pipelineState.compliance_result.score * 100).toFixed(0)}%` : "—"}
            </div>
            <div className="stat-label">Compliance score</div>
          </div>
        </div>
      )}

      <AgentGraphViz runId={runId} onStateChange={setPipelineState} />

      {pipelineState && (
        <div className="pipeline-grid">
          <section className="card">
            <h2>Draft {latestDraft ? `— iteration ${latestDraft.iteration}` : ""}</h2>
            {latestDraft ? (
              <>
                <p className="copy-block">{latestDraft.copy}</p>
                {latestDraft.image_url && (
                  <img src={latestDraft.image_url} alt="Generated creative" className="draft-image" />
                )}
                {latestDraft.ad_variants.length > 0 && (
                  <>
                    <h3>Ad variants</h3>
                    <ul>
                      {latestDraft.ad_variants.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <p className="muted">No draft yet.</p>
            )}
          </section>

          <section className="card">
            <h2>Compliance (Pehredar)</h2>
            {pipelineState.compliance_result ? (
              <>
                <div className="card-head">
                  <Pill
                    tone={pipelineState.compliance_result.passed ? "done" : "flagged"}
                    label={pipelineState.compliance_result.passed ? "Passed" : "Failed"}
                  />
                  <span className="muted">score {pipelineState.compliance_result.score.toFixed(2)}</span>
                </div>
                {pipelineState.compliance_result.issues.length > 0 ? (
                  <ul className="issue-list">
                    {pipelineState.compliance_result.issues.map((issue, i) => (
                      <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <Pill tone="flagged" label="Issue" />
                        <span style={{ fontSize: 13 }}>{issue}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Pill tone="done" label="No issues found" />
                )}
              </>
            ) : (
              <p className="muted">No compliance result yet.</p>
            )}
            <p className="muted" style={{ marginTop: 12 }}>Loop iterations: {pipelineState.iteration_count}</p>
          </section>
        </div>
      )}

      {pipelineState && (
        <section className="card decision-panel">
          <h2>Decision</h2>
          <input
            type="text"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canDecide || deciding}
          />
          <div className="decision-buttons">
            <button className="btn-pill btn-approve" disabled={!canDecide || deciding} onClick={() => handleDecision("approve")}>
              Approve
            </button>
            <button className="btn-pill btn-reject" disabled={!canDecide || deciding} onClick={() => handleDecision("reject")}>
              Reject
            </button>
            <button
              className="btn-pill btn-secondary"
              disabled={!canDecide || deciding}
              onClick={() => handleDecision("request_changes")}
            >
              Request changes
            </button>
          </div>
          {!canDecide && (
            <p className="muted" style={{ marginTop: 10 }}>
              {pipelineState._run_status === "completed" && "Run completed."}
              {pipelineState._run_status === "rejected" && "Run rejected."}
              {pipelineState._run_status === "running" && "Waiting for the run to reach approval…"}
            </p>
          )}
        </section>
      )}

      {finalOutput != null && (
        <section className="card">
          <h2>Final output</h2>
          <pre className="json-block">{JSON.stringify(finalOutput, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}
