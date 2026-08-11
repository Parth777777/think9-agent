"""Pulse's market-demand data sources — Wikipedia Pageviews REST API + Google Suggest,
both keyless, no auth. pytrends (unofficial Google Trends client) is tried best-effort and
falls back to the Wikipedia series when unavailable. docs/LLD.md §5."""
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import requests

PAGEVIEWS_URL = (
    "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/"
    "all-access/user/{article}/daily/{start}/{end}"
)
SUGGEST_URL = "https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl={gl}&q={q}"
HEADERS = {"User-Agent": "think9-pulse-poc/1.0"}

# brand_id / brand_name are not real Wikipedia articles (e.g. "the_good_bug" 404s).
# Map each brands.json category to a real, existing English Wikipedia article
# title instead — verified live against the Pageviews API. Unmapped categories
# fall back to DEFAULT_ARTICLE, which is also verified live.
CATEGORY_ARTICLES = {
    "wellness": "Probiotic",
    "nutrition": "Dietary_supplement",
    "beauty": "Cosmetics",
    "fashion": "Fashion",
    "luxury_fashion": "Luxury_goods",
    "food": "Food_industry",
    "retail": "Retail",
    "cultural_media": "Mass_media",
    "childrens_media": "Animation",
}
DEFAULT_ARTICLE = "Mass_media"


def article_for_category(category: str) -> str:
    return CATEGORY_ARTICLES.get(category, DEFAULT_ARTICLE)


def fetch_pageview_series(article: str, days: int = 90) -> dict:
    try:
        end = datetime.now(timezone.utc).date()
        start = end - timedelta(days=days)
        url = PAGEVIEWS_URL.format(
            article=quote(article, safe=""),
            start=start.strftime("%Y%m%d"),
            end=end.strftime("%Y%m%d"),
        )
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        items = resp.json().get("items", [])
        series = [
            {"date": f"{i['timestamp'][:4]}-{i['timestamp'][4:6]}-{i['timestamp'][6:8]}", "views": i["views"]}
            for i in items
        ]
        return {"article": article, "mode": "live", "series": series}
    except Exception:
        return {"article": article, "mode": "degraded", "series": []}


def fetch_keyword_demand(seed: str, gl: str = "in") -> dict:
    try:
        url = SUGGEST_URL.format(gl=gl, q=quote(seed))
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        completions = resp.json()[1]
        keywords = [{"keyword": kw, "rank": i + 1} for i, kw in enumerate(completions)]
        return {"seed": seed, "mode": "live", "keywords": keywords}
    except Exception:
        return {"seed": seed, "mode": "degraded", "keywords": []}


def fetch_google_trends(terms: list[str]) -> dict:
    try:
        from pytrends.request import TrendReq

        pytrends = TrendReq(hl="en-US", tz=330)
        pytrends.build_payload(terms, timeframe="today 3-m", geo="IN")
        df = pytrends.interest_over_time()
        series = [
            {"date": idx.strftime("%Y-%m-%d"), "views": int(row[terms[0]])}
            for idx, row in df.iterrows()
        ]
        return {"article": terms[0], "mode": "live", "series": series}
    except Exception as exc:
        fallback = fetch_pageview_series(terms[0])
        fallback["mode"] = "degraded"
        fallback["fallback_reason"] = f"pytrends unavailable: {exc}"
        return fallback
