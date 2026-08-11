"""FastAPI routes — exact contract from docs/LLD.md §8."""
import json
import uuid

from fastapi import APIRouter, HTTPException
from langgraph.types import Command
from pydantic import BaseModel

from app import store
from app.agents.intelligence.tara_dhwani import get_all_celebrities
from app.agents.synthesis.kul_darshan import build_digest
from app.core.llm import get_meter_snapshot
from app.data.brands_store import load_all_brands, load_brand
from app.graphs.orchestrator import get_orchestrator
from app.tools.competitor_scan import fetch_competitor_snapshot
from app.tools.workspace import list_tree, read_text

# category -> subreddits to sweep for GET /social/{brand_category} (mapped from the real
# categories in data/brands.json: wellness, nutrition, fashion, beauty, luxury_fashion, food,
# retail, cultural_media, childrens_media). Unmapped categories fall back to a generic list.
SUBREDDITS_BY_CATEGORY = {
    "wellness": ["guthealth", "supplements", "HealthyFood"],
    "nutrition": ["nutrition", "loseit"],
    "beauty": ["SkincareAddiction", "IndianSkincareAddicts"],
    "fashion": ["malefashionadvice", "IndianFashionAddicts"],
    "luxury_fashion": ["malefashionadvice", "handbags"],
    "food": ["food", "FoodPorn"],
    "retail": ["retail", "smallbusiness"],
    "cultural_media": ["IndiaSpeaks", "india"],
    "childrens_media": ["Parenting", "toddlers"],
}
DEFAULT_SUBREDDITS = ["india", "smallbusiness"]

# illustrative "if this were paid-tier" rate table (docs/HLD.md §9) — Groq's free tier is
# actually $0; this is purely so cost visibility exists before the portfolio scales past it.
ILLUSTRATIVE_RATE_USD_PER_1K_TOKENS = 0.00059  # Llama-3.3-70B-class blended rate, illustrative only

router = APIRouter()


class RunRequest(BaseModel):
    brand_id: str
    trigger: str = "manual"


class ApproveRequest(BaseModel):
    decision: str  # "approve" | "reject" | "request_changes"
    notes: str | None = None


def _config(run_id: str) -> dict:
    return {"configurable": {"thread_id": run_id}}


def _log_tokens(run_id: str, token_usage: list[dict]) -> None:
    for t in token_usage or []:
        store.log_token_usage(run_id, t.get("node", "unknown"), t.get("prompt_tokens", 0), t.get("completion_tokens", 0))


def _initial_state(run_id: str, brand_id: str) -> dict:
    return {
        "run_id": run_id, "brand_id": brand_id, "signals": [], "brief": None,
        "content_drafts": [], "compliance_result": None, "iteration_count": 0,
        "human_decision": None, "celebrity_flags": [], "creator_candidates": [],
        "competitor_flags": [], "synergy_flags": [], "token_usage": [], "final_output": None,
    }


@router.get("/brands")
def get_brands():
    return load_all_brands()


@router.post("/pipeline/run")
def run_pipeline(req: RunRequest):
    if load_brand(req.brand_id) is None:
        raise HTTPException(status_code=404, detail=f"unknown brand_id: {req.brand_id}")

    run_id = str(uuid.uuid4())
    store.create_run(run_id, req.brand_id, "running")

    orchestrator = get_orchestrator()
    result = orchestrator.invoke(_initial_state(run_id, req.brand_id), config=_config(run_id))
    _log_tokens(run_id, result.get("token_usage", []))

    status = "paused_for_approval" if "__interrupt__" in result else "completed"
    store.update_run_status(run_id, status)
    return {"run_id": run_id, "status": status}


@router.get("/pipeline/{run_id}")
def get_pipeline(run_id: str):
    run = store.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="unknown run_id")
    orchestrator = get_orchestrator()
    snapshot = orchestrator.get_state(_config(run_id))
    state = dict(snapshot.values)

    # While paused inside creative_pod, interrupt() suspends human_approval_node mid-execution
    # without returning, so the Creative Pod subgraph's own content_drafts/compliance_result
    # channel writes never propagate up into the parent Orchestrator's checkpointed state
    # (channels only merge when a node/subgraph *returns*). The exact in-flight payload
    # human_approval_node passed to interrupt() — {"draft":..., "compliance":...} — is still
    # available on the snapshot's `interrupts` tuple, so surface it from there while paused.
    if snapshot.interrupts:
        payload = snapshot.interrupts[0].value
        if not state.get("content_drafts") and payload.get("draft"):
            state["content_drafts"] = [payload["draft"]]
        if state.get("compliance_result") is None and payload.get("compliance"):
            state["compliance_result"] = payload["compliance"]

    state["_run_status"] = run["status"]
    state["_paused"] = bool(snapshot.next)
    return state


@router.post("/pipeline/{run_id}/approve")
def approve_pipeline(run_id: str, req: ApproveRequest):
    run = store.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="unknown run_id")
    if req.decision not in ("approve", "reject", "request_changes"):
        raise HTTPException(status_code=400, detail="decision must be approve|reject|request_changes")

    orchestrator = get_orchestrator()
    result = orchestrator.invoke(Command(resume=req.decision), config=_config(run_id))
    _log_tokens(run_id, result.get("token_usage", []))

    store.log_decision(run_id, "content_approval", req.decision, req.notes)

    status = "completed" if req.decision == "approve" else "rejected"
    store.update_run_status(run_id, status)

    final_output = None
    if result.get("content_drafts"):
        final_output = {
            "brand_id": result["brand_id"],
            "draft": result["content_drafts"][-1],
            "compliance": result.get("compliance_result"),
            "decision": req.decision,
        }
    return {"run_id": run_id, "status": status, "final_output": final_output}


