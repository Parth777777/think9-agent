# Think9 PULSE ⚡ (Portfolio Unified Learning & Signal Engine)


---

## 🛠️ Systems Philosophy: State over Ephemeral Agents

In a scaled consumer environment (11+ brands growing to 30+), relying on ephemeral agents with loose, non-deterministic "skills" and dynamic markdown transfers is highly fragile. Think9 PULSE prioritises **State and Folder Structures** as the ultimate source of truth over individual agent autonomy:

1. **State Persistence**: Every agent execution is a side-effect that writes structured JSON, Markdown, or raw media directly to a persistent, physical directory structure (`Think9_PULSE_Workspace/`).
2. **Auditability and Trust**: Non-technical stakeholders (founders, brand leads, and legal guardians) can audit and verify the system's reasoning at any point by browsing files in the workspace (via a built-in `WorkspaceBrowser`), completely bypassing the need to read execution logs.
3. **Deterministic State Contracts**: A single, strictly defined state schema (`PulseState`) is shared across all sub-graphs. Rather than dynamic chat nodes, agents behave like clean, predictable data-transformation processors.

---

## 📐 System Architecture

Think9 PULSE is constructed as a **hierarchical LangGraph** engine. A master `Orchestrator` StateGraph manages three fully compiled, stateful sub-graphs ("Pods").

```
               +-------------------------------------------------+
               |             Orchestrator StateGraph             |
               +-----------------------+-------------------------+
                                       |
        +------------------------------+------------------------------+
        |                              |                              |
+-------v-------+              +-------v-------+              +-------v-------+
|  Intelligence |              |   Synthesis   |              |   Creative    |
|      Pod      |              |      Pod      |              |      Pod      |
| (Fan-out)     |              | (Aggregation) |              | (Review Loop) |
+-------+-------+              +-------+-------+              +-------+-------+
        |                              |                              |
        |-- Nazariya                   |-- Consumer Shastra           |-- Karigar
        |-- Scroll Sutradhar           |-- Kul Darshan                |-- Pehredar
        |-- Bazaar Nazar               +-------------------------------+-- [interrupt()]
        |-- Tara Dhwani                                               +-------+-------+
        +---------------------------------------------------------------------+
```

### State Management & The `dedup_add` Reducer
During parallel fan-out inside the Intelligence Pod, LangGraph concatenates signals into lists. However, in modern LangGraph versions, sub-graphs return their entire state rather than a delta on each hop. To prevent duplicate appends when resuming from human checkpoints, PULSE replaces the standard `operator.add` with a custom `dedup_add` reducer to enforce structural equality deduping across execution boundaries.

---

## 🧩 Pod and Agent Breakdown

