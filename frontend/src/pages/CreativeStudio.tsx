// Asset pack from the latest run's last content draft. No assets -> say so,
// don't fake a gallery. Failed assets (no url) render as an explicit failed
// tile. "unverified" assets have a real, usable Pollinations URL that just
// wasn't confirmed server-side (rate-limited pre-fetch) — render the image
// but badge it distinctly, and retry on load failure with backoff since an
// immediate 429 often succeeds a few seconds later.
import { useEffect, useRef, useState } from "react";
import Icon from "../components/icons";
import { getPipelineState, getRuns } from "../lib/api";
import type { Asset, RunRow } from "../lib/types";
import { ErrorCard, ModeStamp, Provenance } from "./shared";

const RETRY_DELAYS_MS = [2000, 5000, 12000];

function AssetTile({ asset }: { asset: Asset }) {
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleError = () => {
    if (attempt >= RETRY_DELAYS_MS.length) {
      setGaveUp(true);
      return;
    }
    setRetrying(true);
    timerRef.current = setTimeout(() => {
      setAttempt((a) => a + 1);
      setRetrying(false);
    }, RETRY_DELAYS_MS[attempt]);
  };

  if (gaveUp) {
    return (
      <div className="gallery-item" style={{ display: "flex", flexDirection: "column" }}>
        <div className="asset-tile-status" style={{ aspectRatio: 1 }}>
          <Icon name="fail" size={22} />
          <span className="muted" style={{ fontSize: 11 }}>
            couldn't load after {RETRY_DELAYS_MS.length} retries
          </span>
        </div>
        <div className="gallery-item-label">
          {asset.format} · {asset.size}
        </div>
      </div>
    );
  }

  if (retrying) {
    return (
      <div className="gallery-item" style={{ display: "flex", flexDirection: "column" }}>
        <div className="asset-tile-status asset-tile-pulse" style={{ aspectRatio: 1 }}>
          <Icon name="rateLimited" size={22} />
          <span className="muted" style={{ fontSize: 11 }}>
            generating…
          </span>
        </div>
        <div className="gallery-item-label">
          {asset.format} · {asset.size}
        </div>
      </div>
    );
  }

  const src = attempt === 0 ? asset.url! : `${asset.url}${asset.url!.includes("?") ? "&" : "?"}retry=${attempt}`;

  return (
    <div className="gallery-item">
      <img src={src} alt={asset.headline} loading="lazy" width={asset.width} height={asset.height} onError={handleError} />
      <div className="gallery-item-label">
        <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
          <span className="pill" data-tone="neutral">
            {asset.size}
          </span>
          <span className="pill" data-tone="neutral">
            {asset.format}
          </span>
        </div>
        <div style={{ color: "var(--fg)", fontWeight: 600 }}>{asset.headline}</div>
        <div>{asset.cta}</div>
        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          provider: {asset.provider} <Provenance kind="measured" />
          <ModeStamp mode={asset.status === "ok" ? "live" : "rate_limited"} label="image" />
        </div>
        <a href={asset.url!} download style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, color: "var(--fg)" }}>
          <Icon name="download" size={13} /> download
        </a>
      </div>
    </div>
  );
}

export default function CreativeStudio() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [runsErr, setRunsErr] = useState<unknown>(null);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [assetsErr, setAssetsErr] = useState<unknown>(null);
  const [latestRun, setLatestRun] = useState<RunRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRuns()
      .then(setRuns)
      .catch((e) => setRunsErr(e));
  }, []);

  useEffect(() => {
    if (!runs) return;
    if (runs.length === 0) {
      setLoading(false);
      return;
    }
    const newest = [...runs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    setLatestRun(newest);
    getPipelineState(newest.run_id)
      .then((ps) => {
        const lastDraft = ps.content_drafts[ps.content_drafts.length - 1];
        setAssets(lastDraft?.assets ?? []);
      })
      .catch((e) => setAssetsErr(e))
      .finally(() => setLoading(false));
  }, [runs]);

  return (
    <div className="page">
      <h1 className="hero">Creative Studio</h1>
      <p className="page-sub">Asset pack generated for the most recent pipeline run.</p>

      {Boolean(runsErr) && <ErrorCard route="GET /runs" error={runsErr} />}
      {loading && !runsErr && <p className="muted">Loading…</p>}
      {Boolean(assetsErr) && <ErrorCard route={`GET /pipeline/${latestRun?.run_id}`} error={assetsErr} />}

      {runs && runs.length === 0 && <div className="card">No pipeline runs yet — run a pipeline first.</div>}

      {latestRun && (
        <p className="muted" style={{ marginBottom: 16 }}>
          run_id: {latestRun.run_id} · brand: {latestRun.brand_id}
        </p>
      )}

      {assets && assets.length === 0 && <div className="card">This run has no assets — image generation may not have run, or the draft has no assets attached.</div>}

      {assets && assets.length > 0 && (
        <div className="gallery-grid">
          {assets.map((a, i) =>
            a.status === "failed" || !a.url ? (
              <div key={i} className="gallery-item" style={{ display: "flex", flexDirection: "column" }}>
                <div className="asset-tile-status" style={{ aspectRatio: 1 }}>
                  <Icon name="fail" size={22} />
                  <span className="muted" style={{ fontSize: 11 }}>
                    generation failed
                  </span>
                </div>
                <div className="gallery-item-label">
                  {a.format} · {a.size}
                </div>
              </div>
            ) : (
              <AssetTile key={i} asset={a} />
            )
          )}
        </div>
      )}
    </div>
  );
}
