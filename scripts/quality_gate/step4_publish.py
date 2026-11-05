#!/usr/bin/env python3
import os
from common import BASE, get_tokens, api_req, load_state, save_state, utc_now
from category_check import check_and_fix


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def run(dry_run=False):
    tsq, or_key = get_tokens()
    state = load_state()
    qg = (state.get("quality_gate_unblock_step") or {}).get("results") or (state.get("quality_gate_step") or {}).get("results", [])
    category_check_live = _env_bool("TSQ_CATEGORY_CHECK", True)

    published = []
    blocked = []
    category_changes = []
    category_cost = 0.0
    if category_check_live and not dry_run:
        passing_ids = [r.get("story_id") for r in qg if r.get("pass") and r.get("story_id") is not None]
        try:
            category_changes, category_cost, _ = check_and_fix(tsq, or_key, passing_ids, apply=True)
        except Exception as exc:  # non-blocking: never stop publishing over a category check
            category_changes = [{"error": str(exc)}]
    for r in qg:
        sid = r.get("story_id")
        if not r.get("pass"):
            blocked.append({"story_id": sid, "reason": "quality_gate_failed", "issues": r.get("issues", [])})
            continue

        if dry_run:
            published.append({"story_id": sid, "status": "dry_run_approved"})
            continue

        if sid is None:
            blocked.append({"story_id": sid, "reason": "missing_story_id"})
            continue

        status, payload = api_req("POST", f"{BASE}/api/v1/stories/{sid}/publish", token=tsq, data={})
        if status in (200, 201):
            published.append({"story_id": sid, "status": "published"})
        else:
            blocked.append({"story_id": sid, "reason": f"publish_http_{status}", "response": payload})

    state["publish_step"] = {
        "started_at": utc_now(),
        "dry_run": bool(dry_run),
        "category_check": bool(category_check_live),
        "category_changes": category_changes,
        "category_cost": category_cost,
        "published": published,
        "blocked": blocked,
    }
    save_state(state)
    print(
        "publish_step done"
        f" | published={len(published)}"
        f" blocked={len(blocked)}"
        f" category_changes={len(category_changes)}"
        f" category_cost={category_cost:.6f}"
        f" dry_run={str(bool(dry_run)).lower()}"
    )


if __name__ == "__main__":
    run(dry_run=False)