# --- P1/P2 stubs: implemented enough to never crash the frontend, not real yet ---

@router.get("/celebrities")
def get_celebrities():
    return get_all_celebrities()


@router.get("/creators")
def get_creators():
    """Aggregates the latest Scroll Sutradhar shortlist written per category during pipeline
    runs (07_Creator_Outreach/*.json) — empty until at least one run has scanned that category."""
    tree = list_tree("07_Creator_Outreach")
    creators = []
    for entry in tree.get("children", []):
        if entry["type"] != "file":
            continue
        try:
            data = json.loads(read_text(f"07_Creator_Outreach/{entry['name']}"))
            creators += data.get("creator_candidates", [])
        except Exception:
            continue
    return creators


@router.post("/creators/{creator_id}/outreach")
def add_creator_outreach(creator_id: str):
    return {"id": creator_id, "outreach_added": True}


@router.get("/competitors/{brand_id}")
def get_competitors(brand_id: str):
    brand = load_brand(brand_id)
    if brand is None:
        raise HTTPException(status_code=404, detail=f"unknown brand_id: {brand_id}")
    flags, mode = fetch_competitor_snapshot(brand["category"])
    return {"brand_id": brand_id, "mode": mode, "competitor_flags": flags}


@router.get("/stakeholder/{partner_id}")
def get_stakeholder(partner_id: str):
    raise HTTPException(status_code=404, detail="stakeholder dashboards are P2, not built yet")


@router.get("/digest/latest")
def get_digest_latest():
    return build_digest()


@router.post("/digest/publish")
def publish_digest():
    from datetime import datetime, timezone
    return {"published": True, "published_at": datetime.now(timezone.utc).isoformat()}


COST_NOTE = ("Groq free tier means actual spend is $0. estimated_cost_usd is illustrative only — "
             f"computed at a paid-tier rate of ${ILLUSTRATIVE_RATE_USD_PER_1K_TOKENS}/1K tokens "
             "(Llama-3.3-70B-class blended rate), useful once this scales across 30+ brands.")


def _token_ledger_summary() -> tuple[dict, int, float]:
    """Shared by /costs/summary and /meter — one query against token_ledger, not two."""
    conn = store.get_conn()
    rows = conn.execute("SELECT node, SUM(prompt_tokens) AS pt, SUM(completion_tokens) AS ct FROM token_ledger GROUP BY node").fetchall()
    conn.close()
    by_node = {r["node"]: {"prompt_tokens": r["pt"], "completion_tokens": r["ct"]} for r in rows}
    total_tokens = sum(v["prompt_tokens"] + v["completion_tokens"] for v in by_node.values())
    estimated_cost_usd = round((total_tokens / 1000) * ILLUSTRATIVE_RATE_USD_PER_1K_TOKENS, 6)
    return by_node, total_tokens, estimated_cost_usd


@router.get("/costs/summary")
def get_costs_summary():
    by_node, total_tokens, estimated_cost_usd = _token_ledger_summary()
    return {
        "total_tokens": total_tokens,
        "estimated_cost_usd": estimated_cost_usd,
        "by_node": by_node,
        "note": COST_NOTE,
    }


@router.get("/meter")
def get_meter():
    by_node, total_tokens, estimated_cost_usd = _token_ledger_summary()
    prompt_tokens = sum(v["prompt_tokens"] for v in by_node.values())
    completion_tokens = sum(v["completion_tokens"] for v in by_node.values())
    return {
        "tokens": {"prompt": prompt_tokens, "completion": completion_tokens, "total": total_tokens},
        "by_node": by_node,
        "rate_limit": get_meter_snapshot(),
        "estimated_cost_usd": estimated_cost_usd,
        "cost_note": COST_NOTE,
    }


