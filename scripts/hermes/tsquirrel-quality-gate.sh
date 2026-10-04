#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}/scripts/quality_gate"

export TSQ_FORCE_IPV4="${TSQ_FORCE_IPV4:-1}"
export TSQ_HTTP_RETRIES="${TSQ_HTTP_RETRIES:-4}"
export TSQ_HTTP_BACKOFF_SEC="${TSQ_HTTP_BACKOFF_SEC:-1.5}"

# Optional: GLiNER extraction shadow step before quality gate.
# Enable with: TSQ_QG_EXTRACTION_SHADOW=1
if [[ "${TSQ_QG_EXTRACTION_SHADOW:-0}" =~ ^(1|true|yes|on)$ ]]; then
  export TSQ_EXTRACT_MODEL="${TSQ_EXTRACT_MODEL:-fastino/gliner2.5-small-v1}"
  # Non-blocking live enrichment: apply GLiNER predicted categories before publish.
  export TSQ_CATEGORY_ENRICH_LIVE="${TSQ_CATEGORY_ENRICH_LIVE:-1}"
  if [[ -n "${TSQ_GLINER_VENV:-}" && -f "${TSQ_GLINER_VENV}/bin/activate" ]]; then
    # shellcheck disable=SC1090
    source "${TSQ_GLINER_VENV}/bin/activate"
  fi
fi

python3 run_all.py ${TSQ_QG_ARGS:-}
