#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

ACTION=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --action) ACTION="${2:-}"; shift 2 ;;
    *) fail "Unknown desktop action argument: $1" ;;
  esac
done

case "$ACTION" in
  preflight)
    discover_codex_app
    running="false"
    codex_is_running && running="true"
    printf '{"codexInstalled":true,"codexRunning":%s,"codexVersion":"%s"}\n' \
      "$running" "$CODEX_VERSION"
    ;;
  stop-codex)
    discover_codex_app
    require_macos_runtime
    stop_codex true
    printf '{"stopped":true}\n'
    ;;
  *)
    fail "Desktop action must be preflight or stop-codex."
    ;;
esac
