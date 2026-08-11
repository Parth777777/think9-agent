"""LLM provider factory — exact shape from docs/LLD.md §6."""
import time
from datetime import datetime, timezone

from app.core.config import settings


class RateLimitDegraded(Exception):
    """Raised when a Groq call is still 429'ing after retries exhaust. Distinguishable from
    a real model answer on purpose — a caller catching this must show a plain "rate limited"
    message, never a hardcoded fallback string that looks like model output."""

    def __init__(self, message: str, retry_after: float | None = None):
        super().__init__(message)
        self.retry_after = retry_after


# Module-level snapshot of the last observed rate-limit state.
#
# INVESTIGATED LIVE (langchain-groq against the real Groq API, see backend agent notes):
# on a *successful* call, ChatGroq's response.response_metadata does NOT expose Groq's
# x-ratelimit-* response headers — it only carries
# {token_usage, model_name, system_fingerprint, service_tier, finish_reason, logprobs,
# model_provider}. langchain_groq never surfaces the underlying httpx.Response on success.
# The headers DO exist and ARE reachable, but only via the groq SDK's own exception path:
# groq.APIStatusError (and its RateLimitError subclass) carries `.response` (httpx.Response)
# with real headers, populated only when a call actually errors (429, etc). So this snapshot
# can only be updated when a 429 is hit — there is no live "tokens remaining" on the happy path
# through this wrapper.
_rate_limit_state = {
    "remaining_tokens": None,
    "remaining_requests": None,
    "limit_tokens": None,
    "limit_requests": None,
    "last_429_at": None,
    "last_retry_after": None,
}


def get_meter_snapshot() -> dict:
    return dict(_rate_limit_state)


def _record_headers(headers) -> None:
    if not headers:
        return
    field_by_header = {
        "x-ratelimit-remaining-tokens": "remaining_tokens",
        "x-ratelimit-remaining-requests": "remaining_requests",
        "x-ratelimit-limit-tokens": "limit_tokens",
        "x-ratelimit-limit-requests": "limit_requests",
    }
    for header, field in field_by_header.items():
        if header in headers:
            _rate_limit_state[field] = headers[header]


def get_chat_model():
    if settings.llm_provider == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(model="llama-3.3-70b-versatile", api_key=settings.groq_api_key, temperature=0.4)
    if settings.llm_provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model="gemini-1.5-flash", google_api_key=settings.google_api_key)
    raise ValueError(f"Unknown LLM_PROVIDER: {settings.llm_provider}")


def invoke_with_retry(model, *args, max_retries: int = 2, **kwargs):
    """model.invoke(*args, **kwargs) with retry-on-429: up to `max_retries` retries,
    sleeping min(retry-after, 5s) between attempts. Raises RateLimitDegraded (never returns
    a fabricated answer) once retries exhaust, so callers can tell "still rate limited" apart
    from a genuine model response."""
    try:
        from groq import APIStatusError
    except ImportError:
        APIStatusError = ()  # non-groq provider (e.g. gemini) — no special 429 handling

    attempt = 0
    while True:
        try:
            return model.invoke(*args, **kwargs)
        except Exception as exc:
            is_rate_limit = isinstance(exc, APIStatusError) and getattr(exc, "status_code", None) == 429
            if not is_rate_limit:
                raise

            headers = getattr(getattr(exc, "response", None), "headers", None)
            _record_headers(headers)
            retry_after = float(headers.get("retry-after", 1)) if headers and "retry-after" in headers else 1.0
            _rate_limit_state["last_429_at"] = datetime.now(timezone.utc).isoformat()
            _rate_limit_state["last_retry_after"] = retry_after

            attempt += 1
            if attempt > max_retries:
                raise RateLimitDegraded(
                    f"Groq rate limit exceeded after {max_retries} retries", retry_after=retry_after
                ) from exc
            time.sleep(min(retry_after, 5.0))


def track_usage(response, node_name: str) -> dict:
    usage = getattr(response, "usage_metadata", None) or {}
    return {
        "token_usage": [{
            "node": node_name,
            "prompt_tokens": usage.get("input_tokens", 0),
            "completion_tokens": usage.get("output_tokens", 0),
        }]
    }
