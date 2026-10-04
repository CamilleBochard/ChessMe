#!/usr/bin/env bash
# Downloads Stockfish, the engine that measures the Blunder Profile, into tools/.
#
# The release is pinned by tag and sha256: the profile records which engine
# measured it, and a different build could score the same moves differently.
# The universal build picks the fastest code path the CPU supports at startup.
#
# Run from the repository root:
#
#     scripts/fetch_stockfish.sh
#
# Needs curl and tar.

set -euo pipefail

STOCKFISH_TAG="sf_19"
STOCKFISH_ASSET="stockfish-linux-x86-64-universal"
STOCKFISH_SHA256="9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f"

TOOLS_DIR="$(pwd)/tools"
STOCKFISH_DIR="$TOOLS_DIR/stockfish"

if [ -x "$STOCKFISH_DIR/stockfish" ]; then
  echo "Stockfish is already in $STOCKFISH_DIR"
  exit 0
fi

mkdir -p "$STOCKFISH_DIR"
archive="$TOOLS_DIR/stockfish.tar.gz"
curl --fail --location --silent --show-error --output "$archive" \
  "https://github.com/official-stockfish/Stockfish/releases/download/$STOCKFISH_TAG/$STOCKFISH_ASSET.tar.gz"
echo "$STOCKFISH_SHA256  $archive" | sha256sum --check --quiet

# The archive holds the sources too; only the binary is kept.
tar --extract --gzip --file "$archive" --directory "$STOCKFISH_DIR" \
  --strip-components=1 "stockfish/$STOCKFISH_ASSET"
mv "$STOCKFISH_DIR/$STOCKFISH_ASSET" "$STOCKFISH_DIR/stockfish"
rm "$archive"

echo "Stockfish installed in $STOCKFISH_DIR"
