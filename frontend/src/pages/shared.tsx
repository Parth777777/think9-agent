// Small shared bits for the P0 pages — provenance badge, honest fetch-failure
// card, and a mode stamp. Kept here (not lib/) since this file is UI, not a
// typed client, and pages/ is the only dir this build owns.
import Icon, { type IconName } from "../components/icons";
import type { Provenance as ProvenanceKind, SourceMode } from "../lib/types";

export function Provenance({ kind }: { kind: ProvenanceKind }) {
  return (
    <span className="provenance" data-kind={kind}>
      {kind}
    </span>
  );
}

// Every page's fetch failure lands here instead of a blank screen or fake data.
// A 404 (route not shipped yet) gets a distinct, honest message from any other error.
export function ErrorCard({ route, error }: { route: string; error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  const notFound = /-> 404/.test(msg);
  return (
    <div className="card">
      <p className="muted">{notFound ? `Route not available yet: ${route}` : `Failed to load ${route}`}</p>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {msg}
      </p>
    </div>
  );
}

const MODE_ICON: Record<SourceMode, IconName> = {
  live: "live",
  degraded: "degraded",
  fallback_seeded: "degraded",
  rate_limited: "rateLimited",
};

export function ModeStamp({ mode, label }: { mode: SourceMode; label: string }) {
  return (
    <span className="source-stamp" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <Icon name={MODE_ICON[mode] ?? "degraded"} size={12} />
      {label} — {mode}
    </span>
  );
}

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
