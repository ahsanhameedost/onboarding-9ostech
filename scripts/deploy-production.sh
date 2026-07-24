#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_ROOT="${PROJECT_ROOT}/dist"

cd "${PROJECT_ROOT}"

if [[ -x /opt/cpanel/ea-nodejs22/bin/npm ]]; then
  export PATH="/opt/cpanel/ea-nodejs22/bin:${PATH}"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "OakBoard deployment failed: npm is not available." >&2
  exit 1
fi

echo "Building OakBoard production files in ${DIST_ROOT}"
if [[ "${OAKBOARD_SKIP_INSTALL:-0}" != "1" ]]; then
  npm ci --no-audit --no-fund
else
  echo "Skipping npm ci because OAKBOARD_SKIP_INSTALL=1."
fi
npm run typecheck
npm run build

required_files=(
  "${DIST_ROOT}/index.html"
  "${DIST_ROOT}/.htaccess"
  "${DIST_ROOT}/api/index.php"
  "${DIST_ROOT}/api/auth.php"
  "${DIST_ROOT}/api/bootstrap.php"
  "${DIST_ROOT}/api/mailgun.php"
)

for required_file in "${required_files[@]}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "OakBoard deployment failed: missing ${required_file}" >&2
    exit 1
  fi
done

if grep -q '/src/main.tsx' "${DIST_ROOT}/index.html"; then
  echo "OakBoard deployment failed: dist/index.html is a development entry file." >&2
  exit 1
fi

echo "OakBoard deployment ready. The subdomain document root must be ${DIST_ROOT}"
