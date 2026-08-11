"""Brand data access — single source of truth for reading/writing data/brands.json.
Shared by Nazariya, Karigar, Pehredar and the API routes so brand load/save logic
lives in exactly one place (docs/LLD.md §11 Compliance Memory needs load_brand/save_brand)."""
import json
import os

from app.tools.workspace import write_json

BRANDS_PATH = os.path.join(os.path.dirname(__file__), "brands.json")


def load_all_brands() -> list[dict]:
    with open(BRANDS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_brand(brand_id: str) -> dict | None:
    for brand in load_all_brands():
        if brand["id"] == brand_id:
            return brand
    return None


def save_brand(brand_id: str, brand: dict) -> None:
    brands = load_all_brands()
    for i, b in enumerate(brands):
        if b["id"] == brand_id:
            brands[i] = brand
            break
    with open(BRANDS_PATH, "w", encoding="utf-8") as f:
        json.dump(brands, f, indent=2, ensure_ascii=False)
    write_json(f"04_Brand_Bibles/{brand_id}.json", brand)


def append_known_pitfall(brand_id: str, issue: str) -> None:
    """docs/LLD.md §11 Compliance Memory — exact mechanic."""
    brand = load_brand(brand_id)
    if brand is None:
        return
    if issue not in brand["known_pitfalls"]:
        brand["known_pitfalls"].append(issue)
        save_brand(brand_id, brand)
