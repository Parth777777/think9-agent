"""Intelligence Pod — parallel fan-out, docs/LLD.md §3. P1: all four agents wired."""
from langgraph.graph import END, START, StateGraph

from app.agents.intelligence.bazaar_nazar import bazaar_nazar_node
from app.agents.intelligence.nazariya import nazariya_node
from app.agents.intelligence.scroll_sutradhar import scroll_sutradhar_node
from app.agents.intelligence.tara_dhwani import tara_dhwani_node
from app.graphs.state import PulseState


def merge_node(state: PulseState) -> dict:
    return {}   # no-op; the `signals`/`*_flags` reducers already merged everything


def build_intelligence_pod():
    g = StateGraph(PulseState)
    g.add_node("nazariya", nazariya_node)
    g.add_node("scroll_sutradhar", scroll_sutradhar_node)
    g.add_node("bazaar_nazar", bazaar_nazar_node)
    g.add_node("tara_dhwani", tara_dhwani_node)
    g.add_node("merge", merge_node)

    for n in ["nazariya", "scroll_sutradhar", "bazaar_nazar", "tara_dhwani"]:
        g.add_edge(START, n)
        g.add_edge(n, "merge")
    g.add_edge("merge", END)
    # checkpointer=False: this pod is a plain node inside the Orchestrator, not an
    # independent interrupt/resume boundary. Without this, the installed langgraph
    # version (1.2.10) double-applies the `signals` reducer for any subgraph that has
    # an internal join node (the fan-out -> merge shape here) when the PARENT graph
    # has its own checkpointer — verified directly against this exact langgraph
    # version (see docs/LLD.md deviation note); explicitly opting out of checkpoint
    # inheritance for this pod avoids it.
    return g.compile(checkpointer=False)
