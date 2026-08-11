// Feed Optimizer — one filter bar reused on SocialPulse and PortfolioOverview.
// Persists to localStorage under a single key on every change, no save button.
// Each caller passes only the chip groups relevant to it (pass [] to hide a group).
import Icon from "../components/icons";

const STORAGE_KEY = "pulse_feed_filters";

export interface FeedFilters {
  brand: string;
  source: string;
  category: string;
  mode: string;
}

const EMPTY_FILTERS: FeedFilters = { brand: "", source: "", category: "", mode: "" };

export function loadFilters(): FeedFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...EMPTY_FILTERS, ...(JSON.parse(raw) as Partial<FeedFilters>) };
  } catch {
    // corrupt/blocked storage — fall through to defaults
  }
  return EMPTY_FILTERS;
}

function saveFilters(f: FeedFilters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    // storage unavailable (private mode, quota) — filters just won't persist
  }
}

export default function FilterBar({
  brands = [],
  sources = [],
  categories = [],
  value,
  onChange,
}: {
  brands?: string[];
  sources?: string[];
  categories?: string[];
  value: FeedFilters;
  onChange: (f: FeedFilters) => void;
}) {
  function toggle(key: keyof FeedFilters, v: string) {
    const next = { ...value, [key]: value[key] === v ? "" : v };
    saveFilters(next);
    onChange(next);
  }

  const activeCount = Object.values(value).filter(Boolean).length;

  return (
    <div className="filter-bar">
      <Icon name="filter" size={16} />
      {categories.map((c) => (
        <button key={`cat-${c}`} className={value.category === c ? "filter-chip selected" : "filter-chip"} onClick={() => toggle("category", c)}>
          {c}
        </button>
      ))}
      {brands.map((b) => (
        <button key={`brand-${b}`} className={value.brand === b ? "filter-chip selected" : "filter-chip"} onClick={() => toggle("brand", b)}>
          {b}
        </button>
      ))}
      {sources.map((s) => (
        <button key={`src-${s}`} className={value.source === s ? "filter-chip selected" : "filter-chip"} onClick={() => toggle("source", s)}>
          {s}
        </button>
      ))}
      {(["live", "fallback_seeded"] as const).map((m) => (
        <button key={`mode-${m}`} className={value.mode === m ? "filter-chip selected" : "filter-chip"} onClick={() => toggle("mode", m)}>
          {m}
        </button>
      ))}
      {activeCount > 0 && <span className="muted">{activeCount} filters active</span>}
    </div>
  );
}
