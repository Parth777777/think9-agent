"""Bazaar Nazar's data source — Scrapfly API against a small named allowlist, falling
back to competitors_seed.json. docs/LLD.md §5. No SCRAPFLY_API_KEY -> skip the live
call entirely (never a metered call without the key explicitly set, docs/HLD.md §13)."""
import json
import os

from app.core.config import settings

SEED_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "competitors_seed.json")
TARGETS_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "competitor_targets.json")


def _load_seed(brand_category: str) -> list[dict]:
    with open(SEED_PATH, "r", encoding="utf-8") as f:
        seed = json.load(f)
    return [c for c in seed if c["brand_category"] == brand_category]


def _load_targets(brand_category: str) -> list[str]:
    with open(TARGETS_PATH, "r", encoding="utf-8") as f:
        targets = json.load(f)
    return targets.get(brand_category, [])


def fetch_competitor_page(url: str) -> str | None:
    try:
        from scrapfly import ScrapeConfig, ScrapflyClient
        client = ScrapflyClient(key=settings.scrapfly_api_key)
        result = client.scrape(ScrapeConfig(url=url, asp=True, country="IN"))
        return result.content
    except Exception:
        return None


def fetch_competitor_snapshot(brand_category: str) -> tuple[list[dict], str]:
    """Returns (competitor_flags, mode). Live path only attempted when a key is configured
    (Bazaar Nazar's crawl is small and named, never opportunistic — docs/HLD.md §13)."""
    if settings.scrapfly_api_key:
        flags = []
        for url in _load_targets(brand_category):
            html = fetch_competitor_page(url)
            if html:
                # a real, named parser per allowlisted target would extract price/positioning
                # here (docs/LLD.md §5); POC-scope: presence of a live fetch is the signal.
                flags.append({"name": url, "brand_category": brand_category, "source_url": url,
                              "seed": False, "note": "live Scrapfly fetch succeeded"})
        if flags:
            return flags, "live"
    return _load_seed(brand_category), "fallback_seeded"
