#!/usr/bin/env bash

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
	echo "Internal preview launcher currently supports macOS only." >&2
	exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
RELEASE_DIR="${DESKTOP_DIR}/release"

if [[ ! -d "${RELEASE_DIR}" ]]; then
	echo "No release directory found at ${RELEASE_DIR}." >&2
	echo "Run 'bun run package:internal' first." >&2
	exit 1
fi

APP_PATH="$(find "${RELEASE_DIR}" -maxdepth 3 -type d -name "Localset Internal.app" | head -n 1)"

if [[ -z "${APP_PATH}" ]]; then
	echo "Could not find Localset Internal.app in ${RELEASE_DIR}." >&2
	echo "Run 'bun run package:internal' first." >&2
	exit 1
fi

APP_BINARY="${APP_PATH}/Contents/MacOS/Localset Internal"

if [[ ! -x "${APP_BINARY}" ]]; then
	echo "Expected preview binary is missing or not executable: ${APP_BINARY}" >&2
	exit 1
fi

export SUPERSET_HOME_DIR="${SUPERSET_HOME_DIR:-$HOME/.superset-preview}"
export SUPERSET_WORKSPACE_NAME="${SUPERSET_WORKSPACE_NAME:-preview}"

echo "Launching ${APP_PATH}"
echo "SUPERSET_HOME_DIR=${SUPERSET_HOME_DIR}"
echo "SUPERSET_WORKSPACE_NAME=${SUPERSET_WORKSPACE_NAME}"

exec "${APP_BINARY}"
