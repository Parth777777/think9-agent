"""Standalone verification of the interrupt()/Command(resume=...) mechanic with the
installed langgraph version, using stub nodes only (no LLM, no I/O). Deleted after
verification passes — see final report for the confirmed pattern used in creative_pod.py.
"""
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt, Command
from app.graphs.state import PulseState

MAX_ITERATIONS = 3


def karigar_stub(state: PulseState) -> dict:
    it = state["iteration_count"] + 1
    return {
        "content_drafts": [{"copy": f"draft v{it}", "image_url": None, "ad_variants": ["a", "b"], "iteration": it}],
        "iteration_count": it,
    }


def pehredar_stub(state: PulseState) -> dict:
    # fail on iteration 1, pass on iteration 2 -- proves the loop-back actually happens
    passed = state["iteration_count"] >= 2
    return {"compliance_result": {"passed": passed, "score": 0.9 if passed else 0.3, "issues": [] if passed else ["banned claim"]}}


def route_after_guardian(state: PulseState) -> str:
    if state["compliance_result"]["passed"]:
        return "human_approval"
    if state["iteration_count"] >= MAX_ITERATIONS:
        return "human_approval"
    return "karigar"


def human_approval_node(state: PulseState) -> dict:
    decision = interrupt({
        "run_id": state["run_id"],
        "draft": state["content_drafts"][-1],
        "compliance": state["compliance_result"],
    })
    return {"human_decision": decision}


def build():
    g = StateGraph(PulseState)
    g.add_node("karigar", karigar_stub)
    g.add_node("pehredar", pehredar_stub)
    g.add_node("human_approval", human_approval_node)
    g.add_edge(START, "karigar")
    g.add_edge("karigar", "pehredar")
    g.add_conditional_edges("pehredar", route_after_guardian, {"karigar": "karigar", "human_approval": "human_approval"})
    g.add_edge("human_approval", END)
    return g.compile(checkpointer=MemorySaver())


if __name__ == "__main__":
    compiled = build()
    run_id = "test-run-1"
    config = {"configurable": {"thread_id": run_id}}
    initial_state = {
        "run_id": run_id, "brand_id": "the_good_bug", "signals": [], "brief": None,
        "content_drafts": [], "compliance_result": None, "iteration_count": 0,
        "human_decision": None, "celebrity_flags": [], "creator_candidates": [],
        "competitor_flags": [], "synergy_flags": [], "token_usage": [], "final_output": None,
    }

    result = compiled.invoke(initial_state, config=config)
    print("first invoke result keys:", list(result.keys()))
    assert "__interrupt__" in result, "expected graph to pause at human_approval"
    interrupt_payload = result["__interrupt__"][0].value
    print("interrupt payload:", interrupt_payload)

    snap = compiled.get_state(config)
    print("state.next after pause:", snap.next)
    assert snap.next == ("human_approval",), f"expected paused at human_approval, got {snap.next}"
    assert snap.values["iteration_count"] == 2, f"expected 2 iterations (1 fail + 1 pass loop), got {snap.values['iteration_count']}"

    # resume, separate call, simulating a later HTTP request
    final = compiled.invoke(Command(resume="approve"), config=config)
    print("final result keys:", list(final.keys()))
    assert final["human_decision"] == "approve"
    snap2 = compiled.get_state(config)
    print("state.next after resume:", snap2.next)
    assert snap2.next == (), "expected graph to have reached END"
    print("INTERRUPT MECHANIC VERIFIED OK")
