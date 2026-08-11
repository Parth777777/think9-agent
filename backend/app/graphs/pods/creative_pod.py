"""Creative Pod — exact wiring from docs/LLD.md §2, verified against the installed
langgraph version with backend/verify_interrupt.py before real nodes were wired in
(see docs/HLD.md §4.2 — this is the highest-risk mechanic in the system)."""
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from app.agents.creative.karigar import karigar_node
from app.agents.creative.pehredar import pehredar_node
from app.graphs.state import PulseState

MAX_ITERATIONS = 3


def route_after_guardian(state: PulseState) -> str:
    if state["compliance_result"]["passed"]:
        return "human_approval"
    if state["iteration_count"] >= MAX_ITERATIONS:
        return "human_approval"   # cap hit: surfaced to human flagged "needs manual rewrite"
    return "karigar"


def human_approval_node(state: PulseState) -> dict:
    decision = interrupt({
        "run_id": state["run_id"],
        "draft": state["content_drafts"][-1],
        "compliance": state["compliance_result"],
    })
    return {"human_decision": decision}


def build_creative_pod():
    g = StateGraph(PulseState)
    g.add_node("karigar", karigar_node)
    g.add_node("pehredar", pehredar_node)
    g.add_node("human_approval", human_approval_node)
    g.add_edge(START, "karigar")
    g.add_edge("karigar", "pehredar")
    g.add_conditional_edges("pehredar", route_after_guardian, {
        "karigar": "karigar",
        "human_approval": "human_approval",
    })
    g.add_edge("human_approval", END)
    return g.compile(checkpointer=MemorySaver())
