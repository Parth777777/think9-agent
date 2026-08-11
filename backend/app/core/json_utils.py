"""Shared "pull a JSON object out of an LLM text response" helper — used by every
node that asks the LLM for structured output but can't rely on guaranteed JSON mode."""
import json
import re


def extract_json(text: str) -> dict:
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else None
    if not candidate:
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        candidate = brace.group(0) if brace else None
    if not candidate:
        raise ValueError("no JSON object found in LLM response")
    return json.loads(candidate)
