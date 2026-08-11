"""Tara Dhwani (celebrity pulse) — docs/HLD.md §3.1, docs/LLD.md §3, §7.
Seeded partner dataset + optional live RSS-by-name enrichment (reuses news_rss.py)."""
import json
import os
from datetime import datetime, timezone

from app.graphs.state import PulseState
from app.tools.news_rss import fetch_news_signals
from app.tools.workspace import write_json

CELEBRITIES_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "celebrities.json")


def _load_celebrities() -> list[dict]:
    with open(CELEBRITIES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_all_celebrities() -> list[dict]:
    """Used directly by GET /celebrities — seeded records only (no per-request live enrichment
    to avoid hammering Google News on every dashboard poll; enrichment happens per pipeline run)."""
    return _load_celebrities()


def tara_dhwani_node(state: PulseState) -> dict:
    brand_id = state["brand_id"]
    partners = [c for c in _load_celebrities() if c["brand_id"] == brand_id]

    signals = []
    celebrity_flags = []
    for partner in partners:
        news = fetch_news_signals(query=f'"{partner["display_name"]}"', brand_category=brand_id, limit=3)
        buzz_count = len(news)
        signals += news

        flag = {
            "id": partner["id"], "display_name": partner["display_name"], "brand_id": brand_id,
            "baseline_sentiment": partner["baseline_sentiment"], "risk_flag": partner["risk_flag"],
            "buzz_count": buzz_count, "seed": True,
        }
        celebrity_flags.append(flag)

    write_json(f"06_Stakeholder_Rooms/{brand_id}/celebrity_pulse.json", {
        "brand_id": brand_id, "generated_at": datetime.now(timezone.utc).isoformat(),
        "celebrity_flags": celebrity_flags,
    })

    return {"signals": signals, "celebrity_flags": celebrity_flags}
