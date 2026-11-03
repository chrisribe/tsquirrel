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
    extraction = state.get("extraction_step") or {}
    extraction_summary = extraction.get("summary") or {}
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
        "extraction": {
            "enabled": bool(extraction),
            "model": extraction.get("model"),
            "stories": extraction_summary.get("count", 0),
            "avg_confidence_mean": extraction_summary.get("avg_confidence_mean"),
            "entity_count_mean": extraction_summary.get("entity_count_mean"),
            "source_overlap_mean": extraction_summary.get("source_overlap_mean"),
            "low_overlap_count": extraction_summary.get("low_overlap_count"),
            "high_claim_count_stories": extraction_summary.get("high_claim_count_stories"),
            "risk_counts": extraction_summary.get("risk_counts") or {},
            "risk_rates": extraction_summary.get("risk_rates") or {},
            "predicted_category_distribution": extraction_summary.get("predicted_category_distribution") or {},
            "true_category_distribution": extraction_summary.get("true_category_distribution") or {},
            "category_match_rate": extraction_summary.get("category_match_rate"),
            "predicted_category_confidence_mean": extraction_summary.get("predicted_category_confidence_mean"),
            "category_tuning": extraction_summary.get("category_tuning") or {},
        },
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

    if extraction:
        risk_counts = (entry.get("extraction", {}).get("risk_counts") or {})
        pred_dist = (entry.get("extraction", {}).get("predicted_category_distribution") or {})
        true_dist = (entry.get("extraction", {}).get("true_category_distribution") or {})

        def _top5(d):
            return sorted(d.items(), key=lambda kv: (-kv[1], kv[0]))[:5]

        print("- Extraction signals:")
        print(f"  - Model: `{entry['extraction'].get('model')}`")
        print(f"  - Stories scored: **{entry['extraction'].get('stories', 0)}**")
        print(f"  - Avg confidence: `{(entry['extraction'].get('avg_confidence_mean') or 0.0):.4f}`")
        print(f"  - Mean entities/story: `{(entry['extraction'].get('entity_count_mean') or 0.0):.4f}`")
        print(f"  - Mean source overlap: `{(entry['extraction'].get('source_overlap_mean') or 0.0):.4f}`")
        print(
            "  - Risk buckets: "
            f"green={risk_counts.get('green',0)} "
            f"yellow={risk_counts.get('yellow',0)} "
            f"red={risk_counts.get('red',0)}"
        )
        print(
            f"  - Category match rate (if true labels present): "
            f"`{entry['extraction'].get('category_match_rate')}`"
        )
        print(
            f"  - Predicted category confidence mean: "
            f"`{entry['extraction'].get('predicted_category_confidence_mean')}`"
        )
        tuning = entry['extraction'].get('category_tuning') or {}
        if tuning:
            print(
                "  - Category tuning: "
                f"other_conf_threshold={tuning.get('other_conf_threshold')} "
                f"forced_to_other={tuning.get('forced_to_other_count')} "
                f"rate={tuning.get('forced_to_other_rate')}"
            )
            if tuning.get('fallback_classes'):
                print("  - Category tuning classes:")
                for c in (tuning.get('fallback_classes') or []):
                    print(f"    - {c}")
        if pred_dist:
            print("  - Top predicted categories:")
            for k, v in _top5(pred_dist):
                print(f"    - {k}: {v}")
        if true_dist:
            print("  - Top true categories in batch:")
            for k, v in _top5(true_dist):
                print(f"    - {k}: {v}")


if __name__ == "__main__":
    run()
