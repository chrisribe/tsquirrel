#!/usr/bin/env python3
import argparse
import json
from collections import Counter
from datetime import datetime
from pathlib import Path

from common import BASE, ENV_TSQ, read_key, api_req, utc_now


def get_tsq_token(env_path):
    token = read_key(env_path, "TSQUIRREL_API_TOKEN") or read_key(env_path, "TSQ_API_TOKEN")
    if not token:
        raise RuntimeError(f"TSquirrel API token missing in {env_path}")
    return token


def list_published_story_ids(base_url, token, limit, per_page):
    page = 1
    ids = []
    while len(ids) < limit:
        status, payload = api_req(
            "GET",
            f"{base_url}/api/v1/stories?status=published&per_page={per_page}&page={page}",
            token=token,
        )
        if status != 200:
            raise RuntimeError(f"List stories failed: HTTP {status} {payload}")

        stories = payload.get("stories") or []
        if not stories:
            break

        ids.extend([int(s["id"]) for s in stories if s.get("id") is not None])
        if len(stories) < per_page:
            break
        page += 1

    return ids[:limit]


def audit_story(base_url, token, story_id):
    status, payload = api_req("GET", f"{base_url}/api/v1/stories/{story_id}/editorial-audit", token=token)
    if status != 200:
        return {
            "story_id": story_id,
            "passes_editorial_contract": False,
            "error": f"http_{status}",
            "response": payload,
            "blocker_details": [],
        }
    return payload


def summarize(results):
    failed = [r for r in results if not bool(r.get("passes_editorial_contract"))]
    counter = Counter()
    for row in failed:
        for b in row.get("blocker_details") or []:
            code = str(b.get("code") or "unknown")
            counter[code] += 1

    return {
        "stories_checked": len(results),
        "stories_passing": len(results) - len(failed),
        "stories_failing": len(failed),
        "fail_rate": round((len(failed) / len(results)) if results else 0.0, 4),
        "blockers_by_code": dict(counter.most_common()),
        "failing_story_ids": [r.get("story_id") for r in failed],
    }


def main():
    ap = argparse.ArgumentParser(description="Audit published stories against server editorial contract")
    ap.add_argument("--base-url", default=BASE)
    ap.add_argument("--env", default=ENV_TSQ, help="Path to .env with TSQUIRREL_API_TOKEN")
    ap.add_argument("--limit", type=int, default=100)
    ap.add_argument("--per-page", type=int, default=100)
    ap.add_argument("--out", default=f"/tmp/tsq_editorial_audit_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    ap.add_argument("--only-failures", action="store_true", help="Report only failed stories in details list")
    args = ap.parse_args()

    token = get_tsq_token(args.env)
    ids = list_published_story_ids(args.base_url, token, args.limit, args.per_page)
    if not ids:
        raise RuntimeError("No published stories found")

    rows = [audit_story(args.base_url, token, sid) for sid in ids]
    summary = summarize(rows)

    details = rows
    if args.only_failures:
        details = [r for r in rows if not bool(r.get("passes_editorial_contract"))]

    out = {
        "generated_at": utc_now(),
        "base_url": args.base_url,
        "limit": args.limit,
        "summary": summary,
        "details": details,
    }

    out_path = Path(args.out)
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")

    print("AUDITED", summary["stories_checked"])
    print("PASS", summary["stories_passing"])
    print("FAIL", summary["stories_failing"])
    print("FAIL_RATE", summary["fail_rate"])
    print("TOP_BLOCKERS", json.dumps(summary["blockers_by_code"], ensure_ascii=False))
    print("REPORT", str(out_path))


if __name__ == "__main__":
    main()
