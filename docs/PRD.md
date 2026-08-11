# Think9 PULSE — Product Requirements Document

*Submission for Think9 Ventures' agentic-systems assignment. Tracks addressed: Track 1 (Central Consumer Intelligence) + Track 4 (10x Content & Creative Intelligence), unified into one system, plus two candidate-proposed extensions (competitor intelligence, celebrity/partner stakeholder dashboards).*

---

## 1. Problem & Opportunity

Think9 runs 11 live brands today, scaling toward 30+, all under one operating philosophy: **Insights → Strategy → Design → Execution**. In practice, at this scale, "insight" and "execution" are handled by different people, on different cadences, in different tools. A market signal — a trending ingredient, a competitor's price cut, a celebrity partner's buzz spike — has no automatic path to a content brief, a draft, a brand-compliance check, and a shipped asset. Someone has to notice it, decide it matters, and manually route it. That latency is the bottleneck this system removes.

**Why an agentic system specifically, not a dashboard or a better spreadsheet:** the work here isn't just "surface data" — it's a chain of judgment calls (is this signal relevant? does this draft match the brand? is this ready for a human?) that benefits from being automated as a pipeline with real decision points, not a static report a human reads and then manually acts on. The system should do the noticing, drafting, and checking; humans should do the deciding.

**Opportunity, stated the way Think9 states it:** their own competitive advantage is "the ability to repeatedly decode Indian consumers and build brands across categories" (their language, from public research). A system that shortens signal→shelf latency and gets *provably* stricter about each brand's specific compliance failure modes over time compounds that advantage instead of just automating a single task.

---

## 2. Target Users

| User | What they need from this system |
|---|---|
| **Brand ops lead** (per-brand) | Trend/competitor/celebrity signals relevant to their brand, drafted content ready for a quick approve/reject, not a firehose of every signal across all 30+ brands |
| **Founder / portfolio lead** | A weekly cross-portfolio digest: what shipped, what's flagged, where brands could share an audience or a learning (Synergy Finder), and what this is costing |
| **Growth/BD team** | A shortlist of niche creators worth reaching out to, sourced from real social scanning, not manual scrolling |
| **Celebrity/creator partners (external stakeholders)** | Their own view into how their specific collaboration is trending — they are partners in this model, not just monitoring targets |
| **Marketing department (cross-brand)** | A customizable feed of only the trend/signal categories relevant to their remit (Feed Customizer, `HLD.md` §7.1) |

---

## 3. Success Metrics (what "working" means for this system)

Since this is a 2-day POC, not a shipped product with real usage data, success is defined structurally rather than by outcome metrics that don't exist yet:

- A signal detected by any Intelligence Pod agent can reach a human approval decision **without manual handoff** between research and content teams.
- The Brand Guardian loop **demonstrably catches and corrects** a non-compliant draft (a real fail-revise-pass cycle, not a hypothetical one) — the single most important thing to prove, because it's the difference between "an agent wrote something" and "an agent system that enforces brand safety."
- Every human-facing checkpoint (§6) is a real dead-end in the code, not a suggestion — nothing publishes, contacts, or escalates without an explicit human action.
- The Workspace folder tree (`docs/HLD.md`) is populated with real files after a run, inspectable by a non-technical reviewer without reading code.
- The system runs at **$0 marginal cost** on free tiers (Groq, Scrapfly free credits, all RSS/JSON sources) — see `docs/HLD.md` §13.

For the 30-day production version, real metrics would be: time-from-signal-to-approved-content (target: days -> hours), Brand Guardian first-pass rate trending up per brand as Compliance Memory accumulates, and cost-per-approved-asset tracked via the token ledger.

---

## 4. Scope

### 4.1 In scope, P0 (must exist, fully working - the whole submission if nothing else lands)
- Orchestrator -> Intelligence Pod (**Nazariya only**) -> Synthesis Pod (Consumer Shastra) -> Creative Pod (**Karigar <-> Pehredar loop + human interrupt**).
- Real Google News RSS signal ingestion (no key).
- Workspace folder tree, seeded and written to by a real run.
- Hierarchical live agent-graph visualization (`AgentGraphViz`) and a real folder browser (`WorkspaceBrowser`) in the frontend.
- Deployed to a live public URL (Render + Vercel, free tier).
- This PRD + `HLD.md` + `LLD.md` + `roadmap-30-day.md`.

**P0 definition of done:** a stranger can hit the live URL, trigger a run for a real Think9 brand, watch the Guardian loop happen in the graph view, approve it, and see the resulting files land in the Workspace browser - with no console errors and no manual backend intervention.

