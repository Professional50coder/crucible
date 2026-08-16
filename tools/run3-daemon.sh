#!/usr/bin/env bash
#
# Run the orchestrator daemon on WSL2 Linux.
#
# Runs 1 and 2 were driven by scripts: tools/run2-create.mjs created the task and
# tools/ack-now.mjs acknowledged it. Both worked, and neither exercised the
# component this project's headline claim is about. This script starts the actual
# daemon — submitter, poller, acknowledger, HTTP API — and then does nothing. The
# daemon submits, watches, and acknowledges on its own schedule.
#
# Why Linux: acknowledgeModel's default downloadMethod is 'auto', which tries 0G
# Storage first, which shells out to a bundled 0g-storage-client that is a Linux
# ELF. On Windows that is ENOENT and the model is lost (run 1). Under WSL2 it is
# the path that retrieved 93,642,469 bytes for run 2. The daemon is left on its
# defaults here deliberately: if it needs to be forced onto the TEE path to work,
# that is worth knowing.
#
#   wsl -d Ubuntu -- bash /mnt/c/.../tools/run3-daemon.sh
#
set -euo pipefail

ROOT=/mnt/c/Users/rcgop/Desktop/work/crucible
# nvm's node, not the Windows node.exe reachable over interop — the bundled
# storage client is an ELF and needs a Linux process to spawn it.
NODE=/home/rcgop/.nvm/versions/node/v22.23.2/bin/node

cd "$ROOT/services/orchestrator"

# PRIVATE_KEY comes from the gitignored .env and is never echoed.
set -a
# shellcheck disable=SC1091
. "$ROOT/.env"
set +a

export CRUCIBLE_NETWORK=testnet
export CRUCIBLE_DATA_DIR="$ROOT/services/orchestrator/data"
export CRUCIBLE_PORT=${CRUCIBLE_PORT:-8787}
export CRUCIBLE_HOST=127.0.0.1

# Compiled output, not `npm start` (tsx). tsx needs a Linux esbuild binary and
# node_modules here was installed on Windows; tsc is pure JS, so `npm run build`
# on Windows produces a dist/ that this Linux node runs without a second install.
exec "$NODE" dist/main.js
