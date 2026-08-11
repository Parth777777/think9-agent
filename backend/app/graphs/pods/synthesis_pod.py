"""Synthesis Pod — docs/LLD.md §3. P0: START -> consumer_shastra -> END (Kul Darshan is P1)."""
from langgraph.graph import END, START, StateGraph

from app.agents.synthesis.consumer_shastra import consumer_shastra_node
from app.graphs.state import PulseState


def build_synthesis_pod():
    g = StateGraph(PulseState)
    g.add_node("consumer_shastra", consumer_shastra_node)
    g.add_edge(START, "consumer_shastra")
    g.add_edge("consumer_shastra", END)
    return g.compile(checkpointer=False)  # see intelligence_pod.py comment: avoid checkpoint-inheritance duplication
