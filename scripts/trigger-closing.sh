#!/bin/zsh
set -euo pipefail

URL="${CLOSING_URL:-http://localhost:3000/api/jobs/closing}"
SECRET="${CRON_SECRET:-}"
TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-15}"

if [[ -z "$SECRET" ]]; then
  echo "CRON_SECRET is required." >&2
  exit 1
fi

echo "Triggering closing job at $URL..."

if ! response=$(curl \
  --fail-with-body \
  --silent \
  --show-error \
  --max-time "$TIMEOUT_SECONDS" \
  --request POST "$URL" \
  --header "x-cron-secret: $SECRET" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json"); then
  echo "Closing job request failed. Response: ${response:-<no response body>}" >&2
  exit 1
fi

echo "Response: $response"
