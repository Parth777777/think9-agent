// Social Pulse — Reddit Buzz tab + Instagram Reels analytics tab.
// Category picker → GET /social/{category} which returns both reddit + instagram fields.
//
// NOTE: The `instagram` field in the API response is seeded MOCK DATA (see backend routes.py →
// INSTAGRAM_MOCK_DATA). All follower counts, engagement rates, and reel stats are illustrative
// demo values for the content-strategist demo video. Real values come from the Instagram
// Graph API once brand tokens are provisioned.
import { useEffect, useId, useMemo, useState } from "react";
import Icon from "../components/icons";
import { BarChart, LineChart, Sparkline } from "../components/charts";
import { getBrands, getSocial } from "../lib/api";
import type { Brand, SocialBuzz } from "../lib/types";
import FilterBar, { loadFilters, type FeedFilters } from "./FilterBar";
import { ErrorCard, ModeStamp, Provenance } from "./shared";

// ---- Types for Instagram mock data injected by backend ----
interface ReelPost {
  caption: string;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  thumbnail_url: string;
}

interface InstaBrand {
  brand_id: string;
  brand_name: string;
  followers: number;
  growth_rate: string;
  avg_reels_views: number;
  avg_reels_likes: number;
  avg_reels_shares: number;
  engagement_rate: string;
  follower_growth_history: { date: string; value: number }[];
  top_reels: ReelPost[];
}

type SocialBuzzWithInsta = SocialBuzz & { instagram?: InstaBrand[] };

// ---- Helpers ----
function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

// Vivid per-brand palette (cycles if more than 6 brands)
const BRAND_HUES = [
  "#7b95e8", // neel
  "#f0be4a", // haldi
  "#7fb05c", // mehendi
  "#e8746a", // sindoor
  "#a78bfa", // violet
  "#38bdf8", // sky
];

// ── Mock Data Banner ─────────────────────────────────────────────────────────
// Clearly signals to stakeholders during the demo that Instagram figures are
// seeded from INSTAGRAM_MOCK_DATA in routes.py, not from the Graph API.
function MockDataBanner() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 14px",
        borderRadius: "var(--r-sm)",
        background: "linear-gradient(90deg, #833ab422 0%, #c1358422 50%, #f7773722 100%)",
        border: "1px solid #c1358440",
        fontSize: "var(--text-xs)",
        color: "var(--fg)",
        marginBottom: 20,
        fontWeight: 500,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: "#c13584", letterSpacing: "0.04em" }}>DEMO</span>
      <span>
        <strong style={{ color: "#c13584" }}>Demo mode</strong> — Instagram metrics below are{" "}
        <strong>seeded mock data</strong> (see{" "}
        <code
          style={{
            fontSize: 10,
            background: "rgba(0,0,0,0.08)",
            padding: "1px 4px",
            borderRadius: 3,
          }}
        >
          routes.py → INSTAGRAM_MOCK_DATA
        </code>
        ). In production these values come from the Instagram Graph API per brand.
      </span>
    </div>
  );
}

