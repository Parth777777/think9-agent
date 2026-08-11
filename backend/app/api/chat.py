"""Ask PULSE — a read-only, tool-calling chat agent over data the pipeline already produced.
Every tool is a thin wrapper over an existing function (no reimplemented logic) and none of
them may write, approve, publish, or trigger a pipeline run."""
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from fastapi import APIRouter
from pydantic import BaseModel

from app import store
from app.agents.synthesis.kul_darshan import build_digest
from app.core.llm import RateLimitDegraded, get_chat_model, get_meter_snapshot, invoke_with_retry
from app.data.brands_store import load_all_brands, load_brand

router = APIRouter()

SYSTEM_PROMPT = (
    "You are Ask PULSE, a read-only research assistant over Think9's brand portfolio data. "
    "You may only look things up with the tools provided — you can never write, approve, "
    "publish, or trigger a pipeline run, and no tool exists to do any of those things. "
    "Answer using tool results, be concise, and say so plainly if the data doesn't cover "
    "the question."
)

MAX_TOOL_ROUNDS = 4


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


@tool
def list_brands() -> list[dict]:
    """List all brands in the portfolio."""
    return load_all_brands()


@tool
def get_brand(brand_id: str) -> dict | None:
    """Get full detail for one brand by its id."""
    return load_brand(brand_id)


@tool
def list_runs(status: str | None = None) -> list[dict]:
    """List pipeline runs, newest first, optionally filtered by status."""
    conn = store.get_conn()
    if status:
        rows = conn.execute(
            "SELECT run_id, brand_id, status, created_at, updated_at FROM runs WHERE status = ? ORDER BY created_at DESC",
            (status,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT run_id, brand_id, status, created_at, updated_at FROM runs ORDER BY created_at DESC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@tool
def get_digest() -> dict:
    """Get the latest cross-portfolio digest: synergy map, recent runs, run status counts."""
    return build_digest()


@tool
def get_costs() -> dict:
    """Get current token usage and rate-limit metering for the LLM."""
    from app.api.routes import _token_ledger_summary
    by_node, total_tokens, estimated_cost_usd = _token_ledger_summary()
    return {"total_tokens": total_tokens, "by_node": by_node, "estimated_cost_usd": estimated_cost_usd,
            "rate_limit": get_meter_snapshot()}


@tool
def get_market(brand_id: str) -> dict:
    """Get the market bundle (search interest, keyword demand, competitor snapshot) for a brand."""
    from app.api.routes import get_market as _get_market
    return _get_market(brand_id)


TOOLS = [list_brands, get_brand, list_runs, get_digest, get_costs, get_market]
TOOLS_BY_NAME = {t.name: t for t in TOOLS}


def _summarize(result) -> str:
    text = str(result)
    return text if len(text) <= 200 else text[:200] + "..."


@router.post("/chat")
def chat(req: ChatRequest):
    model = get_chat_model().bind_tools(TOOLS)

    messages = [SystemMessage(content=SYSTEM_PROMPT)]
    for m in req.history:
        messages.append(HumanMessage(content=m.content) if m.role == "user" else AIMessage(content=m.content))
    messages.append(HumanMessage(content=req.message))

    tool_calls_log: list[dict] = []

    for _ in range(MAX_TOOL_ROUNDS):
        try:
            ai_msg = invoke_with_retry(model, messages)
        except RateLimitDegraded:
            return {
                "reply": "Ask PULSE is temporarily rate-limited by the LLM provider — please try again in a few seconds.",
                "tool_calls": tool_calls_log,
                "mode": "rate_limited",
            }
        except Exception as exc:
            return {"reply": f"Ask PULSE hit an error: {exc}", "tool_calls": tool_calls_log, "mode": "error"}

        messages.append(ai_msg)
        if not getattr(ai_msg, "tool_calls", None):
            return {"reply": ai_msg.content, "tool_calls": tool_calls_log, "mode": "live"}

        for call in ai_msg.tool_calls:
            tool_fn = TOOLS_BY_NAME.get(call["name"])
            if tool_fn is None:
                result = f"unknown tool: {call['name']}"
            else:
                try:
                    result = tool_fn.invoke(call["args"])
                except Exception as exc:
                    result = f"tool error: {exc}"
            tool_calls_log.append({"tool": call["name"], "args": call["args"], "result_summary": _summarize(result)})
            messages.append(ToolMessage(content=str(result), tool_call_id=call["id"]))

    return {
        "reply": "Ask PULSE stopped after reaching the tool-call round limit — try a narrower question.",
        "tool_calls": tool_calls_log,
        "mode": "live",
    }
