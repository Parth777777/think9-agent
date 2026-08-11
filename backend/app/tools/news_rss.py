"""Nazariya's data source — Google News RSS, no key required. docs/LLD.md §5."""
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

import feedparser

from app.graphs.state import Signal

FEED_URL = "https://news.google.com/rss/search?q={query}"


def fetch_news_signals(query: str, brand_category: str, limit: int = 5) -> list[Signal]:
    try:
        url = FEED_URL.format(query=quote(query))
        parsed = feedparser.parse(url)
        signals: list[Signal] = []
        for entry in parsed.entries[:limit]:
            signals.append(Signal(
                id=str(uuid.uuid4()),
                source="news_rss",
                mode="live",
                brand_category=brand_category,
                headline=getattr(entry, "title", "").strip(),
                url=getattr(entry, "link", ""),
                fetched_at=datetime.now(timezone.utc).isoformat(),
            ))
        return signals
    except Exception:
        # never crash the graph on a flaky/unreachable RSS source (docs/HLD.md §8)
        return []
