#!/usr/bin/env python3
from common import BASE, get_tokens, api_req, load_state, save_state, utc_now


def run(dry_run=False):
    tsq, _ = get_tokens()
    state = load_state()
    qg = (state.get("quality_gate_step") or {}).get("results", [])

    published = []
    blocked = []
    for r in qg:
        sid = r.get("story_id")
        if not r.get("pass"):
            blocked.append({"story_id": sid, "reason": "quality_gate_failed", "issues": r.get("issues", [])})
            continue

        if dry_run:
            published.append({"story_id": sid, "status": "dry_run_approved"})
            continue

        status, payload = api_req("POST", f"{BASE}/api/v1/stories/{sid}/publish", token=tsq, data={})
        if status in (200, 201):
            published.append({"story_id": sid, "status": "published"})
        else:
            blocked.append({"story_id": sid, "reason": f"publish_http_{status}", "response": payload})

    state["publish_step"] = {
        "started_at": utc_now(),
        "dry_run": bool(dry_run),
        "published": published,
        "blocked": blocked,
    }
    save_state(state)
    print(f"publish_step done | published={len(published)} blocked={len(blocked)} dry_run={str(dry_run).lower()}")


if __name__ == "__main__":
    run(dry_run=False)
