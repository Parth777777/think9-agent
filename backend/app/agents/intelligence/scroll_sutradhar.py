"""Scroll Sutradhar (creator/social discovery) — docs/HLD.md §3.1, docs/LLD.md §3.
2-3 real, relevant subreddits per brand category (widened via fetch_subreddit_buzz) +
YouTube channel RSS + best-effort Instagram. Documented deviation from HLD's "Reddit is
always-live, no key" table: verified directly against this environment that Reddit's edge
now serves an HTML consent-wall page (HTTP 200, not JSON) to non-browser/datacenter-style
requests for EVERY subreddit tried, UA-independent — the same class of failure HLD §8/§10
already calls out for Instagram off a non-residential IP. Reddit gets the identical
honest-fallback treatment as a result, not a silent empty list."""
import uuid
from datetime import datetime, timezone

from app import store
from app.data.brands_store import load_brand
from app.graphs.state import PulseState
from app.tools.social_scan import (
    fetch_instagram_signals,
    fetch_reddit_signals,
    fetch_subreddit_buzz,
    fetch_youtube_channel_signals,
)
from app.tools.workspace import write_json

# Real, existing subreddits picked per category — "india" is the universal cultural-lens
# fallback, paired with one category-specific community.
SUBREDDITS_BY_CATEGORY = {
    "wellness": ["india", "IndianSkincareAddicts"],
    "beauty": ["IndianSkincareAddicts", "india"],
    "nutrition": ["india", "nutrition"],
    "food": ["india", "IndianFood"],
    "fashion": ["india", "malefashionadvice"],
    "luxury_fashion": ["india", "femalefashionadvice"],
    "retail": ["india", "IndiaBusiness"],
    "cultural_media": ["india", "bollywood"],
    "childrens_media": ["india", "bollywood"],
}
DEFAULT_SUBREDDITS = ["india"]

# T-Series — real, verified YouTube channel ID, used as the universal fallback the same
# way "india" is the universal subreddit fallback above (no curated per-category channel
# list exists for this POC).
DEFAULT_YOUTUBE_CHANNEL = "UCq-Fj5jknLsUf-MWSy4_brA"


def _fit_score(score: int, num_comments: int, upvote_ratio: float, max_score: int, max_comments: int) -> float:
    """Fit = how much this post's real engagement stands out in its own batch.

    score_norm    = score / max(max_score, 1)              — 0..1, this post vs the batch's best
    comments_norm = num_comments / max(max_comments, 1)     — 0..1, same for comment volume
    base          = 0.6 * score_norm + 0.4 * comments_norm  — upvotes weighted over raw comment count
    fit           = base * (0.5 + 0.5 * upvote_ratio)       — controversial posts (low ratio) get
                                                                damped, never zeroed out
    Result clamped to [0, 1]. Varies per-post since score/comments/ratio differ; a post with
    zero engagement scores 0, the batch leader scores near (0.5 + 0.5*its own ratio).
    """
    score_norm = score / max(max_score, 1)
    comments_norm = num_comments / max(max_comments, 1)
    base = 0.6 * score_norm + 0.4 * comments_norm
    return round(max(0.0, min(1.0, base * (0.5 + 0.5 * upvote_ratio))), 3)


def scroll_sutradhar_node(state: PulseState) -> dict:
    brand = load_brand(state["brand_id"])
    category = brand["category"] if brand else "wellness"
    brand_name = brand["name"] if brand else state["brand_id"]

    subreddits = SUBREDDITS_BY_CATEGORY.get(category, DEFAULT_SUBREDDITS)
    signals = []
    creator_candidates = []
    reddit_signals = []
    for sub in subreddits:
        reddit_signals += fetch_reddit_signals(sub, category, limit=8)
    if not reddit_signals:
        reddit_signals = [{
            "id": str(uuid.uuid4()), "source": "reddit", "mode": "fallback_seeded",
            "brand_category": category,
            "headline": f"[seeded] r/{'+r/'.join(subreddits)} fetch blocked (consent-wall/bot-check "
                        f"response, not a network outage) in this environment",
            "url": "", "fetched_at": datetime.now(timezone.utc).isoformat(),
        }]
    signals += reddit_signals

    social_buzz = fetch_subreddit_buzz(subreddits, category, limit=25)

    yt_signals = fetch_youtube_channel_signals(DEFAULT_YOUTUBE_CHANNEL, category, limit=5)
    if not yt_signals:
        # channel RSS came back empty (network issue in this environment) — honest seeded
        # stand-in, same pattern as Instagram: tag it, never silently drop the source.
        yt_signals = [{
            "id": str(uuid.uuid4()), "source": "youtube", "mode": "fallback_seeded",
            "brand_category": category,
            "headline": f"[seeded] YouTube channel RSS unavailable for channel "
                        f"{DEFAULT_YOUTUBE_CHANNEL} in this environment",
            "url": "", "fetched_at": datetime.now(timezone.utc).isoformat(),
        }]
    signals += yt_signals

    ig_signals = fetch_instagram_signals(category.replace("_", ""), category, limit=5)
    ig_mode = "live" if ig_signals else "fallback_seeded"
    if not ig_signals:
        # honest seeded stand-in, clearly tagged — never presented as live (docs/HLD.md §8)
        ig_signals = [{
            "id": str(uuid.uuid4()), "source": "instagram", "mode": "fallback_seeded",
            "brand_category": category,
            "headline": f"[seeded] #{category} best-effort Instagram fetch unavailable in this environment",
            "url": "", "fetched_at": datetime.now(timezone.utc).isoformat(),
        }]
    else:
        for s in ig_signals:
            s["mode"] = "live"
    signals += ig_signals

    # derive a creator shortlist from fetch_subreddit_buzz's top posts (real engagement,
    # widened across every subreddit in the sweep) rather than just the first-page pull above
    top_posts = social_buzz["top_posts"]
    max_score = max((p["score"] for p in top_posts), default=0)
    max_comments = max((p["num_comments"] for p in top_posts), default=0)
    for p in top_posts:
        handle = f"u/{p['author']}" if p.get("author") else p["title"][:60]
        creator_candidates.append({
            "id": str(uuid.uuid4()),
            "handle": handle,
            "context": p["title"],
            "platform": "reddit",
            "category": category,
            "fit_score": _fit_score(p["score"], p["num_comments"], p["upvote_ratio"], max_score, max_comments),
            "source_url": p["url"],
            "seed": False,
        })
    if not creator_candidates:
        # buzz sweep came back empty (bot-walled, see module docstring) — a small illustrative
        # seeded shortlist so /creators isn't perpetually empty in a blocked environment;
        # clearly tagged, never presented as live.
        creator_candidates = [{
            "id": str(uuid.uuid4()), "handle": f"seed_{category}_creator", "context": "", "platform": "youtube",
            "category": category, "fit_score": 0.6, "source_url": "", "seed": True,
        }]
    creator_candidates = creator_candidates[:8]

    store.log_signals(state["run_id"], signals)

    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    write_json(f"01_Signals_Intelligence/trends/{category}/{date_str}_social.json", {
        "brand_id": state["brand_id"], "category": category,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "signals": signals, "instagram_mode": ig_mode, "social_buzz": social_buzz,
    })
    write_json(f"07_Creator_Outreach/{category}_shortlist.json", {
        "brand_id": state["brand_id"], "category": category,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "creator_candidates": creator_candidates,
    })

    return {"signals": signals, "creator_candidates": creator_candidates, "social_buzz": social_buzz}
