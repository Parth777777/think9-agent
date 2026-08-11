"""Karigar (content strategist) — docs/HLD.md §3.3, docs/LLD.md §2.
P1: packaging-mockup image via Pollinations.ai (image_gen.py), one per draft."""
from app.core.json_utils import extract_json
from app.core.llm import get_chat_model, track_usage
from app.data.brands_store import load_brand
from app.graphs.state import ContentDraft, PulseState
from app.tools.image_gen import generate_asset_pack
from app.tools.workspace import write_json, write_text

PROMPT = """You are Karigar ("craftsman"), Think9's content strategist for {brand_name}.

Brand positioning: {positioning}
Brand tone: {tone}
Consumer segments: {segments}
Known pitfalls to avoid (past Guardian rejections for this brand — do NOT repeat these): {pitfalls}

Opportunity brief:
- Tension: {tension}
- Why now: {why_now}
- Reactive: {reactive}

{fix_notes_block}

Write marketing copy for {brand_name} that addresses this brief, matches the brand tone, and \
strictly avoids the banned claims: {banned_claims}.

Respond with ONLY a JSON object (no prose, no markdown fences):
{{
  "copy": "the primary ad copy, 2-4 sentences",
  "ad_variants": ["a distinct short copy angle #1 (e.g. functional-benefit)", "a distinct short copy angle #2 (e.g. emotional or social-proof)"]
}}"""


def karigar_node(state: PulseState) -> dict:
    brand = load_brand(state["brand_id"]) or {}
    brief = state.get("brief") or {}
    iteration = state["iteration_count"] + 1

    fix_notes_block = ""
    prior_compliance = state.get("compliance_result")
    if prior_compliance and not prior_compliance.get("passed", True):
        issues = "; ".join(prior_compliance.get("issues", []))
        fix_notes_block = f"The Brand Guardian rejected your previous draft for these reasons — fix them: {issues}"

    prompt = PROMPT.format(
        brand_name=brand.get("name", state["brand_id"]),
        positioning=brand.get("positioning", ""),
        tone=", ".join(brand.get("tone", [])),
        segments=", ".join(brand.get("consumer_segments", [])),
        pitfalls="; ".join(brand.get("known_pitfalls", [])) or "(none yet)",
        tension=brief.get("tension", ""),
        why_now=brief.get("why_now", ""),
        reactive=brief.get("reactive", False),
        fix_notes_block=fix_notes_block,
        banned_claims=", ".join(brand.get("banned_claims", [])),
    )

    token_usage = []
    try:
        llm = get_chat_model()
        response = llm.invoke(prompt)
        token_usage = track_usage(response, "karigar")["token_usage"]
        parsed = extract_json(response.content)
        copy = str(parsed["copy"])
        ad_variants = [str(v) for v in parsed.get("ad_variants", [])][:2]
    except Exception:
        copy = f"{brand.get('name', state['brand_id'])}: draft unavailable (LLM synthesis failed) — manual copywriting required."
        ad_variants = []

    product_desc = f"{brand.get('name', state['brand_id'])} {brand.get('category', 'consumer product')}"
    headline = ad_variants[0] if ad_variants else copy.split(".")[0]
    cta = ad_variants[1] if len(ad_variants) > 1 else "Shop now"

    try:
        assets = generate_asset_pack(product_desc, headline, cta)
    except Exception:
        assets = []

    image_url = next(
        (a["url"] for a in assets if a["format"] == "product" and a["size"] == "feed" and a["status"] == "ok"),
        None,
    )

    draft: ContentDraft = {
        "copy": copy,
        "image_url": image_url,
        "ad_variants": ad_variants,
        "iteration": iteration,
        "assets": assets,
    }

    run_dir = f"03_Creative_Studio/{state['brand_id']}/{state['run_id']}"
    md = f"# Draft v{iteration} — {brand.get('name', state['brand_id'])}\n\n## Copy\n{copy}\n\n## Ad variants\n"
    md += "\n".join(f"- {v}" for v in ad_variants)
    write_text(f"{run_dir}/draft_v{iteration}.md", md)
    write_json(f"{run_dir}/assets.json", {"iteration": iteration, "assets": assets})

    return {"content_drafts": [draft], "iteration_count": iteration, "token_usage": token_usage}
