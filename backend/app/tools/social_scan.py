"""Scroll Sutradhar's data sources — Reddit (OAuth > public JSON > RSS, see the source
ladder below) + YouTube channel RSS (real, no key), Instagram best-effort via instaloader.
docs/LLD.md §5."""
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone

import feedparser
import requests

from app.core.config import settings
from app.graphs.state import Signal

# old.reddit.com, not www.reddit.com: www.reddit.com's edge (Cloudflare) 403s server-side
# requests regardless of User-Agent from many non-browser/datacenter-style IPs (verified
# directly against this exact environment); old.reddit.com serves the identical public JSON
# API and works with a standard identifying User-Agent, per Reddit's own API etiquette.
REDDIT_URL = "https://old.reddit.com/r/{subreddit}/hot.json?limit={limit}"
REDDIT_OAUTH_TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
REDDIT_OAUTH_URL = "https://oauth.reddit.com/r/{subreddit}/hot"
REDDIT_RSS_URL = "https://www.reddit.com/r/{subreddit}/hot/.rss"
YOUTUBE_CHANNEL_URL = "https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
HEADERS = {"User-Agent": "think9-pulse-poc/1.0 (by u/think9research)"}

# Module-level cache for the OAuth bearer token — refreshed only once expired rather than
# per call, per Reddit API etiquette (docs/HLD.md §8).
_token_cache: dict = {"token": None, "expires_at": 0.0}


