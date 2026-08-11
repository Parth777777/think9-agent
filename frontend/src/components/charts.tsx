// Hand-written SVG charts — no chart library installed, none added.
// Every chart takes an explicit `hue` prop (defaults to a data token) so the
// color always encodes what the token means (source/status/series), never
// decoration. All are responsive via viewBox and degrade gracefully empty.
import { useId, useState } from "react";

const DEFAULT_HUE = "var(--neel)";

const SOURCE_HUE: Record<string, string> = {
  news_rss: "var(--neel)",
  reddit: "var(--haldi)",
  youtube: "var(--kohl)",
  instagram: "var(--haldi)",
  seed: "var(--muted)",
};

function hueFor(source: string): string {
  return SOURCE_HUE[source] ?? "var(--muted)";
}

/* ---------------------------------- Sparkline ---------------------------------- */

export function Sparkline({
  data,
  hue = DEFAULT_HUE,
  width = 120,
  height = 32,
}: {
  data: number[];
  hue?: string;
  width?: number;
  height?: number;
}) {
  if (data.length === 0) {
    return <div className="chart-empty" style={{ height }}>no data</div>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 3;
  const points = data.map((v, i) => {
    const x = data.length === 1 ? width / 2 : (i / (data.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  });
  const summary = `Sparkline: ${data.length} points, from ${data[0]} to ${data[data.length - 1]}, range ${min}-${max}.`;
  return (
    <div className="chart-container" style={{ width, maxWidth: width }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary}>
        <title>{summary}</title>
        {data.length === 1 ? (
          <circle cx={points[0].split(",")[0]} cy={points[0].split(",")[1]} r={2} fill={hue} />
        ) : (
          <polyline points={points.join(" ")} fill="none" stroke={hue} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </div>
  );
}

/* ---------------------------------- LineChart ---------------------------------- */

export function LineChart({
  series,
  hue = DEFAULT_HUE,
  label = "series",
  width = 480,
  height = 200,
}: {
  series: { date: string; value: number }[];
  hue?: string;
  label?: string;
  width?: number;
  height?: number;
}) {
  const gid = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (series.length === 0) {
    return <div className="chart-empty">no data for {label}</div>;
  }

  const padL = 44;
  const padB = 24;
  const padT = 12;
  const padR = 12;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const values = series.map((d) => d.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;

  const xAt = (i: number) => (series.length === 1 ? padL + innerW / 2 : padL + (i / (series.length - 1)) * innerW);
  const yAt = (v: number) => padT + innerH - ((v - min) / span) * innerH;

  const points = series.map((d, i) => ({ x: xAt(i), y: yAt(d.value), ...d }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  const gridLines = 4;
  const gridY = Array.from({ length: gridLines + 1 }, (_, i) => padT + (innerH * i) / gridLines);

  // Show first/mid/last date labels only — avoid crowding with 90 points.
  const tickIdxs =
    series.length <= 6
      ? series.map((_, i) => i)
      : [0, Math.floor((series.length - 1) / 2), series.length - 1];

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;
  const summary = `Line chart for ${label}: ${series.length} points from ${series[0].date} to ${series[series.length - 1].date}, values ${min} to ${max}.`;

  return (
    <div className="chart-container">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={summary}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <title>{summary}</title>
        {gridY.map((y, i) => (
          <line key={i} x1={padL} x2={width - padR} y1={y} y2={y} stroke="var(--rule)" strokeWidth={1} />
        ))}
        {series.length > 1 ? (
          <path d={pathD} fill="none" stroke={hue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <circle cx={points[0].x} cy={points[0].y} r={3} fill={hue} />
        )}
        {tickIdxs.map((i) => (
          <text
            key={`t-${gid}-${i}`}
            x={points[i].x}
            y={height - 6}
            fontSize={10}
            fill="var(--muted)"
            textAnchor="middle"
          >
            {series[i].date}
          </text>
        ))}
        {points.map((p, i) => (
          <circle
            key={`h-${gid}-${i}`}
            cx={p.x}
            cy={p.y}
            r={hoverIdx === i ? 4 : 8}
            fill={hoverIdx === i ? hue : "transparent"}
            stroke="none"
            onMouseEnter={() => setHoverIdx(i)}
          />
        ))}
        {hovered && (
          <g transform={`translate(${Math.min(Math.max(hovered.x - 45, 0), width - 90)}, ${Math.max(hovered.y - 34, 2)})`}>
            <rect width={90} height={26} rx={4} fill="var(--ink)" opacity={0.92} />
            <text x={8} y={11} fontSize={9} fill="var(--paper)" fontFamily="var(--font-mono)">
              {hovered.date}
            </text>
            <text x={8} y={21} fontSize={10} fill="var(--paper)" fontFamily="var(--font-mono)">
              {hovered.value}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/* ---------------------------------- BarChart ---------------------------------- */

export function BarChart({
  bars,
  hue = DEFAULT_HUE,
  width = 480,
}: {
  bars: { label: string; value: number }[];
  hue?: string;
  width?: number;
}) {
  if (bars.length === 0) {
    return <div className="chart-empty">no data</div>;
  }

  const rowH = 28;
  const padL = 100;
  const padR = 56;
  const padY = 6;
  const height = bars.length * rowH + padY * 2;
  const innerW = width - padL - padR;
  const max = Math.max(...bars.map((b) => b.value), 1);
  const summary = `Bar chart: ${bars.map((b) => `${b.label} ${b.value}`).join(", ")}.`;

  return (
    <div className="chart-container">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary}>
        <title>{summary}</title>
        {bars.map((b, i) => {
          const y = padY + i * rowH;
          const barW = Math.max((b.value / max) * innerW, b.value === 0 ? 0 : 2);
          return (
            <g key={b.label}>
              <text x={padL - 8} y={y + rowH / 2 + 4} fontSize={11} textAnchor="end" fill="var(--fg)">
                {b.label}
              </text>
              <rect x={padL} y={y + 5} width={innerW} height={rowH - 10} rx={2} fill="var(--rule)" opacity={0.35} />
              <rect x={padL} y={y + 5} width={barW} height={rowH - 10} rx={2} fill={hue} />
              <text
                x={padL + barW + 6}
                y={y + rowH / 2 + 4}
                fontSize={11}
                fontFamily="var(--font-mono)"
                fill="var(--fg)"
              >
                {b.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------------------------------- SignalLedger ---------------------------------- */

export type SignalMark = { ts: string; source: string; url?: string; label?: string };

const SOURCE_LEGEND: [string, string][] = [
  ["news_rss", "news"],
  ["reddit", "reddit"],
  ["youtube", "youtube"],
  ["instagram", "instagram"],
  ["seed", "seed"],
];

export function SignalLedger({ marks, width = 720 }: { marks: SignalMark[]; width?: number }) {
  const height = 84;

  if (marks.length === 0) {
    return (
      <div className="signal-ledger">
        <div className="chart-empty">no signals yet</div>
      </div>
    );
  }

  const padL = 12;
  const padR = 12;
  const padT = 14;
  const laneY = height / 2;
  const innerW = width - padL - padR;

  const parsed = marks
    .map((m) => ({ ...m, t: Date.parse(m.ts) }))
    .filter((m) => !Number.isNaN(m.t))
    .sort((a, b) => a.t - b.t);

  if (parsed.length === 0) {
    return (
      <div className="signal-ledger">
        <div className="chart-empty">no signals yet</div>
      </div>
    );
  }

  const minT = parsed[0].t;
  const maxT = parsed[parsed.length - 1].t;
  const spanT = maxT - minT || 1;

  const xAt = (t: number) => (parsed.length === 1 ? padL + innerW / 2 : padL + ((t - minT) / spanT) * innerW);

  // Jitter overlapping marks vertically so density near-equal timestamps is visible.
  const bucketed = new Map<number, number>();
  const positioned = parsed.map((m) => {
    const bucket = Math.round(xAt(m.t) / 4);
    const count = bucketed.get(bucket) ?? 0;
    bucketed.set(bucket, count + 1);
    const jitter = ((count % 5) - 2) * 6;
    return { ...m, x: xAt(m.t), y: laneY + jitter };
  });

  const summary = `Signal ledger: ${parsed.length} signals from ${new Date(minT).toISOString()} to ${new Date(maxT).toISOString()}.`;

  return (
    <div className="signal-ledger">
      <div className="chart-container">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary}>
          <title>{summary}</title>
          <line x1={padL} x2={width - padR} y1={laneY} y2={laneY} stroke="var(--rule)" strokeWidth={1} />
          <text x={padL} y={padT} fontSize={9} fill="var(--muted)">
            {new Date(minT).toLocaleDateString()}
          </text>
          <text x={width - padR} y={padT} fontSize={9} fill="var(--muted)" textAnchor="end">
            {new Date(maxT).toLocaleDateString()}
          </text>
          {positioned.map((m, i) => {
            const color = hueFor(m.source);
            const circle = (
              <circle
                key={i}
                className="signal-mark"
                cx={m.x}
                cy={m.y}
                r={4}
                fill={color}
                stroke="var(--surface)"
                strokeWidth={1}
                onClick={m.url ? () => window.open(m.url, "_blank", "noopener,noreferrer") : undefined}
              >
                <title>
                  {`${m.source} · ${m.ts}${m.label ? ` · ${m.label}` : ""}`}
                </title>
              </circle>
            );
            return circle;
          })}
        </svg>
      </div>
      <div className="signal-legend">
        {SOURCE_LEGEND.map(([key, name]) => (
          <span className="signal-legend-item" key={key}>
            <span className="signal-legend-swatch" style={{ background: hueFor(key) }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
