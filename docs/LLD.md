# Think9 PULSE — Low-Level Design

Implementation-level companion to `docs/HLD.md`. This document is the source of truth for exact schemas, exact graph wiring, exact API contract, and exact data shapes — code should match this, and this should be updated the moment code diverges from it.

---

## 1. State Schema (`backend/app/graphs/state.py`)

```python
from typing import TypedDict, Literal, Optional
from typing_extensions import Annotated
import operator

class Signal(TypedDict):
    id: str
    source: Literal["news_rss", "reddit", "youtube", "instagram", "scrapfly_competitor", "seed"]
    mode: Literal["live", "fallback_seeded"]
    brand_category: str
    headline: str
    url: str
    fetched_at: str

class Brief(TypedDict):
    brand_id: str
    tension: str
    why_now: str
    confidence: float
    reactive: bool
    source_signal_ids: list[str]

class ContentDraft(TypedDict):
    copy: str
    image_url: Optional[str]
    ad_variants: list[str]
    iteration: int

class ComplianceResult(TypedDict):
    passed: bool
    score: float
    issues: list[str]

class PulseState(TypedDict):
    run_id: str
    brand_id: str
    signals: Annotated[list[Signal], operator.add]
    brief: Optional[Brief]
    content_drafts: Annotated[list[ContentDraft], operator.add]
    compliance_result: Optional[ComplianceResult]
    iteration_count: int
    human_decision: Optional[Literal["approve", "reject", "request_changes"]]
    celebrity_flags: Annotated[list[dict], operator.add]
    creator_candidates: Annotated[list[dict], operator.add]
    competitor_flags: Annotated[list[dict], operator.add]
    synergy_flags: Annotated[list[dict], operator.add]
    token_usage: Annotated[list[dict], operator.add]
    final_output: Optional[dict]
```

`Annotated[list[X], operator.add]` is LangGraph's reducer pattern: when the Intelligence Pod's four agents run as parallel branches and all write to `signals`, LangGraph concatenates rather than overwrites — required for the parallel fan-out in §3.

**Deviation found during implementation, documented here:** on the installed LangGraph version (`>=1.0`, not the originally-pinned `0.2.39` — that version predates `interrupt()`/`Command`), a compiled Pod used as an Orchestrator node returns its *entire* internal state on each hop, not a delta. Combined with plain `operator.add`, this silently re-concatenates already-accumulated list fields every time a later pod passes an untouched field through (proved via isolated repro: `signals` doubled from 8 to 16, then 32 on resume). Fixed with `app/graphs/reducers.py::dedup_add`, a structural-equality-dedup concat used in place of `operator.add` for every reducer field in `PulseState`. Re-verified: counts stay exact across pod hops and interrupt/resume.

---

## 2. Creative Pod — exact wiring (`backend/app/graphs/pods/creative_pod.py`)

Built and verified with stub nodes before any LLM call (see `docs/HLD.md` §4.2 for why).

```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt, Command
from app.graphs.state import PulseState
from app.agents.creative.karigar import karigar_node
from app.agents.creative.pehredar import pehredar_node

MAX_ITERATIONS = 3

def route_after_guardian(state: PulseState) -> str:
    if state["compliance_result"]["passed"]:
        return "human_approval"
    if state["iteration_count"] >= MAX_ITERATIONS:
        return "human_approval"   # cap hit: surfaced to human flagged "needs manual rewrite"
    return "karigar"

def human_approval_node(state: PulseState) -> dict:
    decision = interrupt({
        "run_id": state["run_id"],
        "draft": state["content_drafts"][-1],
        "compliance": state["compliance_result"],
    })
    return {"human_decision": decision}

def build_creative_pod():
    g = StateGraph(PulseState)
    g.add_node("karigar", karigar_node)
    g.add_node("pehredar", pehredar_node)
    g.add_node("human_approval", human_approval_node)
    g.add_edge(START, "karigar")
    g.add_edge("karigar", "pehredar")
    g.add_conditional_edges("pehredar", route_after_guardian, {
        "karigar": "karigar",
        "human_approval": "human_approval",
    })
    g.add_edge("human_approval", END)
    return g.compile(checkpointer=MemorySaver())
```

Trigger/resume calls:
```python
# trigger
result = compiled.invoke(initial_state, config={"configurable": {"thread_id": run_id}})
# result contains an __interrupt__ payload once execution reaches human_approval

# resume (separate HTTP request, later)
result = compiled.invoke(Command(resume=decision_dict), config={"configurable": {"thread_id": run_id}})
```

