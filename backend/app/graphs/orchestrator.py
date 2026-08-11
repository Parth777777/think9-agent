"""Orchestrator — hierarchical composition, exact wiring from docs/LLD.md §4."""
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from app.graphs.pods.creative_pod import build_creative_pod
from app.graphs.pods.intelligence_pod import build_intelligence_pod
from app.graphs.pods.synthesis_pod import build_synthesis_pod
from app.graphs.state import PulseState


def build_orchestrator():
    g = StateGraph(PulseState)
    g.add_node("intelligence_pod", build_intelligence_pod())
    g.add_node("synthesis_pod", build_synthesis_pod())
    g.add_node("creative_pod", build_creative_pod())
    g.add_edge(START, "intelligence_pod")
    g.add_edge("intelligence_pod", "synthesis_pod")
    g.add_edge("synthesis_pod", "creative_pod")
    g.add_edge("creative_pod", END)
    return g.compile(checkpointer=MemorySaver())


_compiled_orchestrator = None


def get_orchestrator():
    global _compiled_orchestrator
    if _compiled_orchestrator is None:
        _compiled_orchestrator = build_orchestrator()
    return _compiled_orchestrator
