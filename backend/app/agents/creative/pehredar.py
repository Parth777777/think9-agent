"""Pehredar (brand guardian) — docs/HLD.md §3.3, docs/LLD.md §2, §11 Compliance Memory.

Deliberately strict: this is the loop the whole system exists to prove actually
triggers (see task brief) — a lenient critic that always passes defeats the point.
"""
from app.core.json_utils import extract_json
from app.core.llm import get_chat_model, track_usage
from app.data.brands_store import append_known_pitfall, load_brand
from app.graphs.state import ComplianceResult, PulseState
from app.tools.workspace import write_text

PROMPT = """You are Pehredar ("sentinel"), Think9's strict brand-compliance guardian for {brand_name}.
You are deliberately hard to please. Your job is to catch problems, not to be encouraging.

Brand tone required: {tone}
Brand's explicitly banned claims/phrases (reject the draft if ANY of these appear, even in a \
softened or implied form — e.g. "clinically proven" also covers "proven by studies", "guaranteed" \
also covers "you will see results"): {banned_claims}
Known past pitfalls for this brand (be extra suspicious of these recurring patterns): {pitfalls}

Draft copy to review:
\"\"\"{copy}\"\"\"

Ad variants:
{ad_variants_block}

Score this draft against exactly two concrete gates — do NOT fail it for being generic, \
unoriginal, "interchangeable with other brands", or any other subjective creative-quality \
judgment; that is not a compliance violation and is out of scope for this review:
(1) BANNED CLAIMS: does the copy contain any banned claim, verbatim OR as a genuine same-meaning \
paraphrase (e.g. "clinically proven" also covers "proven by studies" or "backed by clinical \
research" — the same factual claim in different words). A vague adjacent word is NOT a violation: \
"holistic well-being" is not "cures", "supports" is not "guaranteed". When in doubt on THIS gate, \
fail it — banned claims are a real legal/compliance risk.
(2) TONE MISMATCH: does the copy contain specific, quotable words or phrases that actively \
contradict the required tone ({tone}) — e.g. slangy/casual language for a brand whose tone is \
"premium, minimal", or clinical jargon for a brand whose tone is "playful, warm". You must be \
able to quote the exact offending word/phrase in `issues` to fail on this gate. "Could be seen as \
generic" or "lacks a distinct voice" is NOT a nameable tone mismatch — when in doubt on THIS gate, \
PASS it; only fail for a concrete, quotable contradiction.

A draft passes if it clears both gates. This review is a compliance/tone-safety check, not a \
creative-quality bar — a merely average but safe draft should pass.

Respond with ONLY a JSON object (no prose, no markdown fences):
{{
  "passed": <true if both gates above are clear>,
  "score": <float 0.0-1.0>,
  "issues": ["specific, quotable issue #1 (name the exact phrase) if any", "issue #2 if any"]
}}"""


def pehredar_node(state: PulseState) -> dict:
    brand = load_brand(state["brand_id"]) or {}
    draft = state["content_drafts"][-1]
    iteration = draft["iteration"]

    prompt = PROMPT.format(
        brand_name=brand.get("name", state["brand_id"]),
        tone=", ".join(brand.get("tone", [])),
        banned_claims=", ".join(brand.get("banned_claims", [])),
        pitfalls="; ".join(brand.get("known_pitfalls", [])) or "(none yet)",
        copy=draft["copy"],
        ad_variants_block="\n".join(f"- {v}" for v in draft["ad_variants"]) or "(none)",
    )

    token_usage = []
    try:
        llm = get_chat_model()
        response = llm.invoke(prompt)
        token_usage = track_usage(response, "pehredar")["token_usage"]
        parsed = extract_json(response.content)
        compliance: ComplianceResult = {
            "passed": bool(parsed["passed"]),
            "score": float(parsed.get("score", 0.0)),
            "issues": [str(i) for i in parsed.get("issues", [])],
        }
    except Exception:
        # fail-safe: an unparsable critic response is treated as a fail (not a silent pass),
        # since silently passing here would defeat the compliance guarantee.
        compliance = {"passed": False, "score": 0.0, "issues": ["Guardian review failed to parse — treated as a fail, needs manual review."]}

    for issue in compliance["issues"]:
        append_known_pitfall(state["brand_id"], issue)

    md = f"# Guardian review v{iteration} — {brand.get('name', state['brand_id'])}\n\n"
    md += f"**Passed:** {compliance['passed']}\n**Score:** {compliance['score']}\n\n## Issues\n"
    md += "\n".join(f"- {i}" for i in compliance["issues"]) or "(none)"
    write_text(f"03_Creative_Studio/{state['brand_id']}/{state['run_id']}/guardian_review_v{iteration}.md", md)

    return {"compliance_result": compliance, "token_usage": token_usage}
