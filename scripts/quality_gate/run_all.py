#!/usr/bin/env python3
import argparse
from common import get_tokens, get_or_usage, load_state, save_state, utc_now
import step1_ingest
import step2_candidates
import step2_5_editorial
import step3_quality_gate
import step3_5_unblock
import step4_publish
import step5_report


def run_all(dry_run=False, limit=50):
    _, or_key = get_tokens()
    state = load_state()
    state["run_started_at"] = utc_now()
    state["pre_cost"] = get_or_usage(or_key)
    save_state(state)

    step1_ingest.run()
    step2_candidates.run(limit=limit, dry_run=dry_run)
    step2_5_editorial.run(limit=limit, dry_run=dry_run)
    step3_quality_gate.run()
    step3_5_unblock.run(dry_run=dry_run)
    step4_publish.run(dry_run=dry_run)
    step5_report.run()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=50)
    args = ap.parse_args()
    run_all(dry_run=args.dry_run, limit=args.limit)


if __name__ == "__main__":
    main()
