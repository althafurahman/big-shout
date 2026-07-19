#!/bin/zsh
# BigShout bot crowd — run under launchd (see ops/README.md).
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/../cranker"
exec npx ts-node src/bots.ts