Verified reference pattern: `KirtiJha/langgraph-interrupt-workflow-template` (FastAPI `/start` `/resume` `/stream` endpoints over the same `interrupt()`/`Command(resume=...)` mechanic) and `kennethleungty/Human-in-the-Loop-Workflow-LangGraph` (simpler generate→review→approve/reject skeleton) — see `docs/HLD.md` §12 for full citation.

---

## 3. Intelligence Pod — parallel fan-out (`backend/app/graphs/pods/intelligence_pod.py`)

```python
from langgraph.graph import StateGraph, START, END
from app.graphs.state import PulseState
from app.agents.intelligence.nazariya import nazariya_node
from app.agents.intelligence.scroll_sutradhar import scroll_sutradhar_node
from app.agents.intelligence.bazaar_nazar import bazaar_nazar_node
from app.agents.intelligence.tara_dhwani import tara_dhwani_node

def merge_node(state: PulseState) -> dict:
    return {}   # no-op; the `signals`/`*_flags` reducers already merged everything

def build_intelligence_pod():
    g = StateGraph(PulseState)
    g.add_node("nazariya", nazariya_node)
    g.add_node("scroll_sutradhar", scroll_sutradhar_node)
    g.add_node("bazaar_nazar", bazaar_nazar_node)
    g.add_node("tara_dhwani", tara_dhwani_node)
    g.add_node("merge", merge_node)
    for n in ["nazariya", "scroll_sutradhar", "bazaar_nazar", "tara_dhwani"]:
        g.add_edge(START, n)
        g.add_edge(n, "merge")
    g.add_edge("merge", END)
    return g.compile()
```

**P0 note:** ships with only `nazariya` wired (the other three `add_node`/`add_edge` pairs are added in P1, same file, same pattern — no structural change needed, just uncommenting).

---

## 4. Orchestrator — hierarchical composition (`backend/app/graphs/orchestrator.py`)

```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from app.graphs.pods.intelligence_pod import build_intelligence_pod
from app.graphs.pods.synthesis_pod import build_synthesis_pod
from app.graphs.pods.creative_pod import build_creative_pod
from app.graphs.state import PulseState

def build_orchestrator():
    g = StateGraph(PulseState)
    g.add_node("intelligence_pod", build_intelligence_pod())
    g.add_node("synthesis_pod", build_synthesis_pod())
    g.add_node("creative_pod", build_creative_pod())
    g.add_edge(START, "intelligence_pod")
    g.add_edge("intelligence_pod", "synthesis_pod")
    g.add_edge("synthesis_pod", "creative_pod")
    g.add_edge("creative_pod", END)
    return g.compile(checkpointer=MemorySaver())
```

Confirmed valid pattern (compiled `StateGraph` passed directly to `add_node`) per `docs/HLD.md` §12 citation of https://docs.langchain.com/oss/python/langgraph/use-subgraphs — valid because every pod shares `PulseState` (§11 of HLD documents this as a deliberate POC simplification vs per-pod schemas + adapters).

---

## 5. Data Sourcing Tool Contracts (`backend/app/tools/`)

```python
# news_rss.py
def fetch_news_signals(query: str, brand_category: str, limit: int = 5) -> list[Signal]:
    """feedparser.parse(f'https://news.google.com/rss/search?q={quote(query)}') -> Signal[]"""

# social_scan.py
def fetch_reddit_signals(subreddit: str, limit: int = 10) -> list[Signal]:
    """GET https://www.reddit.com/r/{subreddit}/hot.json?limit={limit}, User-Agent header required"""

def fetch_youtube_signals(search_term: str, limit: int = 5) -> list[Signal]:
    """feedparser.parse(f'https://www.youtube.com/feeds/videos.xml?search_query={quote(search_term)}')"""

# instagram_scan.py
def fetch_public_hashtag_posts(hashtag: str, limit: int = 5) -> tuple[list[dict], Literal["live","fallback_seeded"]]:
    """instaloader.Instaloader().get_hashtag_posts(hashtag); wrapped try/except -> honest fallback tag"""

# image_gen.py
def generate_image(prompt: str) -> str:
    """GET https://image.pollinations.ai/prompt/{quote(prompt)}?width=768&height=768&nologo=true -> returns the URL after confirming 200"""

# workspace.py
def write_json(relative_path: str, obj: dict) -> None: ...
def write_text(relative_path: str, content: str) -> None: ...
def list_tree(root: str = "") -> dict: ...   # recursive {name, type, children?} for /workspace/tree
```

