#!/usr/bin/env bash
# Downloads the served Base Model and Opening Book from the bot-data release
# named in docker/bot-data-release, and checks them against
# docker/bot-data.sha256. Needs the gh CLI, authenticated through GH_TOKEN.
set -euo pipefail

release="$(cat docker/bot-data-release)"
mkdir -p models/onnx data/dataset
gh release download "$release" --pattern maia3-5m-fine-tuned.onnx --dir models/onnx --clobber
gh release download "$release" --pattern opening-book.json --dir data/dataset --clobber
sha256sum --check docker/bot-data.sha256
