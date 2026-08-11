// Shapes mirrored from backend/app/graphs/state.py (PulseState) and
// backend/app/data/brands.json — kept minimal, only fields the P0 UI reads.

export interface Brand {
  id: string;
  name: string;
  category: string;
  positioning: string;
  tone: string[];
  banned_claims: string[];
  consumer_segments: string[];
  known_pitfalls: string[];
}

export interface Engagement {
  score: number;
  num_comments: number;
  upvote_ratio: number;
  created_utc: number;
}

export interface Signal {
  id: string;
  source: "news_rss" | "reddit" | "youtube" | "instagram" | "scrapfly_competitor" | "seed";
  mode: "live" | "fallback_seeded";
  brand_category: string;
  headline: string;
  url: string;
  fetched_at: string;
  // Reddit signals only — the backend used to fetch this and throw it away.
  engagement?: Engagement;
}

export interface Brief {
  brand_id: string;
  tension: string;
  why_now: string;
  confidence: number;
  reactive: boolean;
  source_signal_ids: string[];
}

export interface Asset {
  format: "product" | "faceless_ugc";
  size: "feed" | "story" | "banner";
  width: number;
  height: number;
  url: string | null;
  provider: string;
  headline: string;
  cta: string;
  // "ok" = backend fetched it and got 200. "unverified" = the URL renders on demand but
  // was not confirmed (Pollinations rate-limits pre-fetching at pack scale). "failed" =
  // no provider produced a URL at all.
  status: "ok" | "unverified" | "failed";
}

export interface ContentDraft {
  copy: string;
  image_url: string | null;
  ad_variants: string[];
  iteration: number;
  // 2 formats x 3 sizes; a failed asset degrades that tile only.
  assets?: Asset[];
}

// --- Provenance: every figure the UI renders declares how it was produced. ---
export type Provenance = "measured" | "computed" | "model-estimated" | "seeded";

export type SourceMode = "live" | "degraded" | "fallback_seeded" | "rate_limited";

export interface RunRow {
  run_id: string;
  brand_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MeterSnapshot {
  tokens: { prompt: number; completion: number; total: number };
  by_node: Record<string, { prompt_tokens: number; completion_tokens: number }>;
  rate_limit: Record<string, unknown>;
  estimated_cost_usd: number;
  cost_note: string;
}

export interface SeriesPoint {
  date: string;
  views: number;
}

export interface MarketBundle {
  brand_id: string;
  brand_name: string;
  category: string;
  mode: SourceMode;
  interest: { article: string; mode: SourceMode; series: SeriesPoint[] };
  keywords: { seed: string; mode: SourceMode; keywords: { keyword: string; rank: number }[] };
  competitors: unknown;
}

export interface SocialBuzz {
  mode: SourceMode;
  subreddits: {
    name: string;
    post_count: number;
    total_score: number;
    total_comments: number;
    avg_upvote_ratio: number;
  }[];
  daily: { date: string; posts: number; score: number; comments: number }[];
  top_posts: {
    title: string;
    url: string;
    subreddit: string;
    score: number;
    num_comments: number;
    upvote_ratio: number;
    created_utc: number;
  }[];
}

export interface ChatReply {
  reply: string;
  tool_calls: { tool: string; args: Record<string, unknown>; result_summary: string }[];
  mode: "live" | "rate_limited" | "error";
}

export interface ComplianceResult {
  passed: boolean;
  score: number;
  issues: string[];
}

// GET /pipeline/{run_id} response: the raw PulseState plus two fields the
// route bolts on (_run_status from SQLite, _paused from the LangGraph
// checkpoint) — see backend/app/api/routes.py::get_pipeline.
export interface PipelineState {
  run_id: string;
  brand_id: string;
  signals: Signal[];
  brief: Brief | null;
  content_drafts: ContentDraft[];
  compliance_result: ComplianceResult | null;
  iteration_count: number;
  human_decision: "approve" | "reject" | "request_changes" | null;
  final_output: Record<string, unknown> | null;
  _run_status: "running" | "paused_for_approval" | "completed" | "rejected";
  _paused: boolean;
}

export interface RunPipelineResponse {
  run_id: string;
  status: "paused_for_approval" | "completed";
}

export interface ApprovePipelineResponse {
  run_id: string;
  status: string;
  final_output: Record<string, unknown> | null;
}

export type Decision = "approve" | "reject" | "request_changes";

export interface WorkspaceNode {
  name: string;
  type: "file" | "directory";
  children?: WorkspaceNode[];
}

export interface WorkspaceFile {
  path: string;
  content: string;
}
