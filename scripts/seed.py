#!/usr/bin/env python
"""Populates the Workspace tree with example files so WorkspaceBrowser has content
before any real pipeline run, and writes 04_Brand_Bibles/{brand}.json for every brand.
Run from repo root: python scripts/seed.py  (or from backend/: python ../scripts/seed.py)
"""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.data.brands_store import load_all_brands, save_brand  # noqa: E402
from app.tools.workspace import ensure_workspace_dirs, write_json, write_text  # noqa: E402


def main():
    ensure_workspace_dirs()
    brands = load_all_brands()
    now = datetime.now(timezone.utc).isoformat()

    for brand in brands:
        save_brand(brand["id"], brand)  # writes 04_Brand_Bibles/{brand}.json

    # A couple of example signal/insight files so the browser isn't empty pre-run.
    example_brand = brands[0]
    write_json(f"01_Signals_Intelligence/trends/{example_brand['category']}/example.json", {
        "brand_id": example_brand["id"],
        "category": example_brand["category"],
        "generated_at": now,
        "signals": [{
            "id": "seed-example-1",
            "source": "seed",
            "mode": "fallback_seeded",
            "brand_category": example_brand["category"],
            "headline": f"Example seeded signal for {example_brand['name']} — real runs replace this",
            "url": "",
            "fetched_at": now,
        }],
    })
    write_json(f"02_Insights/{example_brand['id']}/brief_example.json", {
        "brand_id": example_brand["id"],
        "tension": "Example opportunity brief — replaced by a real Consumer Shastra run.",
        "why_now": "Seed data for the Workspace browser demo.",
        "confidence": 0.5,
        "reactive": False,
        "source_signal_ids": ["seed-example-1"],
    })
    write_text("08_Knowledge_Base/README.md", (
        "# Think9 PULSE Workspace\n\n"
        "This folder tree is written to by real pipeline runs. See docs/HLD.md for the full "
        "layout. `04_Brand_Bibles/` and the example files under `01_Signals_Intelligence/` and "
        "`02_Insights/` were populated by `scripts/seed.py`.\n"
    ))

    print(f"Seeded {len(brands)} brand bibles into 04_Brand_Bibles/")
    print("Seeded example signal + insight files")
    print("Workspace tree ready at backend/app/workspace/")


if __name__ == "__main__":
    main()
