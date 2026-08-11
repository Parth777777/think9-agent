// Small status-pill primitive — dot + label, rounded-full. Used for run status,
// per-node agent state, and compliance issues. One shared component so the
// "status" visual language stays identical everywhere it appears.
// Styling lives in index.css (.pill / [data-tone]) on top of the token system —
// no hardcoded hexes here so it can't drift from the palette.
export type PillTone = "neutral" | "active" | "done" | "flagged";

export default function Pill({ tone, label }: { tone: PillTone; label: string }) {
  return (
    <span className="pill" data-tone={tone}>
      <span className="pill-dot" />
      {label}
    </span>
  );
}
