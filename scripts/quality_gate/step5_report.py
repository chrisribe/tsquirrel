#!/usr/bin/env python3
from collections import Counter
from common import get_tokens, get_or_usage, load_state, save_state, append_ledger, utc_now


def run():
    _, or_key = get_tokens()
    state = load_state()

    pre = state.get("pre_cost") or {}
    post = get_or_usage(or_key)
    delta = float(post.get("usage_daily", 0.0)) - float(pre.get("usage_daily", 0.0))

    editorial = state.get("editorial_step") or {}
    qg = state.get("quality_gate_unblock_step") or state.get("quality_gate_step", {})
    qg_base = state.get("quality_gate_step") or {}
    pb = state.get("publish_step", {})

    editorial_cost = float(editorial.get("openrouter_usage_cost_sum", 0.0) or 0.0)
    quality_gate_cost = float(qg_base.get("openrouter_usage_cost_sum", 0.0) or 0.0)
    call_cost_sum = editorial_cost + quality_gate_cost

    entry = {
        "timestamp": utc_now(),
        "pipeline": "tsquirrel_quality_gate",
        "model": qg.get("model") or qg_base.get("model"),
        "checked": qg.get("count", 0),
        "published": len(pb.get("published", [])),
        "blocked": len(pb.get("blocked", [])),
        "blocked_reasons": [b.get("reason", "unknown") for b in pb.get("blocked", [])],
        "openrouter": {
            "pre_daily": pre.get("usage_daily", 0.0),
            "post_daily": post.get("usage_daily", 0.0),
            "delta_daily": delta,
            "delta_estimated_from_calls": call_cost_sum,
            "editorial_call_cost": editorial_cost,
            "quality_gate_call_cost": quality_gate_cost,
            "post_total": post.get("usage_total", 0.0),
            "limit_remaining": post.get("limit_remaining", 0.0),
        },
    }
    append_ledger(entry)

    state["post_cost"] = post
    state["report_step"] = entry
    save_state(state)

    blocked_reasons = [str(x or "unknown") for x in entry.get("blocked_reasons", [])]
    reason_counts = Counter(blocked_reasons)

    print("## TSquirrel Quality Gate Report")
    print(f"- Checked: **{entry['checked']}**")
    print(f"- Published: **{entry['published']}**")
    print(f"- Blocked: **{entry['blocked']}**")

    if reason_counts:
        print("- Blocked reasons:")
        for reason, count in sorted(reason_counts.items(), key=lambda kv: (-kv[1], kv[0])):
            print(f"  - `{reason}` × {count}")

    print("- OpenRouter cost:")
    print(f"  - Daily delta: `${delta:.6f}`")
    print(f"  - Estimated from calls: `${call_cost_sum:.6f}`")
    print(f"  - Usage total: `${post.get('usage_total',0.0):.6f}`")
    print(f"  - Limit remaining: `${post.get('limit_remaining',0.0):.6f}`")


if __name__ == "__main__":
    run()