Bazaar Nazar calls the Scrapfly API directly (hosted scraping-as-a-service — no subprocess, no separate crawl project; see `docs/HLD.md` §3.1 and §12):

```python
# competitor_scan.py
from scrapfly import ScrapflyClient, ScrapeConfig
from starlette.concurrency import run_in_threadpool

client = ScrapflyClient(key=settings.scrapfly_api_key)

async def fetch_competitor_page(url: str) -> Optional[str]:
    try:
        result = await run_in_threadpool(
            client.scrape, ScrapeConfig(url=url, asp=True, country="IN")
        )
        return result.content   # raw HTML; a small, named parser per allowlisted target extracts price/positioning
    except Exception:
        return None   # caller falls back to competitors_seed.json, tags mode="fallback_seeded"
```
Target URLs are a small, explicitly named allowlist (`backend/app/data/competitor_targets.json` — a handful of product/category pages per relevant brand category), not an open-ended crawler.

---

## 6. LLM Provider Factory (`backend/app/core/llm.py`)

```python
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from app.core.config import settings

def get_chat_model():
    if settings.llm_provider == "groq":
        return ChatGroq(model="llama-3.3-70b-versatile", api_key=settings.groq_api_key, temperature=0.4)
    if settings.llm_provider == "gemini":
        return ChatGoogleGenerativeAI(model="gemini-1.5-flash", google_api_key=settings.google_api_key)
    raise ValueError(f"Unknown LLM_PROVIDER: {settings.llm_provider}")

def track_usage(response, node_name: str, state: dict) -> dict:
    usage = getattr(response, "usage_metadata", None) or {}
    return {
        "token_usage": [{
            "node": node_name,
            "prompt_tokens": usage.get("input_tokens", 0),
            "completion_tokens": usage.get("output_tokens", 0),
        }]
    }
```

`LLM_PROVIDER` env var selects the provider; switching Groq → Gemini/OpenAI is a one-line env change, no code change, per the locked "provider-swappable" constraint.

---

## 7. Seed Data Shapes (`backend/app/data/`)

```jsonc
// brands.json — the 11 real Think9 portfolio brands
[
  {
    "id": "the_good_bug",
    "name": "The Good Bug",
    "category": "wellness",
    "positioning": "science-led synbiotics, Indian gut-health culture",
    "tone": ["credible", "warm", "non-clinical"],
    "banned_claims": ["cures", "guaranteed results", "FDA approved"],
    "consumer_segments": ["gut_health", "premium"],
    "known_pitfalls": []
  },
  { "id": "superyou", "name": "SuperYou", "category": "nutrition", "positioning": "protein via everyday snack formats", "tone": ["playful", "confident"], "banned_claims": ["clinically proven", "instant results"], "consumer_segments": ["protein_snacking"], "known_pitfalls": [] }
  // ... panchamrit, neude, beauty_by_bie, kingdom_of_white, anaar, foodstories,
  //     broadway, amar_chitra_katha, tinkle — same shape, real names from perplexity-chat.md
]

// celebrities.json — illustrative, explicitly marked seed
[
  { "id": "partner_1", "display_name": "Seed Partner A", "brand_id": "neude", "seed": true, "baseline_sentiment": 0.72, "risk_flag": null }
]

// creators_seed.json
[
  { "id": "creator_1", "handle": "seed_creator_a", "platform": "youtube", "category": "wellness", "fit_score": 0.81, "seed": true }
]

// competitors_seed.json
[
  { "id": "comp_1", "name": "Seed Competitor A", "brand_category": "wellness", "price_range": "Rs.499-Rs.999", "positioning": "budget synbiotic", "seed": true }
]

// performance_seed.json
[
  { "brand_id": "the_good_bug", "week": "2026-W31", "approved_content_count": 4, "avg_compliance_score": 0.88 }
]
```

---

## 8. API Contract (`backend/app/api/routes.py`)

