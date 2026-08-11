# Think9 PULSE — 30-Day Roadmap (POC to first-brand production pilot)

Companion to `docs/PRD.md` §9 (assignment requires "a high-level tech stack and a 30-day roadmap to build a minimum viable version at Think9"). Each week names the specific POC shortcut it removes — nothing here is generic "harden it" language.

---

## Tech Stack Summary

| Layer | POC (this submission) | Production |
|---|---|---|
| Agent orchestration | LangGraph (hierarchical: Orchestrator + 3 Pods) | Same — architecture holds, no rewrite needed |
| LLM provider | Groq free tier, provider-swappable via env var | Same factory, likely add a paid-tier fallback for volume |
| Backend | FastAPI + SQLite + filesystem Workspace | FastAPI unchanged; SQLite -> Postgres, filesystem Workspace -> S3/GCS-backed |
| Frontend | React/Vite, `@xyflow/react` for graph viz | Same |
| Checkpointing | `MemorySaver` (in-process) | `PostgresSaver` (durable, survives restarts) |
| Scraping | Scrapfly (best-effort, small allowlist) | Scrapfly at higher tier/volume, or direct partner APIs where available |
| Social data | Reddit/YouTube (real), Instagram (best-effort via `instaloader`) | Meta Graph API (business verification), TikTok API - partner access |
| Deploy | Render + Vercel, free tier | Same providers, paid tier, or migrate to cloud-native (ECS/Cloud Run) if scale demands it |

---

## Week 1 - Real data, still one or two pilot brands

- Swap Bazaar Nazar from a small Scrapfly allowlist to a properly licensed e-commerce data source (Amazon/Flipkart Product Advertising API, or an expanded Scrapfly quota) for 2-3 pilot brands.
- Apply for Meta Graph API business access (this has a real approval lag - start it Week 1 even though it won't land immediately) to replace Instagram's best-effort `instaloader` fallback with a supported integration.
- Move the checkpointer from `MemorySaver` to `PostgresSaver` - the graph logic doesn't change, only the compile-time argument.
- Wire real commerce data (Shopify/marketplace order data) into Kul Darshan's digest so "content performance" stops being seeded.

## Week 2 - Self-serve onboarding, portfolio-scale data model

- Build a Brand Bible onboarding flow (a form, not hand-edited JSON) so any brand ops lead can register their brand's positioning/tone/banned-claims without an engineer touching `data/brands.json`.
- Move the Workspace's flat JSON-per-brand model into a proper portfolio graph store (Postgres with a brand-relationship table is enough at 30 brands; a dedicated graph DB like Neo4j is a Week-3-or-later decision, not needed yet) so the Synergy Finder can do real relationship queries instead of a pairwise-intersection scan.
- Add the remaining Intelligence Pod agents (if not already done in the POC's P1) to every brand, not just the 1-2 pilots.

## Week 3 - Commerce/inventory depth, delivery channels

- Add Commerce and Inventory agents (named in the original assignment's Track 2 framing) into the Synthesis Pod, feeding Kul Darshan - stock-outs, ageing inventory, and margin data become part of the digest, not just content/trend signals.
- Slack/email delivery for the Founder Digest and approval notifications, replacing "log in and check the dashboard" as the only notification path.
- Real creator-outreach CRM integration (even a simple Airtable/HubSpot webhook) so the Creator Outreach checkpoint (§6 of `PRD.md`) produces an actual outbound action once a human approves it, instead of just marking a row.

## Week 4 - Governance, auth, audit

- Role-based auth: founder / brand-ops / external-partner roles, with the Stakeholder Dashboard becoming a real partner login instead of a session-local view-switcher.
- Full audit log of every agent decision and every human override, queryable - not just the append-only `decision_log.jsonl`, but a proper searchable history per brand, per agent, per approval.
- Cost/usage dashboarding per brand (the token ledger from the POC, extended to show spend-per-brand and flag anomalies) - this is the point where "$0 running cost" stops being true at scale, and visibility into exactly where spend goes matters most.
- Security review: secrets rotation, rate limiting on public endpoints, and a real incident-response plan for the day a Brand Guardian miss actually reaches a human approver who also misses it.

---

## What does NOT change from POC to Week 4

Deliberately not rewritten, because the POC's design already anticipated this scale point (see `docs/HLD.md` §11 Explicit Trade-offs):

- The hierarchical Orchestrator -> Pod -> Agent structure.
- The shared `Signal` -> `Brief` -> `ContentDraft` contract that lets any Intelligence source feed the Creative Pod.
- The five human-in-the-loop checkpoints and the "agents draft/score/flag, humans decide" principle - this does not get automated away as the system matures; if anything, more checkpoints get added as more brands and more capital are in scope, not fewer.