// ── Multi-series follower growth line chart ───────────────────────────────────
// Each brand gets a colour-coded line on a shared Y-axis with filled area
// gradients and a hover crosshair tooltip showing all brand values together.
function MultiLineChart({
  series,
  width = 760,
  height = 200,
}: {
  series: { label: string; hue: string; data: { date: string; value: number }[] }[];
  width?: number;
  height?: number;
}) {
  const id = useId();
  const [hoverX, setHoverX] = useState<number | null>(null);

  if (!series.length || series.every((s) => s.data.length === 0)) {
    return <div className="chart-empty">no follower data</div>;
  }

  const padL = 52, padR = 16, padT = 14, padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const allVals = series.flatMap((s) => s.data.map((d) => d.value));
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const span = maxV - minV || 1;

  const dates = series[0]?.data.map((d) => d.date) ?? [];
  const n = dates.length;

  const xAt = (i: number) => (n === 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + innerH - ((v - minV) / span) * innerH;

  const gridLines = 4;
  const gridY = Array.from({ length: gridLines + 1 }, (_, i) => padT + (innerH * i) / gridLines);
  const tickIdxs = n <= 6 ? dates.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];

  const hoverCol =
    hoverX !== null ? Math.max(0, Math.min(n - 1, Math.round(((hoverX - padL) / innerW) * (n - 1)))) : null;

  const yLabel = (v: number) => {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
    return String(Math.round(v));
  };

  return (
    <div
      className="chart-container"
      style={{ position: "relative", marginBottom: 8 }}
      onMouseLeave={() => setHoverX(null)}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Multi-brand follower growth chart"
        style={{ display: "block", width: "100%", height: "auto" }}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          setHoverX(((e.clientX - rect.left) / rect.width) * width);
        }}
      >
        {/* Grid */}
        {gridY.map((y, i) => (
          <line key={i} x1={padL} x2={width - padR} y1={y} y2={y} stroke="var(--rule)" strokeWidth={0.8} />
        ))}
        {/* Y-axis labels */}
        {gridY.map((y, i) => (
          <text key={`yl-${i}`} x={padL - 6} y={y + 4} fontSize={9} fill="var(--muted)" textAnchor="end">
            {yLabel(minV + span * (1 - i / gridLines))}
          </text>
        ))}
        {/* Series */}
        {series.map((s) => {
          const pts = s.data.map((d, i) => ({ x: xAt(i), y: yAt(d.value) }));
          const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          const areaD = pathD + ` L${pts[pts.length - 1].x.toFixed(1)},${(padT + innerH).toFixed(1)} L${padL},${(padT + innerH).toFixed(1)} Z`;
          return (
            <g key={s.label}>
              <defs>
                <linearGradient id={`${id}-ag-${s.label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.hue} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={s.hue} stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={areaD} fill={`url(#${id}-ag-${s.label})`} />
              <path d={pathD} fill="none" stroke={s.hue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {pts.length > 0 && (
                <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3.5} fill={s.hue} stroke="var(--card)" strokeWidth={1.5} />
              )}
            </g>
          );
        })}
        {/* Hover crosshair */}
        {hoverCol !== null && (
          <line x1={xAt(hoverCol)} x2={xAt(hoverCol)} y1={padT} y2={padT + innerH} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3,3" />
        )}
        {/* Hover dots */}
        {hoverCol !== null &&
          series.map((s) => {
            const d = s.data[hoverCol];
            return d ? (
              <circle key={`hd-${s.label}`} cx={xAt(hoverCol)} cy={yAt(d.value)} r={4} fill={s.hue} stroke="var(--card)" strokeWidth={2} />
            ) : null;
          })}
        {/* X-axis ticks */}
        {tickIdxs.map((i) => (
          <text key={`t-${id}-${i}`} x={xAt(i)} y={height - 6} fontSize={9} fill="var(--muted)" textAnchor="middle">
            {dates[i]}
          </text>
        ))}
      </svg>
      {/* Hover tooltip */}
      {hoverCol !== null && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--ink)",
            color: "var(--paper)",
            borderRadius: "var(--r-sm)",
            padding: "6px 12px",
            fontSize: 11,
            pointerEvents: "none",
            display: "flex",
            gap: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,0.28)",
            zIndex: 10,
            whiteSpace: "nowrap",
            alignItems: "center",
          }}
        >
          <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
            {dates[hoverCol]}
          </span>
          {series.map((s) => {
            const d = s.data[hoverCol];
            return (
              <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.hue, flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: s.hue }}>
                  {fmtNum(d?.value ?? 0)}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Reusable horizontal bar chart with per-item colour ───────────────────────
function InlineBarChart({
  items,
  valueLabel,
  formatValue,
}: {
  items: { label: string; value: number; hue: string }[];
  valueLabel: string;
  formatValue: (v: number) => string;
}) {
  if (!items.length) return <div className="chart-empty">no data</div>;
  const max = Math.max(...items.map((x) => x.value), 1);
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: "var(--space-4)",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--text-muted)",
          marginBottom: 10,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {valueLabel}
      </div>
      {items.map((item) => {
        const w = (item.value / max) * 100;
        return (
          <div key={item.label} style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <div style={{ width: 130, fontSize: "var(--text-xs)", fontWeight: 600, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--fg)" }}>
              {item.label}
            </div>
            <div style={{ flex: 1, position: "relative", height: 22, borderRadius: 6, background: "var(--rule)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${w}%`,
                  height: "100%",
                  background: `linear-gradient(90deg, ${item.hue}bb, ${item.hue})`,
                  borderRadius: 6,
                  transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)",
                  boxShadow: `0 0 10px ${item.hue}44`,
                }}
              />
            </div>
            <div style={{ width: 56, textAlign: "right", fontSize: "var(--text-sm)", fontWeight: 700, color: item.hue, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              {formatValue(item.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function brandHue(idx: number): string {
  return BRAND_HUES[idx % BRAND_HUES.length];
}

// ── Instagram brand-level overview card ─────────────────────────────────────
function InstaBrandCard({ brand, idx }: { brand: InstaBrand; idx: number }) {
  const hue = brandHue(idx);
  const isPositive = brand.growth_rate.startsWith("+");
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        background: "var(--card)",
        border: `1px solid ${hovered ? hue + "55" : "var(--border)"}`,
        borderRadius: "var(--r-md)",
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        boxShadow: hovered ? `0 4px 24px ${hue}22, var(--shadow-md)` : "var(--shadow-sm)",
        transition: "box-shadow 0.22s, border-color 0.22s",
        cursor: "default",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Brand header */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: hue,
            flexShrink: 0,
            boxShadow: `0 0 6px ${hue}88`,
          }}
        />
        <strong style={{ fontSize: "var(--text-sm)", lineHeight: 1.3 }}>{brand.brand_name}</strong>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
        <div>
          <div style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: hue, fontVariantNumeric: "tabular-nums" }}>
            {fmtNum(brand.followers)}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Followers</div>
        </div>
        <div>
          <div
            style={{
              fontSize: "var(--text-xl)",
              fontWeight: 700,
              color: isPositive ? "var(--green)" : "var(--red)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {brand.growth_rate}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Growth (7d)</div>
        </div>
        <div>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {fmtNum(brand.avg_reels_views)}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Avg Reel views</div>
        </div>
        <div>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: hue, fontVariantNumeric: "tabular-nums" }}>
            {brand.engagement_rate}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Engagement rate</div>
        </div>
      </div>

      {/* Mini follower sparkline */}
      <div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 4 }}>Follower growth (7d)</div>
        <Sparkline data={brand.follower_growth_history.map((d) => d.value)} hue={hue} width={220} height={40} />
      </div>
    </div>
  );
}

// ── Reel thumbnail card ──────────────────────────────────────────────────────
// Renders a portrait-style card with a picsum thumbnail, animated hover lift,
// graceful image-error fallback (brand initial), and dark gradient overlay.
function ReelCard({ reel, brandName, hue }: { reel: ReelPost; brandName: string; hue: string }) {
  const [hovered, setHovered] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  return (
    <div
      style={{
        background: "var(--card)",
        border: `1px solid ${hovered ? hue + "55" : "var(--border)"}`,
        borderRadius: "var(--r-md)",
        overflow: "hidden",
        boxShadow: hovered ? `0 8px 32px ${hue}33, var(--shadow-md)` : "var(--shadow-sm)",
        transform: hovered ? "translateY(-3px) scale(1.01)" : "none",
        transition: "box-shadow 0.22s, transform 0.22s, border-color 0.22s",
        cursor: "default",
        display: "flex",
        flexDirection: "column",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail — fixed height portrait crop */}
      <div style={{ position: "relative", height: 220, overflow: "hidden", background: "var(--rule)", flexShrink: 0 }}>
        {!imgErr ? (
          <img
            src={reel.thumbnail_url}
            alt={reel.caption.slice(0, 60)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              transition: "transform 0.32s",
              transform: hovered ? "scale(1.05)" : "scale(1)",
            }}
            onError={() => setImgErr(true)}
          />
        ) : (
          /* Graceful fallback — shows brand initial with brand-colour background */
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              color: hue,
              fontWeight: 800,
              background: `linear-gradient(135deg, ${hue}22, ${hue}08)`,
            }}
          >
            {brandName[0]}
          </div>
        )}
        {/* Dark gradient overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: hovered
              ? "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)"
              : "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.08) 60%, transparent 100%)",
            transition: "background 0.22s",
          }}
        />
        {/* Play button */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: hue,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: hovered ? 1 : 0.82,
              transform: hovered ? "scale(1.15)" : "scale(1)",
              transition: "opacity 0.22s, transform 0.22s",
              boxShadow: `0 2px 16px ${hue}66`,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="white">
              <polygon points="3,2 11,7 3,12" />
            </svg>
          </div>
        </div>
        {/* Brand badge (top-left) */}
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            background: "rgba(0,0,0,0.72)",
            color: "#fff",
            fontSize: 10,
            padding: "2px 7px",
            borderRadius: 4,
            fontWeight: 700,
            letterSpacing: "0.03em",
          }}
        >
          {brandName}
        </div>
        {/* Views badge (bottom-right) */}
        <div
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            background: "rgba(0,0,0,0.72)",
            color: "#fff",
            fontSize: 11,
            padding: "3px 8px",
            borderRadius: 4,
            fontVariantNumeric: "tabular-nums",
            fontWeight: 700,
          }}
        >
          Play {fmtNum(reel.views)}
        </div>
      </div>

      {/* Caption + stats */}
      <div
        style={{
          padding: "var(--space-3)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          flex: 1,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-xs)",
            color: "var(--fg)",
            lineHeight: 1.5,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {reel.caption}
        </p>
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            fontVariantNumeric: "tabular-nums",
            marginTop: "auto",
          }}
        >
          <span title="Likes">Likes {fmtNum(reel.likes)}</span>
          <span title="Comments">Comments {fmtNum(reel.comments)}</span>
          <span title="Shares">Shares {fmtNum(reel.shares)}</span>
        </div>
      </div>
    </div>
  );
}

