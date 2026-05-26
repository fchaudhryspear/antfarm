#!/usr/bin/env bash
set -euo pipefail

shared="/Users/faisalshomemacmini/.openclaw/Obsidian Vault/factory-shared"
sensitive="/Users/faisalshomemacmini/.openclaw/Obsidian Vault/factory-sensitive"

test -d "$shared"
test -d "$shared/.obsidian"
test -d "$sensitive"
test -d "$sensitive/.obsidian"

for tenant in flobase credologi; do
  test -d "$sensitive/$tenant"
done

if [ ! -f "/Users/faisalshomemacmini/.openclaw/antfarm/workflows/antfarm-v3.1/factory-vault-routes.yaml" ]; then
  echo "missing route projection" >&2
  exit 1
fi

echo "vault roots and required sensitive tenant subtrees verified"