### 4.2 In scope, P1 (built only after P0's definition of done is met)
Scroll Sutradhar (Reddit + YouTube real, Instagram best-effort), Bazaar Nazar (Scrapfly, best-effort), Tara Dhwani (celebrity pulse), full image generation (packaging-mockup-styled, per-variant), Synergy Finder, Compliance Memory, the token/cost ledger + `CostMeter`.

### 4.3 In scope, P2 (cut first under any time pressure)
StakeholderDashboard (celebrity/creator partner portal), CreatorDiscovery outreach UI, CompetitorIntel page, Founder Digest sign-off UI, the Feed Customizer, more than 2 ad variants.

### 4.4 Explicitly out of scope (stated, not silently dropped)
- **Assignment Track 2** (cross-portfolio supply chain/sourcing) and **Track 3** (institutional-memory/legal-playbook RAG) - adjacent tracks this architecture could plausibly absorb later (the Workspace's `08_Knowledge_Base/` and Compliance Memory are early steps toward Track 3's shape), not attempted in this 2-day build.
- **Autonomous publishing to any external channel** - this system never calls a social/e-commerce publishing API. It drafts, scores, and flags; a human always ships (§6).
- **Full live e-commerce catalog sync** (Amazon/Flipkart/Nykaa) - Bazaar Nazar's Scrapfly crawl covers a small named allowlist as a best-effort proof point, not comprehensive live pricing intelligence. Real coverage requires partner API access, named in the 30-day roadmap.
- **Authentication/role-based access** - the POC has no login; anyone with the URL can trigger runs and approve content. Named explicitly as a Week 4 production requirement, not appropriate to skip silently.

---

## 5. Product Concept Recap

**Think9 PULSE** (Portfolio Unified Learning & Signal Engine): a hierarchical multi-agent system - Orchestrator -> Intelligence/Synthesis/Creative Pods - that turns any signal (trend, ingredient, niche creator post, competitor move, celebrity buzz) into brand-safe, human-approved content and visual assets through one traceable, visibly-looping pipeline, writing every output into a real, browsable Workspace folder structure. Full architecture in `docs/HLD.md`.

---

## 6. Human-in-the-Loop Checkpoints (grading-relevant: a required section of the assignment)

Restated from `HLD.md` §7 for completeness of this document:

1. **Content Approval Gate** - nothing publishes without a click.
2. **Celebrity Risk Acknowledgement** - a risk flag is acknowledged or escalated, never auto-acted on.
3. **Creator Outreach Add** - a shortlisted creator is added to outreach by a human, never auto-contacted.
4. **Competitor Alert Acknowledgement** - flagged, not auto-reacted to (no auto price-matching).
5. **Founder Digest Sign-off** - the weekly cross-portfolio digest is a draft until a founder/portfolio lead publishes it.

Design principle: *agents draft, score, scan, and flag; humans decide anything brand-facing, capital-facing, or outreach-facing.*

---

## 7. Data Sourcing Honesty Policy

Stated as a product requirement, not just an engineering note: the system must never present seeded/fallback data as live. Every signal carries a `mode: "live" | "fallback_seeded"` field, and the UI visually distinguishes them. Full real/best-effort/seeded breakdown in `HLD.md` §8.

---

## 8. Cost & Complexity Discipline

This is a pre-internship interview submission, not a funded production build - cost and operational complexity are held deliberately low while the demoable outcome stays ambitious:

- **$0 running cost**, structurally enforced (free-tier/keyless data sources, Groq's free LLM tier, Scrapfly used within its free credit allotment). Full breakdown in `HLD.md` §13.
- **Complexity is bounded by the P0/P1/P2 split above**, not by hoping everything fits - P0 alone is a complete, working, demoable product; nothing in P1/P2 is required for the submission to be honest and functional.
- **No infra beyond two free-tier deploys** (Render, Vercel) plus local SQLite/filesystem.

---

## 9. Deliverables (per the assignment's required submission format)

| Assignment requirement | Where it's satisfied |
|---|---|
| Problem & Opportunity | §1 of this document |
| System Architecture & Workflow (data sources, agent logic, human-in-the-loop checkpoints) | `docs/HLD.md` (architecture, sequence diagrams, data sourcing) + §6-7 of this document |
| Proof of Concept / Prototype | Live deployed URL (P0) + the repo itself + the Workspace folder tree as an inspectable artifact |
| Implementation Plan (tech stack + 30-day roadmap) | `docs/LLD.md` (tech stack/exact specs) + `docs/roadmap-30-day.md` |
| Slide deck / video walkthrough | Self-contained HTML slide deck + short demo recording walking the live loop and the Workspace folders |
