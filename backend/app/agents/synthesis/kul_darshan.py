"""Kul Darshan (portfolio synthesizer + Synergy Finder) — docs/HLD.md §3.2, docs/LLD.md §12.

Periodic cross-brand rollup, not a per-brand-run graph node (it needs the whole portfolio,
not one brand's signals) — computed on demand by GET /digest/latest, same pattern as
/costs/summary. Synergy Finder is the exact rule-based function from docs/LLD.md §12."""
import itertools
from datetime import datetime, timezone

from app import store
from app.data.brands_store import load_all_brands
from app.tools.workspace import write_json


def find_synergies(brands: list[dict]) -> list[dict]:
    flags = []
    for a, b in itertools.combinations(brands, 2):
        shared = set(a.get("consumer_segments", [])) & set(b.get("consumer_segments", []))
        if shared:
            flags.append({
                "brand_a": a["id"], "brand_b": b["id"], "shared_segments": list(shared),
                "suggestion": f"{a['name']} and {b['name']} share {', '.join(shared)} - "
                              f"consider cross-promotion or Broadway bundling",
            })
    return flags


def build_digest() -> dict:
    brands = load_all_brands()
    synergy_map = find_synergies(brands)
    recent_runs = store.list_recent_runs(limit=20)

    digest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "brand_count": len(brands),
        "synergy_map": synergy_map,
        "recent_runs": recent_runs,
        "run_status_counts": {
            status: sum(1 for r in recent_runs if r["status"] == status)
            for status in {r["status"] for r in recent_runs}
        },
        "published": False,
    }
    write_json("05_Portfolio_Intelligence/synergy_map.json", {"generated_at": digest["generated_at"], "synergy_map": synergy_map})
    return digest
