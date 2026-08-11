"""Nazariya (trend scout) — docs/HLD.md §3.1, docs/LLD.md §3."""
from datetime import datetime, timezone

from app.data.brands_store import load_brand
from app.graphs.state import PulseState
from app.tools.news_rss import fetch_news_signals
from app.tools.workspace import write_json

# Ingredient/trend terms Nazariya adds an extra query for, per category
# (India-market "Bharat Darshan" cultural-lens categories called out in HLD §3.1).
INGREDIENT_TREND_TERMS = {
    "wellness": "ashwagandha gut health India",
    "beauty": "fermented skincare actives India",
    "food": "fermented foods India trend",
    "nutrition": "protein snacking trend India",
}


def nazariya_node(state: PulseState) -> dict:
    brand = load_brand(state["brand_id"])
    category = brand["category"] if brand else "wellness"
    brand_name = brand["name"] if brand else state["brand_id"]

    signals = fetch_news_signals(query=f"{brand_name} {category} India consumer", brand_category=category, limit=5)

    ingredient_term = INGREDIENT_TREND_TERMS.get(category)
    if ingredient_term:
        signals += fetch_news_signals(query=ingredient_term, brand_category=category, limit=3)

    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    write_json(f"01_Signals_Intelligence/trends/{category}/{date_str}.json", {
        "brand_id": state["brand_id"],
        "category": category,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "signals": signals,
    })

    return {"signals": signals}