### 1. Intelligence Pod (Parallel Signal Gathering)
*   **`Nazariya` (Trend Scout)**: Ingests Google News RSS per brand category with a local market lens (Think9's proprietary "Bharat Darshan" Indian consumer framing), spotting active ingredient/trend terms (e.g., ashwagandha, gut-health actives).
*   **`Scroll Sutradhar` (Social Discovery)**: Ingests Reddit JSON and YouTube RSS. Tracks micro-creator candidates and evaluates them against a brand alignment and fit score.
*   **`Bazaar Nazar` (Competitor Scout)**: Calls the **Scrapfly API** (with anti-bot and JS-rendering bypass) to scrape competitor product/catalog pages. Falls back to seeded competitor data if structures change.
*   **`Tara Dhwani` (Celebrity Pulse)**: Scans buzz, sentiment, and alignment indices for Think9's signed celebrity/creator partnerships, raising real-time risk alerts if negative sentiment emerges.

### 2. Synthesis Pod (Strategic Aggregation)
*   **`Consumer Shastra` (Insight Synthesizer)**: Consolidates sparse signals into a structured *Opportunity Brief* mapping out the target consumer tension, the why-now rationale, a confidence score, and a "reactive flag" if triggered by a competitor action.
*   **`Kul Darshan` (Portfolio Rollup)**: Runs a periodic cross-brand scan to compile a *Founder Digest*. Executes the **Cross-Brand Synergy Finder**—a rules-based engine mapping shared audience segments across the portfolio to find bundling/co-marketing opportunities.

### 3. Creative Pod (Reflection Loop)
*   **`Karigar` (The Craftsman)**: Ingests the Opportunity Brief and the brand's master *Brand Bible*. Generates primary ad copy, 2-3 copy-angle variants (emotional, benefit-driven, social proof), and templates detailed prompts for image mockup generation via Pollinations.ai.
*   **`Pehredar` (The Sentinel)**: Audits `Karigar`'s drafts against the *Brand Bible* (scoring tone and catching illegal legal/health claims). If compliance criteria are not met, the system triggers a conditional loop back to `Karigar` (up to 3 iterations) with detailed correction instructions. Every rejection is recorded in the brand's **Compliance Memory** to prevent future mistakes.

---

## 📁 Physical Directory Layout (`Think9_PULSE_Workspace/`)

To guarantee absolute trust and operational observability, every agent writes its outputs directly as physical files to the local file system. 

```
Think9_PULSE_Workspace/
├── 01_Signals/                      # Raw and parsed signals (JSON)
│   ├── news_trends/
│   ├── creator_discovery/
│   └── competitor_scrapes/
├── 02_Briefs/                       # Synthesized Opportunity Briefs (Markdown)
│   └── the_good_bug_opportunity_brief.md
├── 03_Drafts/                       # Unapproved copy & prompt templates (JSON)
├── 04_Media/                        # Generated packaging and product mockups (PNG)
│   └── panchamrit_wellness_mockup.png
├── 05_Approvals/                    # Approved, distribution-ready content (Markdown)
├── 06_Portfolio/                    # Weekly Digests and Synergy Reports
│   └── founder_digest_week_32.md
├── 07_Bibles/                       # Active Brand Bibles and Pitfall Logs
│   └── brand_bible_the_good_bug.json
└── 08_Knowledge_Base/
    ├── token_ledger.db              # SQLite operational cost metrics
    └── decision_log.jsonl           # Mirror of all human overrides/decisions
```

---

## 🚦 The Five Human-in-the-Loop (HITL) Checkpoints

PULSE strictly maintains the boundary: **Agents draft, scan, score, and flag; humans decide**. No external API calls (publishing, creator outreach, or catalog updates) occur without passing a durable LangGraph `interrupt()` boundary.

| # | Checkpoint | Target Operator | System Action Paused |
|---|---|---|---|
| **1** | **Content Approval Gate** | Brand Ops Lead | Writing finalized creative assets to the `/05_Approvals/` workspace directory. |
| **2** | **Celebrity Risk Acknowledge** | PR / Brand Ops | Escalation flows or contract review notifications. |
| **3** | **Creator Outreach Add** | Growth / BD Lead | Sourcing list execution; creators are added to a campaign queue, never auto-contacted. |
| **4** | **Competitor Alert Acknowledge** | Brand Lead | Strategy reassessment; prevents automated pricing/marketing matches. |
| **5** | **Founder Digest Sign-off** | Portfolio Lead | Dissemination of the weekly cross-portfolio digest to team channels. |

---

## 🪙 Governance: Financial & Token Logging

To prevent billing surprises at scale across 30+ brands, all LLM invocations pass through a central **LLM Provider Factory** (`core/llm.py`). This middleware writes detailed transaction rows to a local `token_ledger` SQLite table:
*   `run_id` (UUID)
*   `node_id` (Nazariya, Consumer Shastra, etc.)
*   `prompt_tokens` & `completion_tokens`
*   `estimated_cost_usd` (mapped to commercial rates even when utilizing free-tier endpoints)

These records are aggregated into a running `CostMeter` on the main dashboard and included in the weekly cross-portfolio report.

---

## 🚀 Future-Proof Architecture: Swappable Core Models

The PULSE prototype operates on a **$0 marginal cost structure** utilizing Groq's free-tier API keys, Scrapfly's free credits, and keyless media generation. However, the backend factory is fully swappable with a single environment variable change (`LLM_PROVIDER`) to upgrade to enterprise-grade models:

### Claude (Anthropic)
Upgrading to Claude introduces superior semantic reasoning, crucial for synthesizing high-density opportunity briefs in **Consumer Shastra** and conducting highly strict, nuance-driven brand compliance checks in **Pehredar**.

### Higgsfield
Swapping standard image prompting to Higgsfield enables the generation of high-fidelity, photorealistic packaging mockups and dynamically animated visual assets, moving beyond baseline prompt iterations to premium, production-ready ad creatives.

---

## 📅 30-Day Technical Roadmap (POC to Production Pilot)

```
[ Week 1: Core Infra ] ---> [ Week 2: Scaled Forms ] ---> [ Week 3: Commerce Sync ] ---> [ Week 4: Org Security ]
```

### Week 1: Core Infrastructure Migration
*   **Durable State**: Swap LangGraph's in-memory `MemorySaver` checkpointer for `PostgresSaver` to ensure runs persist across container restarts.
*   **Enterprise Workspace**: Migrate the local file-based `Think9_PULSE_Workspace/` directories to a secure, cloud-native storage solution (AWS S3 or Google Cloud Storage).
*   **Meta Graph API Integration**: Submit for official business verification and replace unstable best-effort Instagram scraping tools with the official Meta API.

### Week 2: Self-Serve Onboarding & Portfolio DB
*   **Onboarding Forms**: Deploy interactive web-based onboarding forms, replacing static JSON config files so brand managers can dynamically edit Brand Bibles, banned legal claims, and tone rules.
*   **Portfolio Database**: Refactor the flat, pairwise directory scan to a relational PostgreSQL data model, enabling high-performance segment searches across 30+ brands.

### Week 3: Inventory Depth & Outreach Channels
*   **Supply Integration**: Introduce supply-chain and inventory-tracking agents into the Synthesis Pod. Factors like stock aging, margin compression, and stockouts are woven into the weekly Founder Digest.
*   **Outbound Delivery**: Connect the Creator Outreach checkpoint to CRM webhooks (e.g., HubSpot, Airtable) and configure Slack integrations for immediate human approval pings.

### Week 4: Governance, Authentication & Audit Logs
*   **Enterprise Access (RBAC)**: Roll out role-based access control (Okta/SAML) separating internal administrators, brand ops managers, and external creator partners.
*   **System Auditing**: Build a comprehensive, immutable ledger tracking all model-suggested decisions alongside corresponding human approvals, rejections, and manual content edits.
*   **Cost Anomalies**: Implement automatic alerting thresholds on the token ledger to capture and block runaway model execution paths or unexpected billing spikes.
```

***

🎨 I have structured this `README.md` to cleanly present both the high-level operational concepts and the detailed technical decisions—such as the custom `dedup_add` reducer—making it ready for production presentation on GitHub. 

 Would you like to review the exact database schemas, SQLite migrations, or the python code mapping out the `dedup_add` reducer logic for the LangGraph state?
