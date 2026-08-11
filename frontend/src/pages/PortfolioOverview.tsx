// Home page: brand roster, run status, synergy pairs from the digest, a
// meter strip, the signal ledger for the newest run, and a demoted celebrity panel.
import { useEffect, useMemo, useState } from "react";
import { SignalLedger, type SignalMark } from "../components/charts";
import { getBrands, getCelebrities, getDigest, getMeter, getPipelineState, getRuns } from "../lib/api";
import type { Brand, MeterSnapshot, RunRow } from "../lib/types";
import FilterBar, { loadFilters, type FeedFilters } from "./FilterBar";
import { ErrorCard, Provenance } from "./shared";

export default function PortfolioOverview() {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [brandsErr, setBrandsErr] = useState<unknown>(null);
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [runsErr, setRunsErr] = useState<unknown>(null);
  const [digest, setDigest] = useState<Record<string, unknown> | null>(null);
  const [digestErr, setDigestErr] = useState<unknown>(null);
  const [meter, setMeter] = useState<MeterSnapshot | null>(null);
  const [meterErr, setMeterErr] = useState<unknown>(null);
  const [celebs, setCelebs] = useState<Record<string, unknown>[] | null>(null);
  const [celebsErr, setCelebsErr] = useState<unknown>(null);
  const [signals, setSignals] = useState<SignalMark[]>([]);
  const [filters, setFilters] = useState<FeedFilters>(() => loadFilters());

  useEffect(() => {
    getBrands().then(setBrands).catch((e) => setBrandsErr(e));
    getRuns().then(setRuns).catch((e) => setRunsErr(e));
    getDigest().then(setDigest).catch((e) => setDigestErr(e));
    getMeter().then(setMeter).catch((e) => setMeterErr(e));
    getCelebrities().then(setCelebs).catch((e) => setCelebsErr(e));
  }, []);

  useEffect(() => {
    if (!runs || runs.length === 0) return;
    const newest = [...runs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    getPipelineState(newest.run_id)
      .then((ps) => {
        setSignals(ps.signals.map((s) => ({ ts: s.fetched_at, source: s.source, url: s.url, label: s.headline })));
      })
      .catch(() => {
        // signal ledger just stays empty — not a hard page error, the run list already loaded
      });
  }, [runs]);

  const categories = useMemo(() => Array.from(new Set((brands ?? []).map((b) => b.category))), [brands]);
  const brandNames = useMemo(() => (brands ?? []).map((b) => b.name), [brands]);

  const filteredBrands = useMemo(() => {
    if (!brands) return [];
    return brands.filter((b) => {
      if (filters.category && b.category !== filters.category) return false;
      if (filters.brand && b.name !== filters.brand) return false;
      return true;
    });
  }, [brands, filters]);

  const runCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of runs ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  }, [runs]);

  const synergyPairs = Array.isArray(digest?.synergy_pairs) ? (digest!.synergy_pairs as unknown[]) : null;

  return (
    <div className="page">
      <h1 className="hero">Portfolio Overview</h1>
      <p className="page-sub">Every brand, every run, and the latest signals that fed the pipeline.</p>

      <div className="panel-header">
        <h2>Signal ledger</h2>
        <span className="source-stamp">most recent run</span>
      </div>
      {runsErr ? <ErrorCard route="GET /runs" error={runsErr} /> : <SignalLedger marks={signals} />}

      {Boolean(brandsErr) && <ErrorCard route="GET /brands" error={brandsErr} />}
      {brands && (
        <>
          <div className="panel-header" style={{ marginTop: 20 }}>
            <h2>Brands</h2>
          </div>
          <FilterBar categories={categories} brands={brandNames} value={filters} onChange={setFilters} />
          {filteredBrands.length === 0 ? (
            <div className="chart-empty">no brands match the current filters</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "var(--space-3)" }}>
              {filteredBrands.map((b) => (
                <div key={b.id} className="card" style={{ margin: 0 }}>
                  <div className="card-head">
                    <strong>{b.name}</strong>
                    <span className="pill" data-tone="neutral">
                      {b.category}
                    </span>
                  </div>
                  <p className="muted">{b.positioning}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                    {b.consumer_segments.map((seg) => (
                      <span key={seg} className="pill" data-tone="active">
                        {seg}
                      </span>
                    ))}
                  </div>
                  <p className="muted" style={{ marginTop: 8 }}>
                    {b.known_pitfalls.length} known pitfall{b.known_pitfalls.length === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="panel-header" style={{ marginTop: 20 }}>
        <h2>Run status</h2>
      </div>
      {runs && (
        <div className="stat-row">
          {Object.entries(runCounts).length === 0 && <p className="muted">No runs yet.</p>}
          {Object.entries(runCounts).map(([status, count]) => (
            <div className="stat-tile" key={status}>
              <div className="stat-value tabular">{count}</div>
              <div className="stat-label">{status}</div>
              <Provenance kind="measured" />
            </div>
          ))}
        </div>
      )}

      <div className="panel-header" style={{ marginTop: 20 }}>
        <h2>Synergy pairs</h2>
      </div>
      {digestErr ? (
        <ErrorCard route="GET /digest/latest" error={digestErr} />
      ) : synergyPairs && synergyPairs.length > 0 ? (
        <ul className="issue-list">
          {synergyPairs.map((p, i) => (
            <li key={i} className="muted" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
              {typeof p === "object" ? JSON.stringify(p) : String(p)}
            </li>
          ))}
        </ul>
      ) : (
        <div className="chart-empty">no synergy pairs in the latest digest</div>
      )}

      <div className="panel-header" style={{ marginTop: 20 }}>
        <h2>Meter</h2>
      </div>
      {meterErr ? (
        <ErrorCard route="GET /meter" error={meterErr} />
      ) : meter ? (
        <div className="stat-row">
          <div className="stat-tile">
            <div className="stat-value tabular">{meter.tokens.total}</div>
            <div className="stat-label">Total tokens</div>
            <Provenance kind="measured" />
          </div>
          <div className="stat-tile">
            <div className="stat-value tabular">${meter.estimated_cost_usd.toFixed(4)}</div>
            <div className="stat-label">Estimated cost</div>
            <Provenance kind="computed" />
          </div>
        </div>
      ) : (
        <p className="muted">Loading…</p>
      )}

      <div className="panel-header" style={{ marginTop: 20 }}>
        <h2>Celebrity sentiment</h2>
      </div>
      {celebsErr ? (
        <ErrorCard route="GET /celebrities" error={celebsErr} />
      ) : celebs && celebs.length > 0 ? (
        <div className="card">
          <ul className="issue-list">
            {celebs.slice(0, 5).map((c, i) => (
              <li key={i} className="muted" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{JSON.stringify(c)}</span>
                <Provenance kind="seeded" />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="chart-empty">no celebrity data</div>
      )}
    </div>
  );
}
