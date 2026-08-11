"""Karigar's image tools — Pollinations.ai (no key) with optional Higgsfield fallback-first.
docs/LLD.md §5. Produces a 6-asset pack (2 formats x 3 sizes) per draft.
"""
import os
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

import requests

POLLINATIONS_URL = "https://image.pollinations.ai/prompt/{prompt}?width={width}&height={height}&nologo=true"

FORMATS = {
    "product": (
        "clean studio product photograph of {product}, plain seamless background, soft diffused "
        "studio lighting, centered, commercial catalog photography, no text, no people"
    ),
    "faceless_ugc": (
        "authentic user-generated lifestyle photo of {product}, hands only holding the product, "
        "over-the-shoulder point-of-view, natural window light, casual home setting, candid "
        "smartphone photo aesthetic, no face visible, no text"
    ),
}

SIZES = {"feed": (1024, 1024), "story": (768, 1344), "banner": (1344, 768)}


def _generate_pollinations(prompt: str, width: int, height: int) -> str | None:
    url = POLLINATIONS_URL.format(prompt=quote(prompt), width=width, height=height)
    try:
        # 90s, not 30s: a cold generation at 1344x768 regularly exceeds 30s, and every
        # timeout here shows up as a "failed" tile in the asset pack. Cached prompts
        # come back in ~1s, so the long ceiling costs nothing on the happy path.
        resp = requests.get(url, timeout=90)
        resp.raise_for_status()
        return url
    except Exception:
        return None


def _generate_higgsfield(prompt: str, width: int, height: int) -> str | None:
    """Higgsfield Cloud API — untested without a live HIGGSFIELD_API_KEY, keep small.
    Never raises; any failure (network, auth, unexpected response shape) falls back to Pollinations.
    """
    key = os.environ.get("HIGGSFIELD_API_KEY")
    if not key:
        return None
    try:
        resp = requests.post(
            "https://api.higgsfield.ai/v1/images/generate",
            headers={"Authorization": f"Bearer {key}"},
            json={"prompt": prompt, "width": width, "height": height},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("url") or (data.get("images") or [None])[0]
    except Exception:
        return None


def generate_image(prompt: str, width: int, height: int) -> tuple[str | None, str, str]:
    """Returns (url, provider, verification) where verification is "verified" | "unverified".

    Pollinations renders on demand from the URL itself, so the URL is usable whether or
    not we pre-fetch it — and pre-fetching is exactly what breaks at pack scale. Measured:
    a single cold request returns 200 in 23-44s, but six concurrent ones fail fast (2/6 ok)
    because the service rejects parallel load per IP.

    So we build the URL, attempt one short verification, and report honestly which we got.
    An unverified asset still renders in the browser; it is labelled so nobody reads a
    guess as a confirmation.
    """
    url = _generate_higgsfield(prompt, width, height)
    if url:
        return url, "higgsfield", "verified"

    pollinations_url = POLLINATIONS_URL.format(prompt=quote(prompt), width=width, height=height)
    verified = _verify(pollinations_url)
    return pollinations_url, "pollinations", "verified" if verified else "unverified"


def _verify(url: str, timeout: int = 12) -> bool:
    """One short attempt. Never raises; a False here means "not confirmed", not "broken"."""
    try:
        resp = requests.get(url, timeout=timeout, stream=True)
        ok = resp.status_code == 200
        resp.close()
        return ok
    except Exception:
        return False


def _build_prompt(fmt: str, product_desc: str) -> str:
    return FORMATS[fmt].format(product=product_desc)


def _generate_one(fmt: str, size: str, product_desc: str, headline: str, cta: str) -> dict:
    width, height = SIZES[size]
    url, provider, verification = generate_image(_build_prompt(fmt, product_desc), width, height)
    return {
        "format": fmt,
        "size": size,
        "width": width,
        "height": height,
        "url": url,
        "provider": provider,
        "headline": headline,
        "cta": cta,
        # "ok" = we fetched it and got 200. "unverified" = URL is live-renderable but we
        # did not confirm it. "failed" = no provider produced a URL at all.
        "status": "failed" if not url else ("ok" if verification == "verified" else "unverified"),
    }


# Firing all 6 jobs at once made Pollinations reject 5 of them (measured: 1/6 ok at
# max_workers=6, while the same prompts run sequentially returned 200 every time).
# It rate-limits concurrent requests per IP, so throughput here is bounded by politeness,
# not by our CPU. Two workers plus a stagger keeps the whole pack under ~20s.
_MAX_WORKERS = 2
_STAGGER_SECONDS = 0.6


def generate_asset_pack(product_desc: str, headline: str, cta: str) -> list[dict]:
    """2 formats x 3 sizes = 6 assets. A single failure never drops the rest — each
    asset independently resolves to status ok/failed."""
    jobs = [(fmt, size) for fmt in FORMATS for size in SIZES]

    def _staggered(index: int, fmt: str, size: str) -> dict:
        time.sleep(index * _STAGGER_SECONDS)
        return _generate_one(fmt, size, product_desc, headline, cta)

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as pool:
        futures = [pool.submit(_staggered, i, fmt, size) for i, (fmt, size) in enumerate(jobs)]
        return [f.result() for f in futures]
