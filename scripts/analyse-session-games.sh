#!/bin/sh
# Analyses the stored Session Games as evidence about the Bot's Level, in the
# three steps pipeline/analyse_session_games.py describes:
#
#     scripts/analyse-session-games.sh [data/session-games.sqlite] [--include-assisted]
#
# Stockfish measures the Bot's moves, the served Base Model gives its
# probability for each, and the report sets the games beside the Bot's games
# against the model and Camille's own. Run from the repository root.
set -eu
database=${1:-data/session-games.sqlite}
shift || true
out=data/session-analysis
model=$(npx tsx -e "import { SERVED_MODEL_SOURCE } from './src/engine/served-model'; console.log(SERVED_MODEL_SOURCE)")
rating=$(npx tsx -e "import { SERVED_MODEL_RATING } from './src/engine/served-model'; console.log(SERVED_MODEL_RATING)")

.venv/bin/python -m pipeline.analyse_session_games export --database "$database" --out "$out/bot-moves.jsonl" "$@"
npm run --silent move-probabilities -- "$model" --rating "$rating" "$out/bot-moves.jsonl" \
  --out "$out/bot-move-probabilities.jsonl" >&2
.venv/bin/python -m pipeline.analyse_session_games report --database "$database" --moves "$out/bot-moves.jsonl" \
  --probabilities "$out/bot-move-probabilities.jsonl" "$@"
