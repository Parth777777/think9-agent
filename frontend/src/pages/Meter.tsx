// Token/cost meter. Tokens are measured, cost is computed from an illustrative
// rate — the cost_note caveat is printed on screen, not hidden in a tooltip.
import { useEffect, useState } from "react";
import { BarChart } from "../components/charts";
import { getMeter } from "../lib/api";
import type { MeterSnapshot } from "../lib/types";
import { ErrorCard, Provenance } from "./shared";

export default function Meter() {
  const [meter, setMeter] = useState<MeterSnapshot | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMeter()
      .then(setMeter)
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <h1 className="hero">Meter</h1>
      <p className="page-sub">LLM token usage across all agent nodes, plus rate-limit status and estimated spend.</p>

      {loading && <p className="muted">Loading…</p>}
      {error != null && <ErrorCard route="GET /meter" error={error} />}

      {meter && (
        <>
          <div className="stat-row">
            <div className="stat-tile">
              <div className="stat-value tabular">{meter.tokens.total}</div>
              <div className="stat-label">Total tokens</div>
              <Provenance kind="measured" />
            </div>
            <div className="stat-tile">
              <div className="stat-value tabular">{meter.tokens.prompt}</div>
              <div className="stat-label">Prompt tokens</div>
              <Provenance kind="measured" />
            </div>
            <div className="stat-tile">
              <div className="stat-value tabular">{meter.tokens.completion}</div>
              <div className="stat-label">Completion tokens</div>
              <Provenance kind="measured" />
            </div>
            <div className="stat-tile">
              <div className="stat-value tabular">${meter.estimated_cost_usd.toFixed(4)}</div>
              <div className="stat-label">Estimated cost</div>
              <Provenance kind="computed" />
            </div>
          </div>

          <div className="error-banner" style={{ color: "var(--text-muted)", background: "var(--surface)", borderColor: "var(--border)" }}>
            {meter.cost_note}
          </div>

          <h2 style={{ marginTop: 20 }}>Tokens by node</h2>
          <BarChart
            bars={Object.entries(meter.by_node).map(([node, v]) => ({
              label: node,
              value: v.prompt_tokens + v.completion_tokens,
            }))}
            hue="var(--neel)"
          />

          <h2 style={{ marginTop: 20 }}>Rate limit snapshot</h2>
          {Object.keys(meter.rate_limit).length === 0 ? (
            <div className="chart-empty">no rate-limit data</div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th className="num">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(meter.rate_limit).map(([k, v]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td className="num tabular">{typeof v === "object" ? JSON.stringify(v) : String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