// ---- Main component ----
export default function SocialPulse() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsErr, setBrandsErr] = useState<unknown>(null);
  const [category, setCategory] = useState<string>("");
  const [buzz, setBuzz] = useState<SocialBuzzWithInsta | null>(null);
  const [buzzErr, setBuzzErr] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"reddit" | "instagram">("instagram");
  const [filters, setFilters] = useState<FeedFilters>(() => loadFilters());

  useEffect(() => {
    getBrands()
      .then((b) => {
        setBrands(b);
        const first = b[0]?.category;
        if (first) setCategory(first);
      })
      .catch((e) => setBrandsErr(e));
  }, []);

  useEffect(() => {
    if (!category) return;
    setLoading(true);
    setBuzz(null);
    setBuzzErr(null);
    getSocial(category)
      .then((d) => setBuzz(d as SocialBuzzWithInsta))
      .catch((e) => setBuzzErr(e))
      .finally(() => setLoading(false));
  }, [category]);

  const categories = useMemo(() => Array.from(new Set(brands.map((b) => b.category))), [brands]);
  const subredditNames = useMemo(() => buzz?.subreddits.map((s) => s.name) ?? [], [buzz]);
  const instaBrands: InstaBrand[] = useMemo(() => (buzz as SocialBuzzWithInsta)?.instagram ?? [], [buzz]);

  const filteredPosts = useMemo(() => {
    if (!buzz) return [];
    return buzz.top_posts.filter((p) => {
      if (filters.source && p.subreddit !== filters.source) return false;
      if (filters.mode && filters.mode !== buzz.mode) return false;
      return true;
    });
  }, [buzz, filters]);

  const totals = useMemo(() => {
    if (!buzz) return null;
    const posts = buzz.subreddits.reduce((s, r) => s + r.post_count, 0);
    const score = buzz.subreddits.reduce((s, r) => s + r.total_score, 0);
    const comments = buzz.subreddits.reduce((s, r) => s + r.total_comments, 0);
    const avgRatio = buzz.subreddits.length
      ? buzz.subreddits.reduce((s, r) => s + r.avg_upvote_ratio, 0) / buzz.subreddits.length
      : 0;
    return { posts, score, comments, avgRatio };
  }, [buzz]);

  // ── Portfolio-level Instagram aggregates (from INSTAGRAM_MOCK_DATA) ──────────
  const instaPortfolio = useMemo(() => {
    if (!instaBrands.length) return null;
    const totalFollowers = instaBrands.reduce((s, b) => s + b.followers, 0);
    const totalReelViews = instaBrands.reduce((s, b) => s + b.avg_reels_views, 0);
    const avgEngagement =
      instaBrands.reduce((s, b) => s + parseFloat(b.engagement_rate), 0) / instaBrands.length;
    const topGrowing = [...instaBrands].sort(
      (a, b) => parseFloat(b.growth_rate) - parseFloat(a.growth_rate)
    )[0];
    const totalAvgLikes = instaBrands.reduce((s, b) => s + b.avg_reels_likes, 0);
    return { totalFollowers, totalReelViews, avgEngagement, topGrowing, totalAvgLikes };
  }, [instaBrands]);

  // ── Multi-series follower growth (one series per brand) ───────────────────
  const followerSeries = useMemo(
    () =>
      instaBrands.map((b, idx) => ({
        label: b.brand_name,
        hue: brandHue(idx),
        data: b.follower_growth_history,
      })),
    [instaBrands]
  );

  // ── Engagement bar items ────────────────────────────────────────────────
  const engagementItems = useMemo(
    () =>
      instaBrands.map((b, idx) => ({
        label: b.brand_name,
        value: parseFloat(b.engagement_rate),
        hue: brandHue(idx),
      })),
    [instaBrands]
  );

  // ── Reels views items ──────────────────────────────────────────────────
  const reelViewsItems = useMemo(
    () =>
      instaBrands.map((b, idx) => ({
        label: b.brand_name,
        value: b.avg_reels_views,
        hue: brandHue(idx),
      })),
    [instaBrands]
  );

  // ── Likes items ───────────────────────────────────────────────────────
  const likesItems = useMemo(
    () =>
      instaBrands.map((b, idx) => ({
        label: b.brand_name,
        value: b.avg_reels_likes,
        hue: brandHue(idx),
      })),
    [instaBrands]
  );

  // ── Shares items ──────────────────────────────────────────────────────
  const sharesItems = useMemo(
    () =>
      instaBrands.map((b, idx) => ({
        label: b.brand_name,
        value: b.avg_reels_shares,
        hue: brandHue(idx),
      })),
    [instaBrands]
  );

  // ── All reels flattened + sorted by views desc ────────────────────────
  const allReels = useMemo(
    () =>
      instaBrands
        .flatMap((b, idx) =>
          b.top_reels.map((r) => ({ ...r, brandName: b.brand_name, hue: brandHue(idx) }))
        )
        .sort((a, b) => b.views - a.views),
    [instaBrands]
  );

  const categoryLabel = category.replace(/_/g, " ");

  return (
    <div className="page">
      <h1 className="hero">Social Pulse</h1>
      <p className="page-sub">
        Multi-brand social analytics — Reddit community buzz &amp; Instagram Reels engagement across the portfolio.
      </p>

      {Boolean(brandsErr) && <ErrorCard route="GET /brands" error={brandsErr} />}

      {/* Category picker */}
      <div className="chip-row" style={{ marginBottom: 16 }}>
        {categories.map((c) => (
          <button
            key={c}
            className={category === c ? "chip selected" : "chip"}
            onClick={() => setCategory(c)}
          >
            {c.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Tab toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {(["instagram", "reddit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 20px",
              borderRadius: "var(--r-sm)",
              border: tab === t ? "none" : "1px solid var(--border)",
              background: tab === t
                ? t === "instagram"
                  ? "linear-gradient(135deg, #f77737, #c13584, #833ab4)"
                  : "linear-gradient(135deg, var(--haldi), #e05d0a)"
                : "var(--card)",
              color: tab === t ? "#fff" : "var(--fg)",
              fontWeight: 600,
              fontSize: "var(--text-sm)",
              cursor: "pointer",
              boxShadow: tab === t ? "0 2px 12px rgba(0,0,0,0.18)" : "none",
              transition: "all 0.18s",
            }}
          >
            {t === "instagram" ? "Instagram Reels" : "Reddit Buzz"}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", marginBottom: 16 }}>
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>+</span> Loading {categoryLabel}...
        </div>
      )}
      {Boolean(buzzErr) && <ErrorCard route={`GET /social/${category}`} error={buzzErr} />}

      {/* ═══════════════════ INSTAGRAM REELS TAB ════════════════════════════ */}
      {tab === "instagram" && !loading && (
        <>
          {/* Mock data transparency banner — always visible on Instagram tab */}
          <MockDataBanner />

          {instaBrands.length === 0 && (
            <div className="chart-empty">
              {buzz
                ? "No Instagram Reels data available for this category."
                : "Select a category above to load analytics."}
            </div>
          )}

          {instaBrands.length > 0 && instaPortfolio && (
            <>
              {/* ── Portfolio KPI bar ──────────────────────────────────────── */}
              <div className="panel-header">
                <h2>
                  Portfolio Instagram Overview —{" "}
                  <span style={{ textTransform: "capitalize" }}>{categoryLabel}</span>
                </h2>
                <span className="source-stamp">instagram · mock analytics · {instaBrands.length} brand{instaBrands.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="stat-row" style={{ marginBottom: 28 }}>
                <div className="stat-tile">
                  <div className="stat-value tabular">{fmtNum(instaPortfolio.totalFollowers)}</div>
                  <div className="stat-label">Combined Followers</div>
                  <Provenance kind="seeded" />
                </div>
                <div className="stat-tile">
                  <div className="stat-value tabular">{fmtNum(instaPortfolio.totalReelViews)}</div>
                  <div className="stat-label">Total Avg Reel Views</div>
                  <Provenance kind="seeded" />
                </div>
                <div className="stat-tile">
                  <div className="stat-value tabular">{instaPortfolio.avgEngagement.toFixed(1)}%</div>
                  <div className="stat-label">Portfolio Avg Engagement</div>
                  <Provenance kind="computed" />
                </div>
                <div className="stat-tile">
                  <div className="stat-value tabular">{fmtNum(instaPortfolio.totalAvgLikes)}</div>
                  <div className="stat-label">Total Avg Likes / Reel</div>
                  <Provenance kind="seeded" />
                </div>
                <div className="stat-tile">
                  <div className="stat-value" style={{ color: "var(--green)", fontSize: "var(--text-lg)" }}>
                    {instaPortfolio.topGrowing.brand_name}
                  </div>
                  <div className="stat-label">Fastest Growing Brand</div>
                  <Provenance kind="computed" />
                </div>
              </div>

              {/* ── Per-brand overview cards ───────────────────────────────── */}
              <div className="panel-header">
                <h2>Brand-Level Metrics</h2>
                <span className="source-stamp">instagram · {instaBrands.length} brand{instaBrands.length !== 1 ? "s" : ""} · mock data</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: "var(--space-3)",
                  marginBottom: 32,
                }}
              >
                {instaBrands.map((b, idx) => (
                  <InstaBrandCard key={b.brand_id} brand={b} idx={idx} />
                ))}
              </div>

              {/* ── Follower Growth — proper multi-series line chart ───────── */}
              <div className="panel-header" style={{ marginTop: 8 }}>
                <h2>Follower Growth — 7-day Trend</h2>
                <span className="source-stamp">instagram · daily snapshots · mock data</span>
              </div>
              {/* Series legend */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginBottom: 12, alignItems: "center" }}>
                {followerSeries.map((s) => (
                  <span
                    key={s.label}
                    style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--text-xs)", color: "var(--fg)", fontWeight: 500 }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.hue, flexShrink: 0, boxShadow: `0 0 5px ${s.hue}99` }} />
                    {s.label}
                  </span>
                ))}
              </div>
              {/* MultiLineChart: all brands on a shared SVG Y-axis, no overlay hack */}
              <MultiLineChart series={followerSeries} width={760} height={200} />

              {/* ── Engagement Rate Comparison ─────────────────────────────── */}
              <div className="panel-header" style={{ marginTop: 24 }}>
                <h2>Engagement Rate Comparison</h2>
                <span className="source-stamp">instagram · (likes + comments + shares) / followers · mock data</span>
              </div>
              <InlineBarChart
                items={engagementItems}
                valueLabel="Engagement rate (%)"
                formatValue={(v) => `${v.toFixed(1)}%`}
              />

              {/* ── Average Reels Views per Brand ─────────────────────────── */}
              <div className="panel-header" style={{ marginTop: 24 }}>
                <h2>Average Reels Views per Brand</h2>
                <span className="source-stamp">instagram · avg views across posted reels · mock data</span>
              </div>
              <InlineBarChart items={reelViewsItems} valueLabel="Avg Reel Views" formatValue={fmtNum} />

              {/* ── Likes & Shares side-by-side ───────────────────────────── */}
              <div className="panel-header" style={{ marginTop: 24 }}>
                <h2>Likes &amp; Shares per Reel</h2>
                <span className="source-stamp">instagram · avg per reel · mock data</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginBottom: 32 }}>
                <InlineBarChart items={likesItems} valueLabel="Avg Likes / Reel" formatValue={fmtNum} />
                <InlineBarChart items={sharesItems} valueLabel="Avg Shares / Reel" formatValue={fmtNum} />
              </div>

              {/* ── Top Reels Grid ─────────────────────────────────────────── */}
              <div className="panel-header" style={{ marginTop: 8 }}>
                <h2>Top Performing Reels — {categoryLabel}</h2>
                <span className="source-stamp">instagram · sorted by views · mock thumbnails via picsum.photos</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
                  gap: "var(--space-3)",
                  marginBottom: 32,
                }}
              >
                {allReels.map((r, i) => (
                  <ReelCard key={i} reel={r} brandName={r.brandName} hue={r.hue} />
                ))}
              </div>

              {/* ── Reel Performance Table ─────────────────────────────────── */}
              <div className="panel-header" style={{ marginTop: 8 }}>
                <h2>Reel Performance Breakdown</h2>
                <span className="source-stamp">instagram · per reel · mock data</span>
              </div>
              <div className="table-container" style={{ marginBottom: 40 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Brand</th>
                      <th>Caption</th>
                      <th className="num">Views</th>
                      <th className="num">Likes</th>
                      <th className="num">Shares</th>
                      <th className="num">Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allReels.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 700, color: r.hue, whiteSpace: "nowrap" }}>{r.brandName}</td>
                        <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--text-xs)" }}>
                          {r.caption}
                        </td>
                        <td className="num tabular">{fmtNum(r.views)}</td>
                        <td className="num tabular">{fmtNum(r.likes)}</td>
                        <td className="num tabular">{fmtNum(r.shares)}</td>
                        <td className="num tabular">{fmtNum(r.comments)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ===================== REDDIT TAB ===================== */}
      {tab === "reddit" && buzz && totals && (
        <>
          <FilterBar sources={subredditNames} value={filters} onChange={setFilters} />

          <div className="panel-header">
            <h2>Reddit Overview — <span style={{ textTransform: "capitalize" }}>{categoryLabel}</span></h2>
            <ModeStamp mode={buzz.mode} label={`reddit /r/${subredditNames.join(", /r/") || "—"}`} />
          </div>
          <div className="stat-row" style={{ marginBottom: 24 }}>
            <div className="stat-tile">
              <div className="stat-value tabular">{totals.posts}</div>
              <div className="stat-label">Total posts</div>
              <Provenance kind="measured" />
            </div>
            <div className="stat-tile">
              <div className="stat-value tabular">{totals.score}</div>
              <div className="stat-label">Total score</div>
              <Provenance kind="measured" />
            </div>
            <div className="stat-tile">
              <div className="stat-value tabular">{totals.comments}</div>
              <div className="stat-label">Total comments</div>
              <Provenance kind="measured" />
            </div>
            <div className="stat-tile">
              <div className="stat-value tabular">{(totals.avgRatio * 100).toFixed(0)}%</div>
              <div className="stat-label">Avg upvote ratio</div>
              <Provenance kind="measured" />
            </div>
          </div>

          <div className="panel-header">
            <h2>Posting volume</h2>
            <ModeStamp mode={buzz.mode} label="reddit — daily posts" />
          </div>
          <LineChart
            series={buzz.daily.map((d) => ({ date: d.date, value: d.posts }))}
            hue="var(--haldi)"
            label="posts/day"
          />

          <div className="panel-header" style={{ marginTop: 20 }}>
            <h2>Engagement (score)</h2>
            <ModeStamp mode={buzz.mode} label="reddit — daily score" />
          </div>
          {buzz.daily.length > 0 ? (
            <Sparkline data={buzz.daily.map((d) => d.score)} hue="var(--neel)" width={480} height={60} />
          ) : (
            <div className="chart-empty">no data</div>
          )}

          <div className="panel-header" style={{ marginTop: 20 }}>
            <h2>Subreddit comparison</h2>
            <ModeStamp mode={buzz.mode} label="reddit — total score by subreddit" />
          </div>
          <BarChart
            bars={buzz.subreddits.map((s) => ({ label: s.name, value: s.total_score }))}
            hue="var(--haldi)"
          />

          {/* Comments-per-subreddit bar */}
          <div className="panel-header" style={{ marginTop: 20 }}>
            <h2>Comment volume per subreddit</h2>
            <ModeStamp mode={buzz.mode} label="reddit — total comments" />
          </div>
          <BarChart
            bars={buzz.subreddits.map((s) => ({ label: s.name, value: s.total_comments }))}
            hue="var(--neel)"
          />

          {/* Post-count bar */}
          <div className="panel-header" style={{ marginTop: 20 }}>
            <h2>Post count per subreddit</h2>
            <ModeStamp mode={buzz.mode} label="reddit — post volume" />
          </div>
          <BarChart
            bars={buzz.subreddits.map((s) => ({ label: s.name, value: s.post_count }))}
            hue="var(--kohl)"
          />

          <div className="panel-header" style={{ marginTop: 20 }}>
            <h2>Top posts</h2>
            <ModeStamp mode={buzz.mode} label="reddit — top posts" />
          </div>
          {filteredPosts.length === 0 ? (
            <div className="chart-empty">no posts match the current filters</div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Subreddit</th>
                    <th className="num">Score</th>
                    <th className="num">Comments</th>
                    <th className="num">Upvote ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.map((p, i) => (
                    <tr key={i}>
                      <td>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--fg)" }}
                        >
                          {p.title}
                          <Icon name="externalLink" size={13} />
                        </a>
                      </td>
                      <td>{p.subreddit}</td>
                      <td className="num tabular">{p.score}</td>
                      <td className="num tabular">{p.num_comments}</td>
                      <td className="num tabular">{(p.upvote_ratio * 100).toFixed(0)}%</td>
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
