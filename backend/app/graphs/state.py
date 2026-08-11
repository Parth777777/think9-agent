"""PulseState and sub-schemas — shapes from docs/LLD.md §1.

Deviation from LLD.md §1: list-reducer fields use `reducers.dedup_add` instead of plain
`operator.add`. See app/graphs/reducers.py for why — plain operator.add silently
duplicates every reducer-list field once per Pod boundary given how compiled-subgraph-as-
node composition (LLD.md §4) actually behaves on the installed langgraph version. Field
names, types, and external behavior (concatenate across parallel branches) are unchanged;
only the merge function differs.
"""
from typing import TypedDict, Literal, Optional
from typing_extensions import Annotated

from app.graphs.reducers import dedup_add


class Engagement(TypedDict):
    score: int
    num_comments: int
    upvote_ratio: float
    created_utc: float


class Signal(TypedDict, total=False):
    id: str
    source: Literal["news_rss", "reddit", "youtube", "instagram", "scrapfly_competitor", "seed"]
    mode: Literal["live", "fallback_seeded"]
    brand_category: str
    headline: str
    url: str
    fetched_at: str
    engagement: Engagement  # optional — only reddit signals populate this today
    author: str  # optional — reddit post author, e.g. for building a u/{author} handle


class Brief(TypedDict):
    brand_id: str
    tension: str
    why_now: str
    confidence: float
    reactive: bool
    source_signal_ids: list[str]


class ContentDraft(TypedDict):
    copy: str
    image_url: Optional[str]
    ad_variants: list[str]
    iteration: int
    assets: list[dict]


class ComplianceResult(TypedDict):
    passed: bool
    score: float
    issues: list[str]


class PulseState(TypedDict):
    run_id: str
    brand_id: str
    signals: Annotated[list[Signal], dedup_add]
    brief: Optional[Brief]
    content_drafts: Annotated[list[ContentDraft], dedup_add]
    compliance_result: Optional[ComplianceResult]
    iteration_count: int
    human_decision: Optional[Literal["approve", "reject", "request_changes"]]
    celebrity_flags: Annotated[list[dict], dedup_add]
    creator_candidates: Annotated[list[dict], dedup_add]
    competitor_flags: Annotated[list[dict], dedup_add]
    synergy_flags: Annotated[list[dict], dedup_add]
    token_usage: Annotated[list[dict], dedup_add]
    final_output: Optional[dict]
    social_buzz: Optional[dict]
