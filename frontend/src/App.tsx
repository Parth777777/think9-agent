import { useEffect, useState, type ComponentType } from "react";
import Icon, { type IconName } from "./components/icons";
import AskPulse from "./pages/AskPulse";
import ContentPipeline from "./pages/ContentPipeline";
import CreativeStudio from "./pages/CreativeStudio";
import MarketIntel from "./pages/MarketIntel";
import Meter from "./pages/Meter";
import PortfolioOverview from "./pages/PortfolioOverview";
import SocialPulse from "./pages/SocialPulse";
import WorkspaceBrowser from "./pages/WorkspaceBrowser";

const ROUTES: { path: string; label: string; icon: IconName; page: ComponentType }[] = [
  { path: "portfolio", label: "Portfolio", icon: "portfolio", page: PortfolioOverview },
  { path: "social", label: "Social Pulse", icon: "social", page: SocialPulse },
  { path: "market", label: "Market Intel", icon: "market", page: MarketIntel },
  { path: "pipeline", label: "Content Pipeline", icon: "pipeline", page: ContentPipeline },
  { path: "creative", label: "Creative Studio", icon: "creative", page: CreativeStudio },
  { path: "meter", label: "Meter", icon: "meter", page: Meter },
  { path: "workspace", label: "Workspace", icon: "workspace", page: WorkspaceBrowser },
];

function useHashRoute(): string {
  const [hash, setHash] = useState(() => (window.location.hash || "#/portfolio").slice(2));
  useEffect(() => {
    if (!window.location.hash) window.location.hash = "#/portfolio";
    const onHashChange = () => setHash((window.location.hash || "#/portfolio").slice(2));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return hash.split("/")[0] || "portfolio";
}

// think9 brand is dark-only \u2014 force dark theme once on mount
function useTheme() {
  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
  }, []);
}

// think9 chevron logo mark (SVG)
function Think9Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="t9g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22cbbf" />
          <stop offset="100%" stopColor="#0d8a80" />
        </linearGradient>
      </defs>
      {/* Two chevron shapes mirroring the think9 website logo mark */}
      <path d="M20 6 L34 20 L28 20 L20 12 L12 20 L6 20 Z" fill="url(#t9g)" />
      <path d="M20 18 L34 32 L28 32 L20 24 L12 32 L6 32 Z" fill="url(#t9g)" opacity="0.55" />
    </svg>
  );
}

export default function App() {
  useTheme(); // enforce think9 dark theme
  const route = useHashRoute();
  const [chatOpen, setChatOpen] = useState(false);

  const active = ROUTES.find((r) => r.path === route) ?? ROUTES[0];
  const Page = active.page;

  return (
    <div className="app-shell" style={{ display: "flex" }}>
      {/* ── think9 branded sidebar ── */}
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <Think9Mark size={26} />
          <span className="sidebar-logo-text">
            think<span>9</span>
          </span>
        </div>

        {/* Nav links */}
        {ROUTES.map((r) => (
          <a
            key={r.path}
            href={`#/${r.path}`}
            className={r.path === active.path ? "sidebar-link active" : "sidebar-link"}
          >
            <Icon name={r.icon} size={15} />
            {r.label}
          </a>
        ))}

        {/* Bottom label */}
        <div
          style={{
            marginTop: "auto",
            paddingTop: "var(--space-5)",
            paddingLeft: "var(--space-2)",
            fontSize: 10,
            color: "var(--t9-muted)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          PULSE v0.1 &mdash; demo
        </div>
      </aside>

      {/* ── Main content area ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Slim top bar \u2014 page title + actions */}
        <header
          className="app-nav"
          style={{ justifyContent: "space-between" }}
        >
          <span
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              color: "var(--t9-sub)",
              letterSpacing: "0.01em",
            }}
          >
            {active.label}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--t9-teal)",
                border: "1px solid var(--t9-teal-dk)",
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              DEMO
            </span>
          </div>
        </header>

        <main style={{ flex: 1 }}>
          <Page />
        </main>
      </div>

      {/* ── Floating Ask PULSE button ── */}
      <button
        className="btn-pill btn-run"
        onClick={() => setChatOpen((v) => !v)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          display: "flex",
          alignItems: "center",
          gap: 8,
          zIndex: 30,
        }}
      >
        <Icon name="chat" size={15} /> Ask PULSE
      </button>

      {/* ── Chat panel ── */}
      {chatOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "min(420px, 100vw)",
            background: "var(--t9-surface)",
            borderLeft: "1px solid var(--t9-border)",
            boxShadow: "var(--shadow-md)",
            zIndex: 40,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--space-3) var(--space-4)",
              borderBottom: "1px solid var(--t9-border)",
            }}
          >
            <strong style={{ fontSize: "var(--text-sm)", letterSpacing: "-0.01em" }}>Ask PULSE</strong>
            <button
              className="nav-link"
              style={{ color: "var(--t9-sub)", padding: 4 }}
              onClick={() => setChatOpen(false)}
              aria-label="Close chat"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <AskPulse />
          </div>
        </div>
      )}
    </div>
  );
}
