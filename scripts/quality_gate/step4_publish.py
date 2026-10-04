#!/usr/bin/env python3
import os
from common import BASE, get_tokens, api_req, load_state, save_state, utc_now


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def _build_extraction_category_map(state):
    extraction = (state.get("extraction_step") or {}).get("results") or []
    out = {}
    for row in extraction:
        if not isinstance(row, dict):
            continue
        sid = row.get("story_id")
        cat = str(row.get("predicted_category") or "").strip()
        if sid is None or not cat:
            continue
        out[str(sid)] = cat
    return out


def run(dry_run=False):
    tsq, _ = get_tokens()
    state = load_state()
    qg = (state.get("quality_gate_unblock_step") or {}).get("results") or (state.get("quality_gate_step") or {}).get("results", [])
    category_enrich_live = _env_bool("TSQ_CATEGORY_ENRICH_LIVE", False)
    extraction_category_by_story = _build_extraction_category_map(state) if category_enrich_live else {}

    published = []
    blocked = []
    category_enriched = []
    category_enrich_errors = []
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

        sid_key = str(sid)
        predicted_category = extraction_category_by_story.get(sid_key)
        if predicted_category:
            p_status, p_payload = api_req(
                "PATCH",
                f"{BASE}/api/v1/stories/{sid}",
                token=tsq,
                data={"category": predicted_category},
            )
            if p_status in (200, 201):
                category_enriched.append({"story_id": sid, "category": predicted_category, "status": p_status})
            else:
                category_enrich_errors.append(
                    {
                        "story_id": sid,
                        "category": predicted_category,
                        "status": p_status,
                        "response": p_payload,
                    }
                )

        status, payload = api_req("POST", f"{BASE}/api/v1/stories/{sid}/publish", token=tsq, data={})
        if status in (200, 201):
            published.append({"story_id": sid, "status": "published"})
        else:
            blocked.append({"story_id": sid, "reason": f"publish_http_{status}", "response": payload})

    state["publish_step"] = {
        "started_at": utc_now(),
        "dry_run": bool(dry_run),
        "category_enrich_live": bool(category_enrich_live),
        "category_enriched": category_enriched,
        "category_enrich_errors": category_enrich_errors,
        "published": published,
        "blocked": blocked,
    }
    save_state(state)
    print(
        "publish_step done"
        f" | published={len(published)}"
        f" blocked={len(blocked)}"
        f" category_enriched={len(category_enriched)}"
        f" category_enrich_errors={len(category_enrich_errors)}"
        f" dry_run={str(bool(dry_run)).lower()}"
    )


if __name__ == "__main__":
    run(dry_run=False)
