#!/usr/bin/env bash
# Reads changed paths (one per line) and prints which staging apps they touch, as GitHub outputs:
# body=true|false, brain=true|false, spider=true|false. A path it does not know touches all three.
set -euo pipefail

body=false
brain=false
spider=false

while IFS= read -r path || [ -n "$path" ]; do
  case "$path" in
    '') ;;
    *.md | .plan/* | LICENSE | *.example.env | *.env.example | docker-compose.yml) ;;
    apps/body/*) body=true ;;
    apps/brain/*) brain=true ;;
    apps/spider/*) spider=true ;;
    .github/workflows/*) body=true brain=true spider=true ;;
    .github/*) ;;
    *) body=true brain=true spider=true ;;
  esac
done

echo "body=$body"
echo "brain=$brain"
echo "spider=$spider"
