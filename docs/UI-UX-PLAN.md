# Think9 PULSE — UI/UX Plan

Planning document only — no frontend code here. Written against `docs/HLD.md`, `docs/LLD.md`, `docs/PRD.md`, `docs/roadmap-30-day.md` as they stand today. For review before any frontend build starts. Every data reference below is an existing route from `LLD.md` §8 unless explicitly flagged "new backend work."

App shell: a left sidebar nav (Portfolio Overview, Brand Workspace, Content Pipeline, Celebrity Dashboard, Creator Discovery, Competitor Intel, Founder Digest, Workspace Browser), a top bar (brand selector when in brand-scoped context, `CostMeter`, Feed Customizer toggle, Ask PULSE chatbot toggle), and a main panel. `StakeholderDashboard` is a separate, unbranded shell (partners never see the Think9 internal nav — see §3).

---

## 1. Personas & Entry Points

**Brand ops lead.** Opens the app, sidebar defaults to **Brand Workspace** pre-filtered to their brand (the brand picker in the top bar remembers the last-selected brand via `localStorage`). First thing seen: any `paused_for_approval` run for that brand, surfaced as a banner at the top of Brand Workspace ("1 draft awaiting your approval"). Click → Content Pipeline for that run_id → review draft/compliance → Approve/Reject/Request changes. That's the whole loop: open app → see the flag → click into it → decide.

