"""Custom state reducer — see docs/LLD.md deviation note in state.py.

Plain `operator.add` (as specified in docs/LLD.md §1) silently duplicates data here:
every Pod is a *compiled subgraph* registered as an Orchestrator node (LLD §4), and a
compiled graph invoked as a node returns its ENTIRE internal state, not a delta. For any
`Annotated[list, operator.add]` channel, every later pod that merely passes a field
through unchanged still returns the already-accumulated list as part of its output, so
the parent's `operator.add` concatenates the same items onto themselves again — verified
directly (nazariya_node confirmed to run exactly once; signals list still doubled per
downstream pod) against the installed langgraph version (1.2.10) before shipping this fix.

`dedup_add` concatenates like `operator.add` but drops exact structural duplicates, which
is what a pure pass-through re-adds — legitimate new entries (a new Signal/ContentDraft)
are never byte-identical to an existing one, so real accumulation is untouched.
"""
import json


def dedup_add(existing: list, new: list) -> list:
    result = list(existing)
    seen = {json.dumps(item, sort_keys=True, default=str) for item in existing}
    for item in new:
        key = json.dumps(item, sort_keys=True, default=str)
        if key not in seen:
            result.append(item)
            seen.add(key)
    return result
