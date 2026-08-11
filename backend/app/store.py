"""SQLite operational store — exact schema from docs/LLD.md §9."""
import json
import os
import sqlite3
from datetime import datetime, timezone

from app.tools.workspace import write_text, read_text

DB_PATH = os.path.join(os.path.dirname(__file__), "pulse.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS token_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    node TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    ts TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decision_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    checkpoint TEXT NOT NULL,
    decision TEXT NOT NULL,
    notes TEXT,
    ts TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    source TEXT,
    mode TEXT,
    brand_category TEXT,
    headline TEXT,
    url TEXT,
    fetched_at TEXT,
    engagement_json TEXT
);

CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id TEXT,
    metric TEXT,
    value REAL,
    captured_at TEXT,
    source TEXT,
    mode TEXT
);
"""


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_conn()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_run(run_id: str, brand_id: str, status: str) -> None:
    conn = get_conn()
    now = _now()
    conn.execute(
        "INSERT INTO runs (run_id, brand_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (run_id, brand_id, status, now, now),
    )
    conn.commit()
    conn.close()


def update_run_status(run_id: str, status: str) -> None:
    conn = get_conn()
    conn.execute("UPDATE runs SET status = ?, updated_at = ? WHERE run_id = ?", (status, _now(), run_id))
    conn.commit()
    conn.close()


def get_run(run_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_recent_runs(limit: int = 20) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def log_token_usage(run_id: str, node: str, prompt_tokens: int, completion_tokens: int) -> None:
    conn = get_conn()
    conn.execute(
        "INSERT INTO token_ledger (run_id, node, prompt_tokens, completion_tokens, ts) VALUES (?, ?, ?, ?, ?)",
        (run_id, node, prompt_tokens, completion_tokens, _now()),
    )
    conn.commit()
    conn.close()


def log_decision(run_id: str, checkpoint: str, decision: str, notes: str | None = None) -> None:
    """Writes to SQLite AND mirrors to 08_Knowledge_Base/decision_log.jsonl (docs/LLD.md §9)."""
    conn = get_conn()
    ts = _now()
    conn.execute(
        "INSERT INTO decision_log (run_id, checkpoint, decision, notes, ts) VALUES (?, ?, ?, ?, ?)",
        (run_id, checkpoint, decision, notes, ts),
    )
    conn.commit()
    conn.close()

    entry = {"run_id": run_id, "checkpoint": checkpoint, "decision": decision, "notes": notes, "ts": ts}
    rel_path = "08_Knowledge_Base/decision_log.jsonl"
    try:
        existing = read_text(rel_path)
    except FileNotFoundError:
        existing = ""
    write_text(rel_path, existing + json.dumps(entry, ensure_ascii=False) + "\n")


def log_signals(run_id: str, signals: list[dict]) -> None:
    conn = get_conn()
    now = _now()
    conn.executemany(
        "INSERT INTO signals (run_id, source, mode, brand_category, headline, url, fetched_at, engagement_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
            (
                run_id, s.get("source"), s.get("mode"), s.get("brand_category"),
                s.get("headline"), s.get("url"), s.get("fetched_at", now),
                json.dumps(s.get("engagement")) if s.get("engagement") is not None else None,
            )
            for s in signals
        ],
    )
    conn.commit()
    conn.close()


def log_metric(brand_id: str, metric: str, value: float, source: str, mode: str) -> None:
    conn = get_conn()
    conn.execute(
        "INSERT INTO metrics (brand_id, metric, value, captured_at, source, mode) VALUES (?, ?, ?, ?, ?, ?)",
        (brand_id, metric, value, _now(), source, mode),
    )
    conn.commit()
    conn.close()


def get_signals(limit: int = 500) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM signals ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_metrics(brand_id: str | None = None, metric: str | None = None) -> list[dict]:
    conn = get_conn()
    query = "SELECT * FROM metrics WHERE 1=1"
    params: list = []
    if brand_id is not None:
        query += " AND brand_id = ?"
        params.append(brand_id)
    if metric is not None:
        query += " AND metric = ?"
        params.append(metric)
    query += " ORDER BY id DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]