**Founder / portfolio lead.** Lands on **Portfolio Overview** (the app's actual home page, no brand pre-selected). Sees the cross-brand digest summary card and cost meter first. Primary task is not per-brand triage, it's "is anything on fire across the portfolio, and is this week's digest ready to sign off." Click → Founder Digest → review Synergy Finder output and cost summary → Publish.

**Growth/BD.** Enters via **Creator Discovery** directly (sidebar link, no brand-scoping needed since Scroll Sutradhar's candidates aren't brand-siloed the same way). Scans the shortlist sorted by fit score, clicks a few "Add to outreach," done. No dashboard tour required — this persona has one task and the page should get them to it in one screen.

**Celebrity/creator partner.** Never touches the internal app. They get a separate link (e.g. `/partner`) that opens **StakeholderDashboard**. First screen is a partner picker (see §3) since there's no auth. Primary task: "how is my collaboration doing" — glance at buzz trend and sentiment, see upcoming content that features them, done. Passive by default.

**Marketing department (cross-brand).** Opens the app, primary surface is the **Feed Customizer**-filtered signal feed, wherever they've chosen to view it (see §4 — it's not a standalone destination, it's a lens over Portfolio Overview / Brand Workspace signal lists). First action on a new session: set filters once; every subsequent visit restores them automatically.

### Framing note: multiple interaction channels, not one chatbot

This system is designed around several distinct interaction channels, each suited to a different task — not a chatbot with dashboards bolted on, and not dashboards with a chatbot bolted on. **Dashboards** (§2, §3) are for browsing and acting on specific items — approving a draft, acknowledging a flag, adding a creator to outreach — anywhere a decision needs full context. The **Founder Digest** (§2) is for periodic, passive, read-first summary — a founder doesn't query for it, it arrives ready to read. The **Brand Knowledge Graph view** (§6a) is for spatially exploring relationships between brands, segments, and tags — a browsing/discovery task, not a lookup task. The **chatbot** (§5) is for ad-hoc natural-language lookup when a user doesn't want to navigate at all. None of these four replaces another; a builder should treat the chatbot as one optional channel among four, not the primary UI.

---

## 2. Page-by-Page UX Spec

**PortfolioOverview** — Data: `GET /brands`, `GET /digest/latest`, `GET /costs/summary`. Actions: click a brand card → Brand Workspace; click digest summary → Founder Digest. Layout: top — cost meter + "N briefs pending across portfolio" strip; main — grid of brand cards (name, category, last-run status, open-approval count); right rail — latest digest teaser + Synergy Finder flag count.

**BrandWorkspace** — Data: `GET /brands` (single brand detail), `GET /pipeline/{run_id}` for the active/most-recent run, `GET /competitors/{brand_id}`, filtered signals. Actions: "Run pipeline" (POST `/pipeline/run`) to trigger a new signal→content cycle; click an in-flight run → Content Pipeline. Layout: left sidebar — brand identity card (positioning, tone, banned claims — read from the seeded Brand Bible) + known-pitfalls list (Compliance Memory); main — signal feed for this brand (subject to Feed Customizer) and run history; top — "Run pipeline" button + status of any active run.

**ContentPipeline** — Data: `GET /pipeline/{run_id}` polled on an interval (per `LLD.md` §10, this is interval polling not SSE for the POC). Actions: Approve / Reject / Request changes → `POST /pipeline/{run_id}/approve`. Layout: top — `AgentGraphViz` (the `@xyflow/react` node graph showing Orchestrator → Pods → the Karigar↔Pehredar loop, animated edge on iteration); main-left — current draft (copy, image, ad variants); main-right — Pehredar's compliance score/issues list; bottom — the three decision buttons, disabled until `status: "paused_for_approval"`.

**CelebrityDashboard** (internal ops view — distinct from StakeholderDashboard) — Data: `GET /celebrities`. Actions: click a risk flag → acknowledge/escalate (checkpoint 2, `POST` — note: no dedicated route exists for this in LLD §8 yet; flag as needing a small backend addition, e.g. reusing the decision_log pattern, or scope it into `/pipeline/{run_id}/approve`-style POST if it's tied to a run). Layout: table view — one row per partner, columns: buzz score, sentiment trend (sparkline), brand-alignment score, risk flag badge; row click expands to a detail panel with the full trend.

**CreatorDiscovery** — Data: `GET /creators`. Actions: `POST /creators/{id}/outreach` ("Add to outreach" — the only action, deliberately one button per card, checkpoint 3). Layout: single scrollable list/grid of creator cards sorted by fit score descending; each card: handle, platform, category, fit score, one-click add button that flips to "Added" state; no filters needed at this data volume (seeded + Scroll Sutradhar output is small).

**CompetitorIntel** — Data: `GET /competitors/{brand_id}` (requires brand context, so this page needs the top-bar brand selector active). Actions: "Acknowledge" per flag (checkpoint 4 — same gap as CelebrityDashboard's escalate action, see §7). Layout: top — brand selector; main — list of competitor flags (name, price range, positioning, `mode: live|fallback_seeded` badge); each flag has one Acknowledge button, no auto-react affordance anywhere on this page by design.

**FounderDigest** — Data: `GET /digest/latest`. Actions: `POST /digest/publish` (checkpoint 5). Layout: single long-form document view (this one page reads more like a report than a dashboard) — sections: what shipped this week, open flags, Synergy Finder suggestions (brand-pair cards with shared segment tags), cost ledger summary; a persistent "Publish" button in a sticky header, disabled once already published, with a visible "Draft" vs "Published" state badge.

**WorkspaceBrowser** — Data: `GET /workspace/tree`, `GET /workspace/file?path=`. Actions: click folder → expand; click file → preview pane. Layout: classic two-pane file browser — left: recursive folder tree (`FolderTree` component per LLD §10); right: file preview (renders markdown as text, JSON as a tree/pretty-print, PNG inline). No edit capability — this page is read-only by design, it's for inspection/trust-building, not authoring.

**StakeholderDashboard** — see §3.

---

## 3. StakeholderDashboard, in depth

This is the external partner's window into their own collaboration — not the internal `CelebrityDashboard` ops view, and it must not share layout or navigation chrome with the internal app (a partner should never see a sidebar that implies "there's more here I could click into").

**"Login."** No auth exists in the POC (`HLD.md` §11, `PRD.md` §4.4). The entry screen is a simple partner picker: a short list of partner names/avatars (from the seeded `celebrities.json`), pick one, land on their view. This selection is stored in `sessionStorage` only — closing the tab resets it, which is an honest signal to a demo viewer that this isn't real auth, not a bug to hide. The route is `/partner`, separate from the internal app's root, so there's no risk of a partner landing on internal navigation by accident.

**What they see.** Calls `GET /stakeholder/{partner_id}`. Three blocks: (1) buzz trend — a simple line/sparkline of buzz score over time; (2) upcoming content involving them — any `ContentDraft`/brief tagged to their partner_id, shown as a card list (title, brand, status — draft/approved, never the raw compliance notes); (3) sentiment — current sentiment score plus direction (up/down), and if `risk_flag` is set, a plain-language banner ("Something to be aware of: [flag]"), not the internal risk taxonomy.

**What they can't see.** Any other brand's Brand Bible, signals, pipeline runs, or cost data; any other partner's record (`partner_id` scopes the query — there is no "browse all partners" affordance on this route, by design, not just by omission); Pehredar's compliance scoring detail (a partner doesn't need to know a draft failed and was revised twice — they see the final approved-or-pending state, not the iteration history). This is a hard content boundary to write into the frontend fetch layer, not just a UI hiding trick, since there's no server-side auth yet to enforce it — the frontend must only ever request that one partner's scoped endpoint and never expose a route to browse others.

**What they can action.** Nothing that writes state in the POC. This is a view-only surface — no approve/reject, no outreach action, nothing that could be mistaken for the partner having pipeline authority. If a "flag a concern" affordance is wanted later, it's a new backend capability (a partner-initiated note into `decision_log`), explicitly out of scope for this plan — flagged as a roadmap idea, not designed here.

---

## 4. Feed Customizer, in depth

Confirmed session-local per `HLD.md` §7.1 and `LLD.md` §10: "a client-side filter over the same `/pipeline/{run_id}` / signal data — session-local `localStorage` preference, no new backend endpoint needed." This plan keeps that shape exactly.

**Where it lives.** Not a standalone page — a persistent filter toolbar, collapsible, accessible from the top bar on any page that renders a signal list (Portfolio Overview, Brand Workspace). Clicking the "Filters" icon in the top bar drops down a panel; it does not navigate away from the current page, since the whole point is filtering what's already on screen.

**Controls.** (1) Brand multiselect (checkboxes, defaults to all brands for a founder-level user, defaults to just their own brand for a brand ops lead based on last-selected brand); (2) Source type multiselect — Nazariya (trend), Scroll Sutradhar (social), Bazaar Nazar (competitor), Tara Dhwani (celebrity), matching `Signal.source`; (3) Category — free-derived from brand categories present in the current signal set (wellness, nutrition, beauty, etc.), not a hardcoded list; (4) a `mode` toggle — "show fallback-seeded signals" on/off, defaulting on, so the honesty-labeling from §8 of HLD is itself filterable without hiding it by default.

**Save/restore UX.** Selections write to `localStorage` under a single `pulse_feed_filters` key on every change (no explicit "save" button — it's live). On next visit, the toolbar reads that key and applies filters before the first render of the signal list, with a small "Filters active (3)" pill next to the toolbar icon so it's visible that a filter is suppressing content, not just silently empty. A "Reset" link clears the key and shows everything. No account exists to persist this across devices/browsers — that's the named Week 4 roadmap gap (`HLD.md` §7.1), and this plan doesn't pretend otherwise.

---

## 5. Chatbot Interface (new — designed here, not yet speced elsewhere)

**What it's for.** "Ask PULSE" — a natural-language query surface over data the system already has, for time-poor users (founder, portfolio lead) who don't want to click through five pages to answer "what's the latest on The Good Bug?" or "which brands share a consumer segment?" It is explicitly a **query layer, not an action layer** in this plan — it never approves, publishes, or triggers a pipeline run on a user's behalf, to stay inside the same "agents draft/flag, humans decide" principle the rest of the system enforces at UI level, not just backend level.

**Where it lives.** A persistent widget: a small floating button, bottom-right, on every internal page (not on StakeholderDashboard — partners get their own simple view, not a system-wide query tool). Clicking opens a slide-over panel, not a full-page takeover, so the underlying dashboard stays visible/in-context. It supplements navigation, it does not replace it — the sidebar and pages remain the primary way to work; the chatbot is a shortcut for "I don't want to navigate, just tell me."

**What it can actually do, given the existing API surface.** Answerable today, read-only, by composing existing routes: "what's the latest on brand X" (`GET /brands` + latest `/pipeline/{run_id}` for that brand), "show me all pending approvals" (would need to iterate `runs` — LLD's SQLite `runs` table has a `status` column but **there is no `GET /runs?status=paused_for_approval` list route in LLD §8 today**, only single-run lookup by `run_id`), "which brands share a consumer segment" (`GET /digest/latest`'s `synergy_map`, already computed by Kul Darshan), "what's this week's cost" (`GET /costs/summary`).

**Explicit backend gap, flagged plainly:** a "list all runs, filterable by status" endpoint does not exist in the current LLD contract. Everything else the chatbot needs is already covered by an existing route or already-computed field. This is a small, additive gap (one new GET route, no new agent, no new state) — worth naming to whoever owns the backend build now rather than discovering it late, but it should not be treated as urgent scope: the chatbot itself is P2/deferred (see §7), so this gap only matters if and when the chatbot gets built.

**Relation to dashboards.** Supplements, does not replace. It's a fast path for a narrow set of query patterns for founders/growth leads; it is not proposed as the primary interaction model for brand ops leads doing the approve/reject loop, which stays page-based because approval is a decision with consequences and deserves the full context (compliance notes, image, variants) that a chat answer can't compress well.

---

## 6. Brand Knowledge Ingestion UX (new — designed here, not yet speced elsewhere)

Today, per `LLD.md` §7, Brand Bibles are seeded JSON in `data/brands.json`, hand-written once from real public brand descriptions. The question is how a real Think9 brand ops lead gets a new or updated Brand Bible into the system without an engineer editing that file.

**Two tiers, matched honestly to what's realistic in a 2-day POC vs. a real onboarding flow:**

- **POC-realistic (this build, if built at all — see §7): a structured admin form**, not a document upload. Fields map 1:1 to the existing `Brand` shape in `LLD.md` §7: brand name, category, positioning (short text), tone (multi-select tag input, free-add), banned claims (repeatable text list), consumer segments (tag input, feeding the existing Synergy Finder's pairwise-intersection logic directly — no change needed there). Submitting writes to `data/brands.json` via a small new POST route (this is new backend surface, but trivially small — a single CRUD write, not a new agent or graph node). Known pitfalls stays system-managed (Compliance Memory writes to it automatically per `LLD.md` §11) — the form should show it read-only, not offer manual editing, since letting a human hand-edit what's meant to be an automatically-accumulated compliance history would undercut the "gets stricter over time" story. Even simpler fallback if the form itself is cut for time: a raw JSON edit page (textarea + save), explicitly the lowest-effort version of this feature, acceptable for a POC demo because it's still self-serve and still doesn't require touching the repo.

- **30-day-roadmap tier (not built now): document upload + LLM extraction.** A brand ops lead uploads an existing brand deck/positioning doc/style guide (PDF or text), and an agent parses it into the structured Brand Bible schema. This is consistent with and directly named by `roadmap-30-day.md` Week 2: *"Build a Brand Bible onboarding flow (a form, not hand-edited JSON) so any brand ops lead can register their brand's positioning/tone/banned-claims without an engineer touching `data/brands.json`."* Note the roadmap itself specs Week 2 as **a form**, not document-upload extraction — so even the roadmap treats free-text-to-schema parsing as a later step than the form. This plan is consistent with that: document upload + extraction is not even a Week 2 item as currently written, more plausibly a Week 3+ idea. If it were built, Consumer Shastra is the closest existing agent in shape (it already synthesizes unstructured signal text into a structured Brief) and could plausibly be extended to parse a doc into a Brand Bible without a new agent class — but that's a real scope decision for whoever owns the backend, not something to assume free. **This plan does not propose building document upload/extraction now.**

---

## 6a. Brand Knowledge Graph View (new — designed here, not yet speced elsewhere)

An Obsidian-style interlinked graph over the same Brand Bible / portfolio data — a spatial way to browse relationships between brands that the Founder Digest's Synergy Finder already computes but currently only presents as a flat list of pairs.

**Nodes and edges.** Nodes: brands (one per `Brand` record), consumer segments (one per unique tag in `consumer_segments`), and optionally ingredient/trend tags surfaced from recent signals and celebrity/partner nodes for brands with an active collaboration. Edges: brand↔segment (a brand is tagged with a segment — direct from the seed data), brand↔brand (drawn wherever `find_synergies()` in `LLD.md` §12 already found a shared-segment pair — this is exactly the Synergy Finder's existing `itertools.combinations` pairwise-intersection output, re-rendered spatially instead of as a list), and optionally brand↔trend-tag from recent Nazariya signal categories. No new computation is needed for the core brand↔brand↔segment graph — it's a rendering layer over `find_synergies()`'s output plus the seed `consumer_segments` field, both of which already exist.

**Interaction.** Click a brand node → side panel slides in with that brand's full Brand Bible (positioning, tone, banned claims, known pitfalls) — the same content `BrandWorkspace`'s sidebar shows, reused here, not reinvented. Click an edge → a small tooltip/popover states why the two nodes are connected, in the same language Synergy Finder already generates (e.g. *"The Good Bug ↔ Panchamrit: shared segment 'gut_health' — consider cross-promotion or Broadway bundling"* — this is the literal `suggestion` string `find_synergies()` already produces, per `LLD.md` §12). A search/filter bar above the canvas lets a user type a brand or segment name to highlight and re-center on it, and a category filter (wellness/nutrition/beauty/etc.) dims non-matching nodes rather than removing them, so the overall shape of the portfolio stays visible while a user narrows focus.

**Library choice — reuse, don't add a second graph dependency.** `@xyflow/react` is already the planned/verified library for `AgentGraphViz` (`HLD.md` §12, `LLD.md` §10) and should render this view too — same node/edge/click-handler model, same package already in the dependency tree. `@xyflow/react` itself doesn't ship a force-directed layout algorithm, but it doesn't need to: React Flow's own official examples document pairing it with `d3-force` purely as a position-computation step (nodes' `x`/`y` are computed by `d3-force`'s simulation, then handed to React Flow for rendering/interaction) — this is React Flow's documented pattern for exactly this "Obsidian-style" case, not a second graph UI library. `d3-force` is free, keyless, and tiny, so pairing it here isn't a new integration risk the way a whole second visualization framework would be. Only reach for an alternative (e.g. a standalone force-graph renderer) if `d3-force` positions plus `@xyflow/react` rendering turns out not to perform well at the node count involved (unlikely at 11-30 brands + tags) — not speculatively.

**Placement.** This is a visualization layer over data the Synergy Finder already produces, and Synergy Finder itself is P1 (`PRD.md` §4.2). The graph view should sit no earlier than P1/P2 — it cannot exist meaningfully before Synergy Finder's output does, and it competes for build time with the already-named P2 items (§7). It does not require any new backend work beyond what P1 already plans; it is purely a new frontend page reading `GET /digest/latest`'s `synergy_map` plus `GET /brands`.

---

## 7. P0/P1/P2 — What's Realistic for This 2-Day POC

Per `PRD.md` §4, the existing tiers are: P0 = the signal→content→approval loop (Orchestrator, Nazariya, Consumer Shastra, Creative Pod loop, `AgentGraphViz`, `WorkspaceBrowser`, live deploy). P1 = the rest of the Intelligence Pod, image variants, Synergy Finder, Compliance Memory, cost ledger. P2 (explicitly named, "cut first under any time pressure") = StakeholderDashboard, CreatorDiscovery, CompetitorIntel, Founder Digest sign-off UI, the Feed Customizer.

Mapping everything in this plan onto that, without silently expanding it:

- **P0 pages** (must exist for the core loop to be demoable): PortfolioOverview (or just BrandWorkspace as the effective home if Portfolio Overview is cut), BrandWorkspace, ContentPipeline, WorkspaceBrowser. These match P0's existing scope directly.
- **P1**: CelebrityDashboard, cost meter wiring on the top bar — matches P1's Tara Dhwani/cost-ledger scope.
- **P2 (already named in PRD, unchanged by this plan)**: StakeholderDashboard, CreatorDiscovery, CompetitorIntel, FounderDigest UI, Feed Customizer. This plan designs all of these in full so they're ready to build the moment P0/P1 land and time remains — it does not argue for promoting any of them ahead of PRD's existing cut line.
- **New in this plan, not in any existing tier — propose P2/roadmap, explicitly not P0/P1:**
  - **Chatbot ("Ask PULSE")**: propose P2, bottom of the list, below the existing P2 items. It adds real UI surface area and (per §5) at least one small new backend route, for a feature that's a convenience layer on top of pages that must exist first regardless. Do not build before every existing P0/P1/P2 item is either done or explicitly deferred.
  - **Brand knowledge ingestion form/JSON-editor**: propose P2 at the earliest, arguably roadmap-only. It's genuinely useful for the "how would a real Think9 team use this" story the interview is evaluating, but `data/brands.json` already ships seeded and working — an admin form is a nice-to-have UX layer over data that already exists for the POC's 11 brands, not something the P0 demo depends on.
  - **Brand Knowledge Graph view (§6a)**: propose P1/P2, tracking directly behind Synergy Finder (P1) since it's purely a rendering layer over Synergy Finder's output plus `GET /brands` — no earlier than the data it visualizes exists, and no new backend work required. Competes for time with the existing P2 list, doesn't jump ahead of it.

**Plain statement for the human reviewing this doc:** if the 2-day clock runs out anywhere near P1, do not start the chatbot, the brand-ingestion form, or the knowledge graph view — they are designed here so a builder never has to stop and ask "how should this work," not because this plan is asking for them to be built this week. Everything in §3, §4, §5, §6, §6a is ready to hand to a builder as-is whenever there's time; none of it should come before the P0 loop (trigger → Guardian loop visible in the graph → approve → file lands in Workspace) is rock-solid and demoable end to end.
