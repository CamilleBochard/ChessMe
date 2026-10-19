"""Builds Camille's record for the game page from every export in data/raw.

Run from the repository root:

    python -m pipeline.build_player_record

The record covers the games the Bot is built from, picked as the dataset
picks them, and names their openings with Lichess's openings table, kept in
data/openings. It is written as JSON beside the component that shows it.
"""

import json
from pathlib import Path

from pipeline.build_dataset import PLAYER
from pipeline.dataset import kept_games
from pipeline.player_record import OPENINGS_DIR, player_record, read_opening_table

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPOSITORY_ROOT / "data" / "raw"
RECORD_PATH = REPOSITORY_ROOT / "src" / "record" / "player-record.json"


def build(raw_dir: Path, openings_dir: Path, record_path: Path) -> dict:
    games = [game for game, _ in kept_games(sorted(raw_dir.glob("*.pgn")))]
    table = read_opening_table(openings_dir)
    record = player_record(games, PLAYER, table)

    record_path.parent.mkdir(parents=True, exist_ok=True)
    record_path.write_text(json.dumps(record, indent=1, ensure_ascii=False), encoding="utf-8")
    return record


if __name__ == "__main__":
    built = build(RAW_DIR, OPENINGS_DIR, RECORD_PATH)
    results = built["results"]
    print(
        f"{built['games']} games ({built['white']['games']} with White, {built['black']['games']} with Black): "
        f"{results['wins']} wins, {results['draws']} draws, {results['losses']} losses, written to {RECORD_PATH}"
    )
