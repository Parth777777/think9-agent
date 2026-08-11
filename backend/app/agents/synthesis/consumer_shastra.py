"""Consumer Shastra (insight synthesizer) — docs/HLD.md §3.2, docs/LLD.md §3."""
from app.core.json_utils import extract_json
from app.core.llm import get_chat_model, track_usage
from app.data.brands_store import load_brand
from app.graphs.state import Brief, PulseState
from app.tools.workspace import write_json

PROMPT = """You are Consumer Shastra, Think9's opportunity-brief synthesizer. Think9's own \
research framework name for "understanding the deeper motivations behind consumption."

Brand: {brand_name} ({category})
Positioning: {positioning}

Recent signals for this brand's category:
{signals_block}

Synthesize ONE structured Opportunity Brief from these signals. Respond with ONLY a JSON object \
(no prose, no markdown fences) with exactly these fields:
{{
  "tension": "the underlying consumer tension/need this reveals, 1-2 sentences",
  "why_now": "why this matters right now, 1-2 sentences",
  "confidence": <float 0.0-1.0>,
  "reactive": <true if this is a response to a competitor/event rather than a proactive trend, else false>
}}"""


def consumer_shastra_node(state: PulseState) -> dict:
    brand = load_brand(state["brand_id"]) or {"name": state["brand_id"], "category": "wellness", "positioning": ""}
    signals = state.get("signals", [])
    signals_block = "\n".join(f"- [{s['id']}] {s['headline']}" for s in signals) or "(no signals available)"

    prompt = PROMPT.format(
        brand_name=brand["name"], category=brand["category"], positioning=brand.get("positioning", ""),
        signals_block=signals_block,
    )

    token_usage = []
    try:
        llm = get_chat_model()
        response = llm.invoke(prompt)
        token_usage = track_usage(response, "consumer_shastra")["token_usage"]
        parsed = extract_json(response.content)
        brief: Brief = {
            "brand_id": state["brand_id"],
            "tension": str(parsed["tension"]),
            "why_now": str(parsed["why_now"]),
            "confidence": float(parsed.get("confidence", 0.5)),
            "reactive": bool(parsed.get("reactive", False)),
            "source_signal_ids": [s["id"] for s in signals],
        }
    except Exception:
        # never crash the graph on a bad/unparsable LLM response — fall back to a
        # low-confidence brief so the pipeline can still reach human approval.
        brief = {
            "brand_id": state["brand_id"],
            "tension": f"Unable to synthesize a specific tension for {brand['name']} from current signals.",
            "why_now": "Fallback brief — LLM synthesis failed or returned unparsable output.",
            "confidence": 0.2,
            "reactive": False,
            "source_signal_ids": [s["id"] for s in signals],
        }

    write_json(f"02_Insights/{state['brand_id']}/brief_{state['run_id']}.json", brief)

    return {"brief": brief, "token_usage": token_usage}
