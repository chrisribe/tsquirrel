#!/usr/bin/env python3
from common import BASE, get_tokens, api_req, load_state, save_state, utc_now


def run():
    tsq, _ = get_tokens()
    state = load_state()
    out = {"started_at": utc_now(), "actions": []}

    # Best-effort refresh signals before candidate selection.
    status, payload = api_req("POST", f"{BASE}/api/v1/radar/signals/scan", token=tsq, data={})
    out["actions"].append({"endpoint": "/api/v1/radar/signals/scan", "status": status, "ok": status in (200, 201), "response": payload})

    # Legacy fallback endpoint (if enabled on this deployment).
    status2, payload2 = api_req("POST", f"{BASE}/api/v1/admin/ingest", token=tsq, data={})
    out["actions"].append({"endpoint": "/api/v1/admin/ingest", "status": status2, "ok": status2 in (200, 201, 202), "response": payload2})

    state["ingest_step"] = out
    save_state(state)
    print(f"ingest_step done | radar_scan={status} admin_ingest={status2}")


if __name__ == "__main__":
    run()
