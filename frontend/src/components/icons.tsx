// Hand-drawn inline-SVG icon set. 20x20 viewBox, 1.5px stroke, currentColor —
// icons inherit whatever data hue (or ink) their containing element sets.
// No icon library, no emoji: this is the full available set, keep additions
// on the same 20px grid so they optically match.
import type { ReactNode } from "react";

export type IconName =
  | "portfolio"
  | "social"
  | "market"
  | "pipeline"
  | "creative"
  | "meter"
  | "workspace"
  | "chat"
  | "live"
  | "degraded"
  | "rateLimited"
  | "pass"
  | "fail"
  | "reddit"
  | "news"
  | "search"
  | "wikipedia"
  | "run"
  | "approve"
  | "reject"
  | "filter"
  | "externalLink"
  | "download"
  | "chevronRight"
  | "chevronDown"
  | "close";

const PATHS: Record<IconName, ReactNode> = {
  portfolio: (
    <>
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <path d="M3 8h14" />
      <path d="M7 4v-.5A1.5 1.5 0 0 1 8.5 2h3A1.5 1.5 0 0 1 13 3.5V4" />
    </>
  ),
  social: (
    <>
      <circle cx="7" cy="6.5" r="2.5" />
      <path d="M2.5 16c0-2.8 2-4.5 4.5-4.5s4.5 1.7 4.5 4.5" />
      <circle cx="14.5" cy="7.5" r="2" />
      <path d="M12.5 11.5c1.9-.3 4 .9 5 2.8" />
    </>
  ),
  market: (
    <>
      <path d="M3 16V9" />
      <path d="M8.5 16V4" />
      <path d="M14 16v-7" />
      <path d="M2.5 16.5h15" />
    </>
  ),
  pipeline: (
    <>
      <circle cx="4" cy="5" r="2" />
      <circle cx="4" cy="15" r="2" />
      <circle cx="16" cy="10" r="2" />
      <path d="M6 5h4a3 3 0 0 1 3 3v0" />
      <path d="M6 15h4a3 3 0 0 0 3-3v0" />
    </>
  ),
  creative: (
    <>
      <path d="M10 2.5 12.2 7l5 .7-3.6 3.5.9 5-4.5-2.3-4.5 2.3.9-5-3.6-3.5 5-.7z" />
    </>
  ),
  meter: (
    <>
      <path d="M3 15a7 7 0 0 1 14 0" />
      <path d="M10 15 13.5 9" />
      <path d="M3 15h14" />
    </>
  ),
  workspace: (
    <>
      <path d="M2.5 6.5A1.5 1.5 0 0 1 4 5h3l1.5 2H16a1.5 1.5 0 0 1 1.5 1.5V14a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 14z" />
    </>
  ),
  chat: (
    <>
      <path d="M3 4.5h14A1.5 1.5 0 0 1 18.5 6v6A1.5 1.5 0 0 1 17 13.5H8l-3.5 3V13.5H3A1.5 1.5 0 0 1 1.5 12V6A1.5 1.5 0 0 1 3 4.5z" />
    </>
  ),
  live: (
    <>
      <circle cx="10" cy="10" r="3" />
      <path d="M5.5 5.5a6.5 6.5 0 0 0 0 9" />
      <path d="M14.5 5.5a6.5 6.5 0 0 1 0 9" />
    </>
  ),
  degraded: (
    <>
      <path d="M10 3 17.5 16h-15z" />
      <path d="M10 8v3.5" />
      <circle cx="10" cy="14" r="0.25" />
    </>
  ),
  rateLimited: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l3 2" />
    </>
  ),
  pass: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M6.5 10.2 8.7 12.5 13.5 7.5" />
    </>
  ),
  fail: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M7.3 7.3 12.7 12.7" />
      <path d="M12.7 7.3 7.3 12.7" />
    </>
  ),
  reddit: (
    <>
      <circle cx="10" cy="11.5" r="6" />
      <circle cx="7.3" cy="11.7" r="1" />
      <circle cx="12.7" cy="11.7" r="1" />
      <path d="M7.5 14.2c.7.6 1.6.9 2.5.9s1.8-.3 2.5-.9" />
      <path d="M13 6 14.7 4.3 16.3 5" />
      <circle cx="10" cy="6" r="0.6" />
    </>
  ),
  news: (
    <>
      <rect x="3" y="4.5" width="11" height="11" rx="1" />
      <path d="M14 8h2.5A0.5 0.5 0 0 1 17 8.5V14a1.5 1.5 0 0 1-1.5 1.5" />
      <path d="M5.5 7.5h6" />
      <path d="M5.5 10h6" />
      <path d="M5.5 12.5h4" />
    </>
  ),
  search: (
    <>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="M12.3 12.3 17 17" />
    </>
  ),
  wikipedia: (
    <>
      <path d="M2.5 5.5h4.2L10 13l3-7.5h4.5" />
      <path d="M2.5 5.5 8 16" />
      <path d="M11 5.5 14 13" />
    </>
  ),
  run: (
    <>
      <path d="M5 3.5v13l11-6.5z" />
    </>
  ),
  approve: (
    <>
      <path d="M3.5 10.5 7.5 14.5 16.5 5.5" />
    </>
  ),
  reject: (
    <>
      <path d="M5 5 15 15" />
      <path d="M15 5 5 15" />
    </>
  ),
  filter: (
    <>
      <path d="M3 4.5h14" />
      <path d="M6 10h8" />
      <path d="M8.5 15.5h3" />
    </>
  ),
  externalLink: (
    <>
      <path d="M8.5 4.5H4.5A1.5 1.5 0 0 0 3 6v9A1.5 1.5 0 0 0 4.5 16.5h9A1.5 1.5 0 0 0 15 15v-4" />
      <path d="M11 3.5h5.5V9" />
      <path d="M16.5 3.5 9 11" />
    </>
  ),
  download: (
    <>
      <path d="M10 3v9.5" />
      <path d="M6 9l4 4 4-4" />
      <path d="M3.5 15.5v1A1.5 1.5 0 0 0 5 18h10a1.5 1.5 0 0 0 1.5-1.5v-1" />
    </>
  ),
  chevronRight: (
    <>
      <path d="M7.5 4.5 13 10l-5.5 5.5" />
    </>
  ),
  chevronDown: (
    <>
      <path d="M4.5 7.5 10 13l5.5-5.5" />
    </>
  ),
  close: (
    <>
      <path d="M5.5 5.5 14.5 14.5" />
      <path d="M14.5 5.5 5.5 14.5" />
    </>
  ),
};

export default function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