@router.get("/runs")
def get_runs(status: str | None = None):
    conn = store.get_conn()
    if status:
        rows = conn.execute(
            "SELECT run_id, brand_id, status, created_at, updated_at FROM runs WHERE status = ? ORDER BY created_at DESC",
            (status,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT run_id, brand_id, status, created_at, updated_at FROM runs ORDER BY created_at DESC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


MARKET_MOCK_KEYWORDS = {
    "the_good_bug": [
        {"keyword": "best probiotic supplement india", "rank": 1},
        {"keyword": "synbiotic for gut health", "rank": 2},
        {"keyword": "gut microbiome supplement", "rank": 3},
        {"keyword": "the good bug probiotic review", "rank": 4},
        {"keyword": "probiotics for bloating india", "rank": 5},
        {"keyword": "science-backed gut supplement", "rank": 6},
        {"keyword": "gut health capsules india", "rank": 7},
        {"keyword": "daily probiotic supplement", "rank": 8},
    ],
    "panchamrit": [
        {"keyword": "ayurvedic gut health supplement", "rank": 1},
        {"keyword": "panchamrit wellness gummies", "rank": 2},
        {"keyword": "ayurveda immunity supplement india", "rank": 3},
        {"keyword": "natural sleep supplement ayurveda", "rank": 4},
        {"keyword": "ashwagandha immunity booster", "rank": 5},
        {"keyword": "ayurvedic digestive supplement", "rank": 6},
    ],
    "superyou": [
        {"keyword": "high protein snack bar india", "rank": 1},
        {"keyword": "protein cookies gen z", "rank": 2},
        {"keyword": "superyou protein snack review", "rank": 3},
        {"keyword": "healthy protein snacks india", "rank": 4},
        {"keyword": "best protein bars india 2024", "rank": 5},
        {"keyword": "protein snacks for students", "rank": 6},
        {"keyword": "low sugar protein bar india", "rank": 7},
    ],
    "kingdom_of_white": [
        {"keyword": "premium white shirts for men india", "rank": 1},
        {"keyword": "minimalist menswear india", "rank": 2},
        {"keyword": "white linen shirt men india", "rank": 3},
        {"keyword": "kingdom of white menswear", "rank": 4},
        {"keyword": "luxury men's white clothing", "rank": 5},
        {"keyword": "occasion white trousers india", "rank": 6},
    ],
    "neude": [
        {"keyword": "milk based skincare india", "rank": 1},
        {"keyword": "heritage beauty brand india", "rank": 2},
        {"keyword": "neude skincare review", "rank": 3},
        {"keyword": "clean beauty indian brand", "rank": 4},
        {"keyword": "ayurvedic modern skincare", "rank": 5},
        {"keyword": "skin barrier repair serum india", "rank": 6},
        {"keyword": "sensorial skincare india", "rank": 7},
    ],
    "beauty_by_bie": [
        {"keyword": "cruelty free skincare india", "rank": 1},
        {"keyword": "transparent ingredient skincare", "rank": 2},
        {"keyword": "clean beauty india 2024", "rank": 3},
        {"keyword": "vegan skincare brand india", "rank": 4},
        {"keyword": "science backed skincare india", "rank": 5},
        {"keyword": "acne skincare routine india", "rank": 6},
    ],
    "anaar": [
        {"keyword": "bridal juttis zardozi india", "rank": 1},
        {"keyword": "luxury wedding footwear india", "rank": 2},
        {"keyword": "anaar bridal shoes review", "rank": 3},
        {"keyword": "embroidered wedding shoes india", "rank": 4},
        {"keyword": "zardozi embroidery shoes", "rank": 5},
        {"keyword": "comfortable bridal heels india", "rank": 6},
    ],
    "foodstories": [
        {"keyword": "gourmet grocery delivery india", "rank": 1},
        {"keyword": "organic food online india", "rank": 2},
        {"keyword": "artisanal food products india", "rank": 3},
        {"keyword": "premium grocery delivery mumbai", "rank": 4},
        {"keyword": "international ingredients india", "rank": 5},
        {"keyword": "specialty food store online india", "rank": 6},
    ],
    "broadway": [
        {"keyword": "experiential retail india", "rank": 1},
        {"keyword": "D2C brand offline store india", "rank": 2},
        {"keyword": "broadway retail bangalore", "rank": 3},
        {"keyword": "multi brand beauty store india", "rank": 4},
        {"keyword": "discover new brands offline india", "rank": 5},
    ],
    "amar_chitra_katha": [
        {"keyword": "amar chitra katha comics online", "rank": 1},
        {"keyword": "indian mythology comics", "rank": 2},
        {"keyword": "ACK digital subscription", "rank": 3},
        {"keyword": "indian history comics children", "rank": 4},
        {"keyword": "folklore animation india", "rank": 5},
        {"keyword": "amar chitra katha app", "rank": 6},
    ],
    "tinkle": [
        {"keyword": "tinkle comics subscription", "rank": 1},
        {"keyword": "suppandi comics online", "rank": 2},
        {"keyword": "indian children's comics digital", "rank": 3},
        {"keyword": "tinkle magazine app", "rank": 4},
        {"keyword": "kids comics india 2024", "rank": 5},
        {"keyword": "wholesome comics for children india", "rank": 6},
    ],
}

MARKET_MOCK_COMPETITORS = {
    "wellness": [
        {"name": "Wellbeing Nutrition", "positioning": "Clinical-grade supplements with global certifications", "threat_level": "high", "instagram_followers": 245000},
        {"name": "Oziva", "positioning": "Plant-based protein and wellness for Indian lifestyles", "threat_level": "high", "instagram_followers": 380000},
        {"name": "Kapiva", "positioning": "Ayurvedic wellness brand with modern packaging", "threat_level": "medium", "instagram_followers": 150000},
        {"name": "BBETTER", "positioning": "Everyday wellness supplements, D2C focused", "threat_level": "medium", "instagram_followers": 62000},
    ],
    "nutrition": [
        {"name": "RiteBite Max Protein", "positioning": "Mass-market protein snack leader", "threat_level": "high", "instagram_followers": 290000},
        {"name": "Yogabar", "positioning": "Healthy snack bars with strong D2C presence", "threat_level": "high", "instagram_followers": 420000},
        {"name": "True Elements", "positioning": "Whole grain, millet-based healthy snacks", "threat_level": "medium", "instagram_followers": 178000},
    ],
    "fashion": [
        {"name": "Bombay Shirt Company", "positioning": "Customisable premium shirts, India's leader", "threat_level": "high", "instagram_followers": 320000},
        {"name": "Andamen", "positioning": "Luxury casual menswear, European fabrics", "threat_level": "high", "instagram_followers": 180000},
        {"name": "The Pant Project", "positioning": "Custom-fit trousers D2C", "threat_level": "medium", "instagram_followers": 95000},
    ],
    "beauty": [
        {"name": "Minimalist", "positioning": "Evidence-based skincare, clinical actives", "threat_level": "high", "instagram_followers": 890000},
        {"name": "Plum Goodness", "positioning": "100% vegan, affordable clean beauty", "threat_level": "high", "instagram_followers": 540000},
        {"name": "Dot & Key", "positioning": "Fun, functional skincare for Gen Z", "threat_level": "medium", "instagram_followers": 430000},
        {"name": "Pilgrim", "positioning": "Global beauty secrets, Korean and French actives", "threat_level": "medium", "instagram_followers": 265000},
    ],
    "luxury_fashion": [
        {"name": "Fizzy Goblet", "positioning": "Designer Indian footwear, occasion wear", "threat_level": "high", "instagram_followers": 210000},
        {"name": "Needledust", "positioning": "Handcrafted embroidered footwear", "threat_level": "medium", "instagram_followers": 88000},
        {"name": "Kalki Fashion", "positioning": "Luxury Indian bridal wear", "threat_level": "low", "instagram_followers": 670000},
    ],
    "food": [
        {"name": "Conscious Food", "positioning": "Organic staples and superfoods", "threat_level": "medium", "instagram_followers": 72000},
        {"name": "The Gourmet Shop", "positioning": "Curated specialty foods and imports", "threat_level": "medium", "instagram_followers": 48000},
        {"name": "Qtrove", "positioning": "Natural, artisanal, and organic marketplace", "threat_level": "low", "instagram_followers": 35000},
    ],
    "retail": [
        {"name": "Nykaa (offline)", "positioning": "Beauty retail powerhouse, 100+ stores", "threat_level": "high", "instagram_followers": 2800000},
        {"name": "Supari Studios", "positioning": "Experience-led creative retail spaces", "threat_level": "medium", "instagram_followers": 145000},
        {"name": "The Collective", "positioning": "Luxury multi-brand offline retail", "threat_level": "medium", "instagram_followers": 210000},
    ],
    "cultural_media": [
        {"name": "Chandamama (digital)", "positioning": "Legacy children's magazine, digital revival", "threat_level": "medium", "instagram_followers": 95000},
        {"name": "Campfire Comics", "positioning": "Graphic novel adaptations of classics", "threat_level": "low", "instagram_followers": 42000},
    ],
    "childrens_media": [
        {"name": "Champak", "positioning": "Bilingual children's magazine with wide reach", "threat_level": "high", "instagram_followers": 180000},
        {"name": "Masha and the Bear (India)", "positioning": "Global animation IP with strong Indian following", "threat_level": "medium", "instagram_followers": 320000},
    ],
}

MARKET_MOCK_INTEREST = {
    "the_good_bug": [
        {"date": "2024-08-01", "views": 8200}, {"date": "2024-08-05", "views": 9100},
        {"date": "2024-08-09", "views": 10400}, {"date": "2024-08-13", "views": 11800},
        {"date": "2024-08-17", "views": 10200}, {"date": "2024-08-21", "views": 13500},
        {"date": "2024-08-25", "views": 14100}, {"date": "2024-08-29", "views": 15800},
        {"date": "2024-09-02", "views": 16400}, {"date": "2024-09-06", "views": 18200},
    ],
    "panchamrit": [
        {"date": "2024-08-01", "views": 6100}, {"date": "2024-08-05", "views": 6800},
        {"date": "2024-08-09", "views": 7200}, {"date": "2024-08-13", "views": 8500},
        {"date": "2024-08-17", "views": 7900}, {"date": "2024-08-21", "views": 9200},
        {"date": "2024-08-25", "views": 9800}, {"date": "2024-08-29", "views": 10600},
    ],
    "superyou": [
        {"date": "2024-08-01", "views": 5200}, {"date": "2024-08-05", "views": 7800},
        {"date": "2024-08-09", "views": 9400}, {"date": "2024-08-13", "views": 12200},
        {"date": "2024-08-17", "views": 11000}, {"date": "2024-08-21", "views": 14500},
        {"date": "2024-08-25", "views": 16800}, {"date": "2024-08-29", "views": 18100},
    ],
    "kingdom_of_white": [
        {"date": "2024-08-01", "views": 4100}, {"date": "2024-08-05", "views": 4800},
        {"date": "2024-08-09", "views": 5700}, {"date": "2024-08-13", "views": 7200},
        {"date": "2024-08-17", "views": 8900}, {"date": "2024-08-21", "views": 10500},
        {"date": "2024-08-25", "views": 12800}, {"date": "2024-08-29", "views": 14200},
    ],
    "neude": [
        {"date": "2024-08-01", "views": 7400}, {"date": "2024-08-05", "views": 8900},
        {"date": "2024-08-09", "views": 9800}, {"date": "2024-08-13", "views": 11200},
        {"date": "2024-08-17", "views": 12600}, {"date": "2024-08-21", "views": 14800},
        {"date": "2024-08-25", "views": 16200}, {"date": "2024-08-29", "views": 17900},
    ],
    "beauty_by_bie": [
        {"date": "2024-08-01", "views": 5200}, {"date": "2024-08-05", "views": 6400},
        {"date": "2024-08-09", "views": 7800}, {"date": "2024-08-13", "views": 9100},
        {"date": "2024-08-17", "views": 8400}, {"date": "2024-08-21", "views": 11200},
        {"date": "2024-08-25", "views": 12800}, {"date": "2024-08-29", "views": 14500},
    ],
    "anaar": [
        {"date": "2024-08-01", "views": 9800}, {"date": "2024-08-05", "views": 12500},
        {"date": "2024-08-09", "views": 15800}, {"date": "2024-08-13", "views": 21400},
        {"date": "2024-08-17", "views": 19200}, {"date": "2024-08-21", "views": 24800},
        {"date": "2024-08-25", "views": 28600}, {"date": "2024-08-29", "views": 31200},
    ],
    "foodstories": [
        {"date": "2024-08-01", "views": 3800}, {"date": "2024-08-05", "views": 4200},
        {"date": "2024-08-09", "views": 4600}, {"date": "2024-08-13", "views": 5100},
        {"date": "2024-08-17", "views": 5400}, {"date": "2024-08-21", "views": 6200},
        {"date": "2024-08-25", "views": 6800}, {"date": "2024-08-29", "views": 7400},
    ],
    "broadway": [
        {"date": "2024-08-01", "views": 15200}, {"date": "2024-08-05", "views": 18400},
        {"date": "2024-08-09", "views": 22600}, {"date": "2024-08-13", "views": 28800},
        {"date": "2024-08-17", "views": 26200}, {"date": "2024-08-21", "views": 32500},
        {"date": "2024-08-25", "views": 38400}, {"date": "2024-08-29", "views": 42100},
    ],
    "amar_chitra_katha": [
        {"date": "2024-08-01", "views": 22400}, {"date": "2024-08-05", "views": 24800},
        {"date": "2024-08-09", "views": 28200}, {"date": "2024-08-13", "views": 31600},
        {"date": "2024-08-17", "views": 29400}, {"date": "2024-08-21", "views": 34200},
        {"date": "2024-08-25", "views": 36800}, {"date": "2024-08-29", "views": 40100},
    ],
    "tinkle": [
        {"date": "2024-08-01", "views": 18600}, {"date": "2024-08-05", "views": 21200},
        {"date": "2024-08-09", "views": 23800}, {"date": "2024-08-13", "views": 27400},
        {"date": "2024-08-17", "views": 25200}, {"date": "2024-08-21", "views": 30600},
        {"date": "2024-08-25", "views": 33200}, {"date": "2024-08-29", "views": 36800},
    ],
}


@router.get("/market/{brand_id}")
def get_market(brand_id: str):
    brand = load_brand(brand_id)
    if brand is None:
        raise HTTPException(status_code=404, detail=f"unknown brand_id: {brand_id}")

    from app.tools.market_data import article_for_category, fetch_keyword_demand, fetch_pageview_series

    segments = brand.get("consumer_segments") or []
    seed = segments[0].replace("_", " ") if segments else brand["category"]

    interest = fetch_pageview_series(article_for_category(brand["category"]))
    keywords = fetch_keyword_demand(seed)
    competitor_flags, competitor_mode = fetch_competitor_snapshot(brand["category"])

    # Enrich with mock data if live data is sparse / fallback
    mock_interest = MARKET_MOCK_INTEREST.get(brand_id, [])
    if mock_interest and (interest.get("mode") != "live" or len(interest.get("series", [])) < 3):
        interest = {"article": article_for_category(brand["category"]), "mode": "seeded", "series": mock_interest}

    mock_keywords = MARKET_MOCK_KEYWORDS.get(brand_id, [])
    if mock_keywords and (keywords.get("mode") != "live" or len(keywords.get("keywords", [])) < 3):
        keywords = {"seed": seed, "mode": "seeded", "keywords": mock_keywords}

    mock_competitors = MARKET_MOCK_COMPETITORS.get(brand["category"], [])
    if mock_competitors and (competitor_mode != "live" or not competitor_flags):
        competitor_flags = mock_competitors
        competitor_mode = "seeded"

    return {
        "brand_id": brand_id,
        "brand_name": brand["name"],
        "category": brand["category"],
        "mode": interest["mode"],
        "interest": interest,
        "keywords": keywords,
        "competitors": {"mode": competitor_mode, "competitor_flags": competitor_flags},
    }


# ---------------------------------------------------------------------------
# NOTE: MOCK DATA — Instagram / Reels analytics
# ---------------------------------------------------------------------------
# All follower counts, engagement rates, growth histories, and reel stats below
# are seeded demo values used for the Social Pulse content-strategist demo video.
# In production these would be replaced by calls to the Instagram Graph API
# (https://developers.facebook.com/docs/instagram-api/) authenticated per brand.
# Fields match the InstaBrand interface defined in frontend/src/pages/SocialPulse.tsx.
# ---------------------------------------------------------------------------
INSTAGRAM_MOCK_DATA = {
    "wellness": [
        {
            "brand_id": "the_good_bug",
            "brand_name": "The Good Bug",
            "followers": 125000,
            "growth_rate": "+4.8%",
            "avg_reels_views": 45200,
            "avg_reels_likes": 2100,
            "avg_reels_shares": 820,
            "engagement_rate": "5.6%",
            "follower_growth_history": [
                {"date": "08-01", "value": 121000},
                {"date": "08-03", "value": 122000},
                {"date": "08-05", "value": 122800},
                {"date": "08-07", "value": 123500},
                {"date": "08-09", "value": 124200},
                {"date": "08-11", "value": 125000}
            ],
            "top_reels": [
                {
                    "caption": "Your gut controls more than just digestion! Here is the science behind synbiotics. #guthealth #wellness",
                    "views": 182000,
                    "likes": 9800,
                    "shares": 3400,
                    "comments": 420,
                    "thumbnail_url": "https://picsum.photos/seed/goodbug1/400/600"
                },
                {
                    "caption": "Bloated after every meal? Fix your gut microbiome with these daily habits! #healthtips #guthealth",
                    "views": 95000,
                    "likes": 4200,
                    "shares": 1200,
                    "comments": 150,
                    "thumbnail_url": "https://picsum.photos/seed/goodbug2/400/600"
                }
            ]
        },
        {
            "brand_id": "panchamrit",
            "brand_name": "Panchamrit",
            "followers": 85000,
            "growth_rate": "+3.2%",
            "avg_reels_views": 32000,
            "avg_reels_likes": 1400,
            "avg_reels_shares": 450,
            "engagement_rate": "4.1%",
            "follower_growth_history": [
                {"date": "08-01", "value": 82500},
                {"date": "08-03", "value": 83000},
                {"date": "08-05", "value": 83600},
                {"date": "08-07", "value": 84100},
                {"date": "08-09", "value": 84500},
                {"date": "08-11", "value": 85000}
            ],
            "top_reels": [
                {
                    "caption": "Modern lifestyle meets ancient Ayurvedic wisdom. Recharge your immunity with Panchamrit gummies! #ayurveda #lifestyle",
                    "views": 110000,
                    "likes": 5600,
                    "shares": 1800,
                    "comments": 280,
                    "thumbnail_url": "https://picsum.photos/seed/panch1/400/600"
                },
                {
                    "caption": "Struggling with sleep? This simple nightly ritual will help you wake up refreshed! #sleepwell #ayurveda",
                    "views": 68000,
                    "likes": 2900,
                    "shares": 850,
                    "comments": 95,
                    "thumbnail_url": "https://picsum.photos/seed/panch2/400/600"
                }
            ]
        }
    ],
    "nutrition": [
        {
            "brand_id": "superyou",
            "brand_name": "SuperYou",
            "followers": 94000,
            "growth_rate": "+6.1%",
            "avg_reels_views": 52000,
            "avg_reels_likes": 2800,
            "avg_reels_shares": 1100,
            "engagement_rate": "6.5%",
            "follower_growth_history": [
                {"date": "08-01", "value": 89000},
                {"date": "08-03", "value": 90100},
                {"date": "08-05", "value": 91200},
                {"date": "08-07", "value": 92300},
                {"date": "08-09", "value": 93100},
                {"date": "08-11", "value": 94000}
            ],
            "top_reels": [
                {
                    "caption": "Say goodbye to chalky protein powders! Meet the future of high-protein snacking. #protein #fitnessgoals #healthysnacks",
                    "views": 154000,
                    "likes": 8700,
                    "shares": 2400,
                    "comments": 310,
                    "thumbnail_url": "https://picsum.photos/seed/superyou1/400/600"
                },
                {
                    "caption": "Keep it playful, keep it protein-packed. Grab a SuperYou bar on the go! #fitness #activelifestyle",
                    "views": 82000,
                    "likes": 3900,
                    "shares": 950,
                    "comments": 120,
                    "thumbnail_url": "https://picsum.photos/seed/superyou2/400/600"
                }
            ]
        }
    ],
    "fashion": [
        {
            "brand_id": "kingdom_of_white",
            "brand_name": "Kingdom of White",
            "followers": 180000,
            "growth_rate": "+7.4%",
            "avg_reels_views": 85000,
            "avg_reels_likes": 4800,
            "avg_reels_shares": 1600,
            "engagement_rate": "7.2%",
            "follower_growth_history": [
                {"date": "08-01", "value": 168000},
                {"date": "08-03", "value": 170500},
                {"date": "08-05", "value": 172900},
                {"date": "08-07", "value": 175000},
                {"date": "08-09", "value": 177500},
                {"date": "08-11", "value": 180000}
            ],
            "top_reels": [
                {
                    "caption": "Minimalism in white. Elevate your everyday style with our classic premium linen shirts. #mensfashion #minimalstyle",
                    "views": 245000,
                    "likes": 12900,
                    "shares": 4100,
                    "comments": 540,
                    "thumbnail_url": "https://picsum.photos/seed/kow1/400/600"
                },
                {
                    "caption": "Quiet confidence. Styled in pure white for the modern trailblazer. #aesthetic #menswear",
                    "views": 138000,
                    "likes": 6400,
                    "shares": 1900,
                    "comments": 220,
                    "thumbnail_url": "https://picsum.photos/seed/kow2/400/600"
                }
            ]
        }
    ],
    "beauty": [
        {
            "brand_id": "neude",
            "brand_name": "Neude",
            "followers": 140000,
            "growth_rate": "+5.2%",
            "avg_reels_views": 60000,
            "avg_reels_likes": 3100,
            "avg_reels_shares": 980,
            "engagement_rate": "5.9%",
            "follower_growth_history": [
                {"date": "08-01", "value": 133000},
                {"date": "08-03", "value": 134500},
                {"date": "08-05", "value": 136000},
                {"date": "08-07", "value": 137200},
                {"date": "08-09", "value": 138800},
                {"date": "08-11", "value": 140000}
            ],
            "top_reels": [
                {
                    "caption": "Inspired by Indian milk-based beauty rituals. Nourish your skin barrier with contemporary science. #skinscience #heritagebeauty",
                    "views": 195000,
                    "likes": 9200,
                    "shares": 2900,
                    "comments": 380,
                    "thumbnail_url": "https://picsum.photos/seed/neude1/400/600"
                },
                {
                    "caption": "Sensorial textures that make skincare feel like a ritual. Try the Neude glow! #cleanbeauty #aesthetic",
                    "views": 112000,
                    "likes": 4800,
                    "shares": 1100,
                    "comments": 190,
                    "thumbnail_url": "https://picsum.photos/seed/neude2/400/600"
                }
            ]
        },
        {
            "brand_id": "beauty_by_bie",
            "brand_name": "Beauty by Bie",
            "followers": 110000,
            "growth_rate": "+3.8%",
            "avg_reels_views": 40000,
            "avg_reels_likes": 1900,
            "avg_reels_shares": 680,
            "engagement_rate": "4.8%",
            "follower_growth_history": [
                {"date": "08-01", "value": 106000},
                {"date": "08-03", "value": 107000},
                {"date": "08-05", "value": 107800},
                {"date": "08-07", "value": 108500},
                {"date": "08-09", "value": 109200},
                {"date": "08-11", "value": 110000}
            ],
            "top_reels": [
                {
                    "caption": "Cruelty-free, clean ingredients, honest results. Get the glow you deserve with full transparency. #skincareroutine #veganskincare",
                    "views": 130000,
                    "likes": 5800,
                    "shares": 1400,
                    "comments": 210,
                    "thumbnail_url": "https://picsum.photos/seed/bie1/400/600"
                },
                {
                    "caption": "Hydration boost for dull skin. Our transparent formulas speak for themselves. #glowingskin #scienceled",
                    "views": 85000,
                    "likes": 3400,
                    "shares": 720,
                    "comments": 110,
                    "thumbnail_url": "https://picsum.photos/seed/bie2/400/600"
                }
            ]
        }
    ],
    "luxury_fashion": [
        {
            "brand_id": "anaar",
            "brand_name": "Anaar",
            "followers": 75000,
            "growth_rate": "+8.5%",
            "avg_reels_views": 95000,
            "avg_reels_likes": 5200,
            "avg_reels_shares": 2200,
            "engagement_rate": "9.1%",
            "follower_growth_history": [
                {"date": "08-01", "value": 69000},
                {"date": "08-03", "value": 70200},
                {"date": "08-05", "value": 71500},
                {"date": "08-07", "value": 72800},
                {"date": "08-09", "value": 73900},
                {"date": "08-11", "value": 75000}
            ],
            "top_reels": [
                {
                    "caption": "Step into your dream wedding. Traditional Zardozi sneakers that define absolute comfort and opulence. #bridalfashion #weddinglook",
                    "views": 290000,
                    "likes": 18500,
                    "shares": 6700,
                    "comments": 890,
                    "thumbnail_url": "https://picsum.photos/seed/anaar1/400/600"
                },
                {
                    "caption": "Celebrate every step. Modern design meets bridal craftsmanship. #weddinginspo #zardozi",
                    "views": 160000,
                    "likes": 8900,
                    "shares": 3100,
                    "comments": 410,
                    "thumbnail_url": "https://picsum.photos/seed/anaar2/400/600"
                }
            ]
        }
    ],
    "food": [
        {
            "brand_id": "foodstories",
            "brand_name": "FoodStories",
            "followers": 150000,
            "growth_rate": "+2.9%",
            "avg_reels_views": 30000,
            "avg_reels_likes": 1200,
            "avg_reels_shares": 390,
            "engagement_rate": "3.4%",
            "follower_growth_history": [
                {"date": "08-01", "value": 147500},
                {"date": "08-03", "value": 148000},
                {"date": "08-05", "value": 148500},
                {"date": "08-07", "value": 149000},
                {"date": "08-09", "value": 149500},
                {"date": "08-11", "value": 150000}
            ],
            "top_reels": [
                {
                    "caption": "Discover the finest global ingredients in town. From fresh organic produce to gourmet snacks. #gourmet #organicfood",
                    "views": 88000,
                    "likes": 3900,
                    "shares": 950,
                    "comments": 140,
                    "thumbnail_url": "https://picsum.photos/seed/foodstories1/400/600"
                },
                {
                    "caption": "Curated selection for discovery-driven food lovers. Experience real flavor today! #foodies #discover",
                    "views": 52000,
                    "likes": 2100,
                    "shares": 420,
                    "comments": 65,
                    "thumbnail_url": "https://picsum.photos/seed/foodstories2/400/600"
                }
            ]
        }
    ],
    "retail": [
        {
            "brand_id": "broadway",
            "brand_name": "Broadway",
            "followers": 210000,
            "growth_rate": "+11.2%",
            "avg_reels_views": 140000,
            "avg_reels_likes": 8800,
            "avg_reels_shares": 3500,
            "engagement_rate": "8.3%",
            "follower_growth_history": [
                {"date": "08-01", "value": 189000},
                {"date": "08-03", "value": 193000},
                {"date": "08-05", "value": 197500},
                {"date": "08-07", "value": 201000},
                {"date": "08-09", "value": 205800},
                {"date": "08-11", "value": 210000}
            ],
            "top_reels": [
                {
                    "caption": "Physical discovery like never before. Digital-first brands come to life in our experiential spaces! #retaildesign #experiential",
                    "views": 390000,
                    "likes": 22400,
                    "shares": 8900,
                    "comments": 1150,
                    "thumbnail_url": "https://picsum.photos/seed/broadway1/400/600"
                },
                {
                    "caption": "Your favorite online brands, now right in front of you. Walk in, touch, try, love! #offline #storefront",
                    "views": 210000,
                    "likes": 11200,
                    "shares": 4200,
                    "comments": 580,
                    "thumbnail_url": "https://picsum.photos/seed/broadway2/400/600"
                }
            ]
        }
    ],
    "cultural_media": [
        {
            "brand_id": "amar_chitra_katha",
            "brand_name": "Amar Chitra Katha",
            "followers": 320000,
            "growth_rate": "+1.5%",
            "avg_reels_views": 25000,
            "avg_reels_likes": 1100,
            "avg_reels_shares": 320,
            "engagement_rate": "2.8%",
            "follower_growth_history": [
                {"date": "08-01", "value": 315000},
                {"date": "08-03", "value": 316000},
                {"date": "08-05", "value": 317200},
                {"date": "08-07", "value": 318000},
                {"date": "08-09", "value": 319100},
                {"date": "08-11", "value": 320000}
            ],
            "top_reels": [
                {
                    "caption": "Relive the tales of Indian mythology and history. Bring home the vibrant world of ACK comics! #history #mythology #india",
                    "views": 62000,
                    "likes": 2900,
                    "shares": 720,
                    "comments": 105,
                    "thumbnail_url": "https://picsum.photos/seed/ack1/400/600"
                },
                {
                    "caption": "Educating and inspiring generations. Explore folklore digitally on our app! #folklore #heritage",
                    "views": 38000,
                    "likes": 1500,
                    "shares": 410,
                    "comments": 50,
                    "thumbnail_url": "https://picsum.photos/seed/ack2/400/600"
                }
            ]
        }
    ],
    "childrens_media": [
        {
            "brand_id": "tinkle",
            "brand_name": "Tinkle",
            "followers": 240000,
            "growth_rate": "+2.1%",
            "avg_reels_views": 20000,
            "avg_reels_likes": 980,
            "avg_reels_shares": 240,
            "engagement_rate": "3.1%",
            "follower_growth_history": [
                {"date": "08-01", "value": 236000},
                {"date": "08-03", "value": 237000},
                {"date": "08-05", "value": 237800},
                {"date": "08-07", "value": 238500},
                {"date": "08-09", "value": 239200},
                {"date": "08-11", "value": 240000}
            ],
            "top_reels": [
                {
                    "caption": "Suppandi back with his legendary antics! Read Tinkle comics for endless wholesome fun. #suppandi #tinklecomics #humor",
                    "views": 54000,
                    "likes": 2600,
                    "shares": 650,
                    "comments": 90,
                    "thumbnail_url": "https://picsum.photos/seed/tinkle1/400/600"
                },
                {
                    "caption": "Mischievous stories, wholesome lessons. Keep the nostalgic trust alive with Tinkle digital! #childhood #comics",
                    "views": 31000,
                    "likes": 1200,
                    "shares": 290,
                    "comments": 45,
                    "thumbnail_url": "https://picsum.photos/seed/tinkle2/400/600"
                }
            ]
        }
    ]
}


@router.get("/social/{brand_category}")
def get_social(brand_category: str):
    subreddits = SUBREDDITS_BY_CATEGORY.get(brand_category, DEFAULT_SUBREDDITS)
    try:
        from app.tools.social_scan import fetch_subreddit_buzz
        data = fetch_subreddit_buzz(subreddits, brand_category, limit=25)
        # NOTE: MOCK DATA — instagram field is seeded demo data (see INSTAGRAM_MOCK_DATA above).
        # Real implementation would call Instagram Graph API per brand in this category.
        data["instagram"] = INSTAGRAM_MOCK_DATA.get(brand_category, [])
        return data
    except Exception:
        return {
            "mode": "degraded",
            "subreddits": [],
            "daily": [],
            "top_posts": [],
            # NOTE: MOCK DATA — degraded mode still returns full instagram mock payload.
            "instagram": INSTAGRAM_MOCK_DATA.get(brand_category, [])
        }


# --- Workspace browser ---

@router.get("/workspace/tree")
def get_workspace_tree():
    return list_tree()


@router.get("/workspace/file")
def get_workspace_file(path: str):
    try:
        return {"path": path, "content": read_text(path)}
    except (FileNotFoundError, IsADirectoryError):
        raise HTTPException(status_code=404, detail="file not found")
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid path")