| Method | Path | Request body | Response body |
|---|---|---|---|
| GET | `/brands` | - | `Brand[]` |
| POST | `/pipeline/run` | `{"brand_id": str, "trigger": "manual"|"scheduled"}` | `{"run_id": str, "status": "paused_for_approval"|"completed"}` |
| GET | `/pipeline/{run_id}` | - | current `PulseState` snapshot (for polling `ContentPipeline.tsx`'s trace view) |
| POST | `/pipeline/{run_id}/approve` | `{"decision": "approve"|"reject"|"request_changes", "notes": str?}` | `{"run_id": str, "status": str, "final_output": dict?}` |
| GET | `/celebrities` | - | seeded + live-enriched partner list |
| GET | `/creators` | - | Scroll Sutradhar shortlist |
| POST | `/creators/{id}/outreach` | - | `{"id": str, "outreach_added": true}` |
| GET | `/competitors/{brand_id}` | - | Bazaar Nazar flags for that brand |
| GET | `/stakeholder/{partner_id}` | - | partner-facing overview |
| GET | `/digest/latest` | - | Kul Darshan's latest digest incl. synergy_map and cost summary |
| POST | `/digest/publish` | - | `{"published": true, "published_at": str}` |
| GET | `/workspace/tree` | - | recursive `{name, type, children?}` tree for `WorkspaceBrowser.tsx` |
| GET | `/workspace/file?path=` | query param `path` | raw file content (text/json/image) for preview |
| GET | `/costs/summary` | - | `{"total_tokens": int, "estimated_cost_usd": float, "by_node": dict}` |

All routes CORS-scoped to `CORS_ORIGINS` from `.env` (the deployed Vercel origin), not wildcard, per `docs/HLD.md` §10.

---

## 9. SQLite Schema (`backend/app/store.py`)

```sql
CREATE TABLE runs (
    run_id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL,
    status TEXT NOT NULL,        -- 'running' | 'paused_for_approval' | 'completed' | 'rejected'
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE token_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    node TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    ts TEXT NOT NULL
);

CREATE TABLE decision_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    checkpoint TEXT NOT NULL,    -- 'content_approval' | 'celebrity_risk' | 'creator_outreach' | 'competitor_alert' | 'digest_signoff'
    decision TEXT NOT NULL,
    notes TEXT,
    ts TEXT NOT NULL
);
```
`decision_log` rows are also mirrored to `08_Knowledge_Base/decision_log.jsonl` in the Workspace on write (append both, single source function in `store.py`).

---

## 10. Frontend Contract Notes

- `AgentGraphViz` built on `@xyflow/react` (current package — `reactflow` is the frozen v11 predecessor, not used; confirmed in `docs/HLD.md` §12). Custom node types render pod groupings; edge `animated: true` + a style toggle keyed off `PulseState.iteration_count` produces the Pehredar->Karigar loop-back animation — no off-the-shelf "LangGraph visualizer" component exists, this is built, not adopted.
- `ContentPipeline.tsx` polls `GET /pipeline/{run_id}` (simple interval poll for the POC; SSE via `/pipeline/{run_id}/stream` named as a Week 1 roadmap upgrade, not built now — polling is sufficient for a live demo and meaningfully less code).
- `WorkspaceBrowser.tsx` + `FolderTree` component render `GET /workspace/tree` recursively; clicking a file calls `GET /workspace/file?path=`.
- `CostMeter.tsx` polls `GET /costs/summary` on the same interval as the pipeline poll.
- `Feed Customizer` (part of `SignalFeed`) is a client-side filter over the same `/pipeline/{run_id}` / signal data — session-local `localStorage` preference, no new backend endpoint needed for the POC.

---

## 11. Compliance Memory — exact mechanic

```python
# pehredar.py, on a failed compliance check:
def append_known_pitfall(brand_id: str, issue: str) -> None:
    brand = load_brand(brand_id)
    if issue not in brand["known_pitfalls"]:
        brand["known_pitfalls"].append(issue)
        save_brand(brand_id, brand)   # writes back to data/brands.json AND 04_Brand_Bibles/{brand}.json
```
Karigar's prompt includes `brand["known_pitfalls"]` as an explicit "avoid these, seen before" list on every subsequent run for that brand — the loop gets measurably stricter over the demo's lifetime without a separate ML/embedding step.

---

## 12. Synergy Finder — exact mechanic

Rule-based, not LLM-based (deliberately cheap and deterministic):
```python
def find_synergies(brands: list[Brand]) -> list[dict]:
    flags = []
    for a, b in itertools.combinations(brands, 2):
        shared = set(a["consumer_segments"]) & set(b["consumer_segments"])
        if shared:
            flags.append({"brand_a": a["id"], "brand_b": b["id"], "shared_segments": list(shared),
                          "suggestion": f"{a['name']} and {b['name']} share {', '.join(shared)} - consider cross-promotion or Broadway bundling"})
    return flags
```
`consumer_segments` is a small field on each brand's seed JSON (e.g. `["gut_health", "premium"]`), populated from the real portfolio-pattern analysis already done in `perplexity-chat.md` (e.g. The Good Bug + Panchamrit both tag `gut_health`).
