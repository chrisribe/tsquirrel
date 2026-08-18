#!/usr/bin/env python3
from common import get_tokens, get_or_usage, load_state, save_state, append_ledger, utc_now


def run():
    _, or_key = get_tokens()
    state = load_state()

    pre = state.get("pre_cost") or {}
    post = get_or_usage(or_key)
    delta = float(post.get("usage_daily", 0.0)) - float(pre.get("usage_daily", 0.0))

    qg = state.get("quality_gate_step", {})
    pb = state.get("publish_step", {})
    entry = {
        "timestamp": utc_now(),
        "pipeline": "tsquirrel_quality_gate",
        "model": qg.get("model"),
        "checked": qg.get("count", 0),
        "published": len(pb.get("published", [])),
        "blocked": len(pb.get("blocked", [])),
        "blocked_reasons": [b.get("reason", "unknown") for b in pb.get("blocked", [])],
        "openrouter": {
            "pre_daily": pre.get("usage_daily", 0.0),
            "post_daily": post.get("usage_daily", 0.0),
            "delta_daily": delta,
            "post_total": post.get("usage_total", 0.0),
            "limit_remaining": post.get("limit_remaining", 0.0),
        },
    }
    append_ledger(entry)

    state["post_cost"] = post
    state["report_step"] = entry
    save_state(state)

    print("tsquirrel_quality_gate report")
    print(f"checked={entry['checked']} published={entry['published']} blocked={entry['blocked']}")
    print(f"openrouter_daily_delta=${delta:.6f} total=${post.get('usage_total',0.0):.6f} remaining=${post.get('limit_remaining',0.0):.6f}")


if __name__ == "__main__":
    run()
