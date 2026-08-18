#!/usr/bin/env python3
from common import BASE, get_tokens, api_req, load_state, save_state, utc_now


def run(limit=50):
    tsq, _ = get_tokens()
    state = load_state()

    status, payload = api_req("GET", f"{BASE}/api/v1/stories?status=draft&limit={int(limit)}", token=tsq)
    stories = payload.get("stories", []) if isinstance(payload, dict) else []

    candidates = []
    for s in stories:
        candidates.append({
            "id": s.get("id"),
            "title": s.get("title", ""),
            "source_count": int(s.get("source_count", 0) or 0),
            "status": s.get("status"),
            "needs_review": bool(s.get("needs_review", False)),
        })

    state["candidates_step"] = {
        "started_at": utc_now(),
        "status": status,
        "count": len(candidates),
        "candidates": candidates,
    }
    save_state(state)
    print(f"candidates_step done | http={status} draft_candidates={len(candidates)}")


if __name__ == "__main__":
    run()
