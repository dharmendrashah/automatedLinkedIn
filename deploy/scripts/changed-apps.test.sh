#!/usr/bin/env bash
# Tests for changed-apps.sh. Run with: bash deploy/scripts/changed-apps.test.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
failed=0

check() {
  local name="$1" expected="$2" paths="$3" got
  got="$(printf '%s' "$paths" | bash "$here/changed-apps.sh" | tr '\n' ' ' | sed 's/ $//')"

  if [ "$got" = "$expected" ]; then
    echo "PASS $name"
  else
    echo "FAIL $name: got '$got', expected '$expected'" >&2
    failed=1
  fi
}

check 'body only' 'body=true brain=false spider=false' $'apps/body/src/App.tsx\nMEMORY.md\n.plan/x.md'
check 'brain only' 'body=false brain=true spider=false' 'apps/brain/src/server.ts'
check 'spider only' 'body=false brain=false spider=true' 'apps/spider/src/tasks/registry.ts'
check 'two apps' 'body=true brain=true spider=false' $'apps/body/src/main.tsx\napps/brain/prisma/schema.prisma'
check 'shared package' 'body=true brain=true spider=true' 'packages/contracts/src/invites.ts'
check 'lockfile' 'body=true brain=true spider=true' 'pnpm-lock.yaml'
check 'manifests' 'body=true brain=true spider=true' 'deploy/overlays/staging/kustomization.yaml'
check 'workflow' 'body=true brain=true spider=true' '.github/workflows/staging.yml'
check 'unknown root file' 'body=true brain=true spider=true' 'something-new.json'
check 'docs and agents only' 'body=false brain=false spider=false' $'README.md\n.github/agents/x.agent.md\ndocker-compose.yml\nLICENSE\napps/brain/.env.example'
check 'nothing' 'body=false brain=false spider=false' ''

exit "$failed"
