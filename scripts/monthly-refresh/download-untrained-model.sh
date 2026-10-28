#!/usr/bin/env bash
# Downloads the untrained Maia-3 5M, the yardstick the served model is
# measured against on each month's new games (pipeline/new_games_matching.py),
# from the release named below, and checks it against the checksum beside
# this script. The file never changes: it is Maia-3 5M as published,
# converted once by pipeline/convert_maia3.py. Needs the gh CLI,
# authenticated through GH_TOKEN.
set -euo pipefail

release="untrained-maia3-5m"
here="$(dirname "$0")"
mkdir -p models/onnx
gh release download "$release" --pattern maia3-5m.onnx --dir models/onnx --clobber
sha256sum --check "$here/untrained-model.sha256"
