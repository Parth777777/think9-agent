"""Bazaar Nazar (competitor scout) — docs/HLD.md §3.1, docs/LLD.md §3."""
import uuid
from datetime import datetime, timezone

from app.data.brands_store import load_brand
from app.graphs.state import PulseState
from app.tools.competitor_scan import fetch_competitor_snapshot
from app.tools.workspace import write_json


def bazaar_nazar_node(state: PulseState) -> dict:
    brand = load_brand(state["brand_id"])
    category = brand["category"] if brand else "wellness"

    competitor_flags, mode = fetch_competitor_snapshot(category)

    signal = {
        "id": str(uuid.uuid4()), "source": "scrapfly_competitor", "mode": mode,
        "brand_category": category,
        "headline": f"{len(competitor_flags)} competitor(s) tracked for {category} ({mode})",
        "url": "", "fetched_at": datetime.now(timezone.utc).isoformat(),
    }

    write_json(f"05_Portfolio_Intelligence/competitors/{category}.json", {
        "brand_id": state["brand_id"], "category": category, "mode": mode,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "competitor_flags": competitor_flags,
    })

    return {"signals": [signal], "competitor_flags": competitor_flags}
