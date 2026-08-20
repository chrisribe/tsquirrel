#!/usr/bin/env python3
import os
from common import BASE, get_tokens, api_req, load_state, save_state, utc_now


def _env_bool(name, default=False):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def _list_signals(tsq, limit):
    status, payload = api_req("GET", f"{BASE}/api/v1/radar/signals?status=active&limit={int(limit)}", token=tsq)
    if status != 200 or not isinstance(payload, dict):
        return status, []
    return status, payload.get("signals", []) or []


def _create_story_from_signal(tsq, signal_id):
    status, payload = api_req("POST", f"{BASE}/api/v1/radar/signals/{int(signal_id)}/create-story", token=tsq, data={})
    if status not in (200, 201) or not isinstance(payload, dict):
        return status, None
    return status, payload.get("story") or {}


def run(limit=50, dry_run=False):
    tsq, _ = get_tokens()
    state = load_state()
    auto_from_signals = _env_bool("TSQ_QG_AUTO_DRAFT_FROM_SIGNALS", True)
    per_run_signal_cap = max(0, int(os.environ.get("TSQ_QG_SIGNAL_CREATE_LIMIT", "15") or "15"))

    status, payload = api_req("GET", f"{BASE}/api/v1/stories?status=draft&limit={int(limit)}", token=tsq)
    stories = payload.get("stories", []) if isinstance(payload, dict) else []

    created_from_signals = []
    signal_scan_status = None
    active_signals_seen = 0
    if auto_from_signals and len(stories) < int(limit):
        signal_scan_status, signals = _list_signals(tsq, max(int(limit), per_run_signal_cap))
        active_signals_seen = len(signals)
        room = max(0, int(limit) - len(stories))
        budget = min(room, per_run_signal_cap)

        for sig in signals[:budget]:
            if not isinstance(sig, dict):
                continue
            sid = sig.get("id")
            if sid is None:
                continue
            if dry_run:
                created_from_signals.append({
                    "signal_id": sid,
                    "story_id": None,
                    "status": 0,
                    "dry_run": True,
                })
                continue

            create_status, created_story = _create_story_from_signal(tsq, sid)
            created_from_signals.append({
                "signal_id": sid,
                "story_id": (created_story or {}).get("id"),
                "status": create_status,
                "dry_run": False,
            })

        # refresh draft pool after signal->story creation attempts
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
        "auto_from_signals": auto_from_signals,
        "signal_scan_status": signal_scan_status,
        "active_signals_seen": active_signals_seen,
        "created_from_signals": created_from_signals,
        "created_from_signals_count": sum(1 for x in created_from_signals if x.get("story_id")),
        "dry_run": bool(dry_run),
        "count": len(candidates),
        "candidates": candidates,
    }
    save_state(state)
    print(
        "candidates_step done"
        f" | http={status}"
        f" draft_candidates={len(candidates)}"
        f" active_signals={active_signals_seen}"
        f" signal_created={sum(1 for x in created_from_signals if x.get('story_id'))}"
        f" dry_run={str(bool(dry_run)).lower()}"
    )


if __name__ == "__main__":
    run()