def _get_reddit_token() -> str | None:
    """Tier 1 of the source ladder. Returns None immediately (no request) if no OAuth app
    credentials are configured, so the caller falls through to the public JSON tier."""
    if not settings.reddit_client_id or not settings.reddit_client_secret:
        return None
    now = time.time()
    if _token_cache["token"] and now < _token_cache["expires_at"]:
        return _token_cache["token"]
    try:
        if settings.reddit_username and settings.reddit_password:
            # password grant: script apps get higher rate limits than client_credentials
            data = {
                "grant_type": "password",
                "username": settings.reddit_username,
                "password": settings.reddit_password,
            }
        else:
            data = {"grant_type": "client_credentials"}
        resp = requests.post(
            REDDIT_OAUTH_TOKEN_URL,
            auth=(settings.reddit_client_id, settings.reddit_client_secret),
            data=data,
            headers=HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        payload = resp.json()
        _token_cache["token"] = payload["access_token"]
        # refresh 30s early so a call never races an expiring token
        _token_cache["expires_at"] = now + payload.get("expires_in", 3600) - 30
        return _token_cache["token"]
    except Exception:
        return None


def _fetch_oauth_posts(subreddit: str, limit: int) -> list[dict] | None:
    token = _get_reddit_token()
    if not token:
        return None
    try:
        resp = requests.get(
            REDDIT_OAUTH_URL.format(subreddit=subreddit),
            params={"limit": limit},
            headers={**HEADERS, "Authorization": f"bearer {token}"},
            timeout=15,
        )
        resp.raise_for_status()
        return [p["data"] for p in resp.json()["data"]["children"][:limit]]
    except Exception:
        return None


def _fetch_public_posts(subreddit: str, limit: int) -> list[dict] | None:
    try:
        resp = requests.get(REDDIT_URL.format(subreddit=subreddit, limit=limit), headers=HEADERS, timeout=15)
        resp.raise_for_status()
        return [p["data"] for p in resp.json()["data"]["children"][:limit]]
    except Exception:
        return None


def _fetch_rss_posts(subreddit: str, limit: int) -> list[dict] | None:
    """Last-resort tier — no score/comments/upvote_ratio exist in the RSS feed at all, so
    posts from here carry only title/url/author/created_utc. Callers must not default
    missing engagement fields to 0; that would render a fabricated measurement as real."""
    try:
        parsed = feedparser.parse(REDDIT_RSS_URL.format(subreddit=subreddit))
        if not parsed.entries:
            return None
        posts = []
        for entry in parsed.entries[:limit]:
            created_utc = time.mktime(entry.published_parsed) if getattr(entry, "published_parsed", None) else 0.0
            author = getattr(entry, "author", "").removeprefix("/u/")
            posts.append({
                "title": getattr(entry, "title", ""),
                "permalink": getattr(entry, "link", ""),  # already an absolute URL from RSS
                "author": author,
                "created_utc": created_utc,
            })
        return posts
    except Exception:
        return None


def _fetch_posts_with_tier(subreddit: str, limit: int) -> tuple[list[dict], str] | None:
    """The three-tier source ladder: OAuth (real engagement) > public JSON (real engagement,
    blocked from some networks) > RSS (titles/links only, no engagement)."""
    posts = _fetch_oauth_posts(subreddit, limit)
    if posts is not None:
        return posts, "oauth"
    posts = _fetch_public_posts(subreddit, limit)
    if posts is not None:
        return posts, "public_json"
    posts = _fetch_rss_posts(subreddit, limit)
    if posts is not None:
        return posts, "rss"
    return None


def _post_url(d: dict) -> str:
    permalink = d.get("permalink", "")
    return permalink if permalink.startswith("http") else f"https://www.reddit.com{permalink}"


def _engagement(d: dict) -> dict:
    return {
        "score": d.get("score", 0),
        "num_comments": d.get("num_comments", 0),
        "upvote_ratio": d.get("upvote_ratio", 0.0),
        "created_utc": d.get("created_utc", 0.0),
    }


def fetch_reddit_signals(subreddit: str, brand_category: str, limit: int = 10) -> list[Signal]:
    result = _fetch_posts_with_tier(subreddit, limit)
    if result is None:
        return []
    posts, tier = result
    mode = "degraded" if tier == "rss" else "live"
    signals: list[Signal] = []
    for d in posts[:limit]:
        signal = Signal(
            id=str(uuid.uuid4()),
            source="reddit",
            mode=mode,
            brand_category=brand_category,
            headline=d.get("title", "").strip(),
            url=_post_url(d),
            fetched_at=datetime.now(timezone.utc).isoformat(),
            author=d.get("author", ""),
        )
        if tier != "rss":  # RSS carries no engagement — omit the key, never fabricate zeros
            signal["engagement"] = _engagement(d)
        signals.append(signal)
    return signals


def fetch_subreddit_buzz(subreddits: list[str], brand_category: str, limit: int = 25) -> dict:
    """Sweeps multiple subreddits' /hot.json in one pass and aggregates engagement — per-
    subreddit totals, a daily (UTC) time bucket for trend shape, and the top posts overall
    by score. Any subreddit that fails is dropped and the batch is tagged degraded rather
    than failing outright (docs/HLD.md §8)."""
    # Weakest tier wins: even one subreddit falling back to RSS means the batch as a whole
    # is missing engagement data, so it must be reported honestly.
    tier_rank = {"oauth": 0, "public_json": 1, "rss": 2}
    subreddit_stats = []
    all_posts = []  # (subreddit, post_data, tier) triples across every subreddit that worked
    any_failed = False
    weakest_tier: str | None = None

    for sub in subreddits:
        result = _fetch_posts_with_tier(sub, limit)
        if result is None:
            any_failed = True
            continue
        posts, tier = result
        if weakest_tier is None or tier_rank[tier] > tier_rank[weakest_tier]:
            weakest_tier = tier

        stat = {"name": sub, "post_count": len(posts)}
        if tier != "rss":  # only oauth/public_json posts carry real engagement numbers
            total_score = sum(p.get("score", 0) for p in posts)
            total_comments = sum(p.get("num_comments", 0) for p in posts)
            ratios = [p.get("upvote_ratio", 0.0) for p in posts]
            stat |= {
                "total_score": total_score,
                "total_comments": total_comments,
                "avg_upvote_ratio": round(sum(ratios) / len(ratios), 3) if ratios else 0.0,
            }
        subreddit_stats.append(stat)
        all_posts += [(sub, p, tier) for p in posts]

    daily_buckets: dict[str, dict] = defaultdict(lambda: {"posts": 0, "score": 0, "comments": 0})
    for _, p, tier in all_posts:
        created = p.get("created_utc")
        if not created:
            continue
        day = datetime.fromtimestamp(created, tz=timezone.utc).strftime("%Y-%m-%d")
        daily_buckets[day]["posts"] += 1
        if tier != "rss":
            daily_buckets[day]["score"] += p.get("score", 0)
            daily_buckets[day]["comments"] += p.get("num_comments", 0)
    daily = [{"date": d, **v} for d, v in sorted(daily_buckets.items())]

    top_posts_sorted = sorted(all_posts, key=lambda sp: sp[1].get("score", 0), reverse=True)[:10]
    top_posts = []
    for sub, p, tier in top_posts_sorted:
        post = {
            "title": p.get("title", "").strip(),
            "url": _post_url(p),
            "subreddit": sub,
            "created_utc": p.get("created_utc", 0.0),
            "author": p.get("author", ""),
        }
        if tier != "rss":
            post |= {
                "score": p.get("score", 0),
                "num_comments": p.get("num_comments", 0),
                "upvote_ratio": p.get("upvote_ratio", 0.0),
            }
        top_posts.append(post)

    mode = "live" if subreddit_stats and not any_failed and weakest_tier != "rss" else "degraded"
    return {
        "mode": mode,
        "source_tier": weakest_tier or "rss",
        "subreddits": subreddit_stats,
        "daily": daily,
        "top_posts": top_posts,
    }


def fetch_youtube_channel_signals(channel_id: str, brand_category: str, limit: int = 5) -> list[Signal]:
    try:
        url = YOUTUBE_CHANNEL_URL.format(channel_id=channel_id)
        parsed = feedparser.parse(url)
        signals: list[Signal] = []
        for entry in parsed.entries[:limit]:
            signals.append(Signal(
                id=str(uuid.uuid4()),
                source="youtube",
                mode="live",
                brand_category=brand_category,
                headline=getattr(entry, "title", "").strip(),
                url=getattr(entry, "link", ""),
                fetched_at=datetime.now(timezone.utc).isoformat(),
            ))
        return signals
    except Exception:
        return []


def fetch_instagram_signals(hashtag: str, brand_category: str, limit: int = 5) -> list[Signal]:
    """Best-effort — instaloader with no login almost always gets rate-limited/blocked
    outside a residential IP (docs/HLD.md §8, §10). Any failure returns [] and the caller
    tags the batch fallback_seeded; this is expected, not a bug."""
    try:
        import instaloader
        loader = instaloader.Instaloader(download_pictures=False, download_videos=False,
                                          download_comments=False, save_metadata=False, quiet=True,
                                          max_connection_attempts=1)  # fail fast, don't stall the
                                          # pipeline retrying a source already known-blocked here
        posts = instaloader.Hashtag.from_name(loader.context, hashtag).get_posts()
        signals: list[Signal] = []
        for i, post in enumerate(posts):
            if i >= limit:
                break
            signals.append(Signal(
                id=str(uuid.uuid4()),
                source="instagram",
                mode="live",
                brand_category=brand_category,
                headline=(post.caption or f"#{hashtag} post").strip()[:200],
                url=f"https://www.instagram.com/p/{post.shortcode}/",
                fetched_at=datetime.now(timezone.utc).isoformat(),
            ))
        return signals
    except Exception:
        return []
