#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}/scripts/quality_gate"
export TSQ_FORCE_IPV4="${TSQ_FORCE_IPV4:-1}"
export TSQ_HTTP_RETRIES="${TSQ_HTTP_RETRIES:-4}"
export TSQ_HTTP_BACKOFF_SEC="${TSQ_HTTP_BACKOFF_SEC:-1.5}"
python3 run_all.py ${TSQ_QG_ARGS:-}
