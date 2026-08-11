// Brand picker -> GET /market/{id}. Wikipedia interest, keyword demand, and competitor intelligence.
import { useEffect, useMemo, useState } from "react";
import { BarChart, LineChart } from "../components/charts";
import { getBrands, getMarket } from "../lib/api";
import type { Brand, MarketBundle, SourceMode } from "../lib/types";
import { asRecord, ErrorCard, ModeStamp, Provenance } from "./shared";

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

const THREAT_COLOR: Record<string, string> = {
  high: "var(--red)",
  medium: "var(--amber)",
  low: "var(--green)",
};

interface CompetitorItem {
  name?: string;
  positioning?: string;
  threat_level?: string;
  instagram_followers?: number;
  [key: string]: unknown;
}

export default function MarketIntel() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsErr, setBrandsErr] = useState<unknown>(null);
  const [brandId, setBrandId] = useState("");
  const [market, setMarket] = useState<MarketBundle | null>(null);
  const [marketErr, setMarketErr] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getBrands()
      .then((b) => {
        setBrands(b);
        if (b.length > 0) setBrandId(b[0].id);
      })
      .catch((e) => setBrandsErr(e));
  }, []);

  useEffect(() => {
    if (!brandId) return;
    setLoading(true);
    setMarket(null);
    setMarketErr(null);
    getMarket(brandId)
      .then(setMarket)
      .catch((e) => setMarketErr(e))
      .finally(() => setLoading(false));
  }, [brandId]);

  const competitors = useMemo(() => {
    if (!market) return { mode: "fallback_seeded" as SourceMode, items: [] as CompetitorItem[] };
    const rec = asRecord(market.competitors);
    if (rec) {
      const mode = (typeof rec.mode === "string" ? rec.mode : "fallback_seeded") as SourceMode;
      const listField = Object.values(rec).find((v) => Array.isArray(v)) as CompetitorItem[] | undefined;
      return { mode, items: listField ?? [] };
    }
    if (Array.isArray(market.competitors)) return { mode: "fallback_seeded" as SourceMode, items: market.competitors as CompetitorItem[] };
    return { mode: "fallback_seeded" as SourceMode, items: [] };
  }, [market]);

  const currentBrand = brands.find((b) => b.id === brandId);

  return (
    <div className="page">
      <h1 className="hero">Market Intel</h1>
      <p className="page-sub">Search interest trends, keyword demand signals, and competitor landscape per brand.</p>

      {Boolean(brandsErr) && <ErrorCard route="GET /brands" error={brandsErr} />}

      <div className="chip-row" style={{ marginBottom: 16 }}>
        {brands.map((b) => (
          <button key={b.id} className={brandId === b.id ? "chip selected" : "chip"} onClick={() => setBrandId(b.id)}>
            {b.name}
          </button>
        ))}
      </div>

      {loading && <p className="muted">Loading…</p>}
      {Boolean(marketErr) && <ErrorCard route={`GET /market/${brandId}`} error={marketErr} />}

      {market && (
        <>
          {/* Brand context strip */}
          {currentBrand && (
            <div
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                padding: "var(--space-3) var(--space-4)",
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                gap: "var(--space-4)",
                flexWrap: "wrap",
              }}
            >
              <strong style={{ fontSize: "var(--text-lg)" }}>{currentBrand.name}</strong>
              <span className="pill" data-tone="neutral">{currentBrand.category.replace(/_/g, " ")}</span>
              <span style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", flex: 1 }}>{currentBrand.positioning}</span>
            </div>
          )}

          {/* Search interest */}
          <div className="panel-header">
            <h2>Search Interest</h2>
            <ModeStamp mode={market.interest.mode} label={`Wikipedia Pageviews — ${market.interest.article}`} />
          </div>
          <LineChart
            series={market.interest.series.map((s) => ({ date: s.date, value: s.views }))}
            hue="var(--neel)"
            label="pageviews"
          />
          <p className="muted" style={{ marginTop: 6 }}>
            <Provenance kind={market.interest.mode === "seeded" ? "seeded" : "measured"} /> daily pageview counts
          </p>

          {/* Keyword demand */}
          <div className="panel-header" style={{ marginTop: 20 }}>
            <h2>Keyword Demand</h2>
            <ModeStamp mode={market.keywords.mode} label={`Google Suggest (IN) — "${market.keywords.seed}"`} />
          </div>
          {market.keywords.keywords.length === 0 ? (
            <div className="chart-empty">no keyword suggestions</div>
          ) : (
            <>
              <div
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-md)",
                  padding: "var(--space-4)",
                  marginBottom: 12,
                }}
              >
                {market.keywords.keywords.map((k, i) => {
                  const maxRank = market.keywords.keywords.length;
                  const strength = ((maxRank - k.rank + 1) / maxRank) * 100;
                  return (
                    <div key={i} style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "var(--neel)",
                          color: "#fff",
                          fontSize: 10,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {k.rank}
                      </div>
                      <div style={{ flex: 1, height: 20, borderRadius: 4, background: "var(--rule)", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${strength}%`,
                            height: "100%",
                            background: "linear-gradient(90deg, var(--neel)88, var(--neel))",
                            borderRadius: 4,
                            transition: "width 0.5s",
                          }}
                        />
                      </div>
                      <div style={{ flex: 2, fontSize: "var(--text-xs)", fontWeight: 500, paddingLeft: 8 }}>{k.keyword}</div>
                    </div>
                  );
                })}
              </div>
              <p className="muted" style={{ marginTop: 6 }}>
                <Provenance kind={market.keywords.mode === "seeded" ? "seeded" : "measured"} /> Google Suggest autocomplete ranking
              </p>
            </>
          )}

          {/* Competitor landscape */}
          <div className="panel-header" style={{ marginTop: 20 }}>
            <h2>Competitor Landscape</h2>
            <ModeStamp mode={competitors.mode} label="Competitor scan" />
          </div>
          {competitors.items.length === 0 ? (
            <div className="chart-empty">no competitor data</div>
          ) : (
            <>
              {competitors.items.some((c) => typeof c.instagram_followers === "number") && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <BarChart
                      bars={competitors.items
                        .filter((c) => typeof c.instagram_followers === "number")
                        .map((c) => ({ label: String(c.name ?? ""), value: c.instagram_followers as number }))}
                      hue="#c13584"
                    />
                  </div>
                  <p className="muted" style={{ marginBottom: 16, fontSize: "var(--text-xs)" }}>
                    📱 Instagram followers — competitor comparison
                  </p>
                </>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: "var(--space-3)",
                  marginBottom: 24,
                }}
              >
                {competitors.items.map((item, i) => {
                  if (typeof item !== "object" || !item.name) {
                    return (
                      <div key={i} className="card" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                        {JSON.stringify(item)}
                      </div>
                    );
                  }
                  const threat = item.threat_level ?? "medium";
                  const threatColor = THREAT_COLOR[String(threat)] ?? "var(--text-muted)";
                  return (
                    <div
                      key={i}
                      style={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--r-md)",
                        padding: "var(--space-4)",
                        boxShadow: "var(--shadow-sm)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "var(--space-2)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <strong style={{ fontSize: "var(--text-sm)" }}>{item.name}</strong>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 10,
                            background: `${threatColor}22`,
                            color: threatColor,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            flexShrink: 0,
                          }}
                        >
                          {String(threat)} threat
                        </span>
                      </div>
                      {item.positioning && (
                        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.5 }}>
                          {item.positioning}
                        </p>
                      )}
                      {typeof item.instagram_followers === "number" && (
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                          <span>📱</span>
                          <strong style={{ color: "#c13584", fontVariantNumeric: "tabular-nums" }}>
                            {fmtNum(item.instagram_followers)}
                          </strong>
                          <span>Instagram followers</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
