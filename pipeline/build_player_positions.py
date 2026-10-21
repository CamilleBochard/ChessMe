"""Builds the positions Camille reached, for the game page's end-of-game report.

Run from the repository root:

    python -m pipeline.build_player_positions

The positions come from the games the Bot is built from, picked as the
dataset picks them, up to the fifteenth move. The file is served as it is
and fetched by the page only once a game is over.
"""

import json
from pathlib import Path

from pipeline.build_dataset import PLAYER
from pipeline.dataset import kept_games
from pipeline.player_positions import positions_reached

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPOSITORY_ROOT / "data" / "raw"
POSITIONS_PATH = REPOSITORY_ROOT / "public" / "data" / "camille-positions.json"

# Fifteen moves of each side. Past them a game almost never meets one of his
# positions again, and each further move would add to the file the page fetches.
PLIES = 30


def build(raw_dir: Path, positions_path: Path) -> list[str]:
    games = [game for game, _ in kept_games(sorted(raw_dir.glob("*.pgn")))]
    positions = positions_reached(games, PLAYER, PLIES)

    positions_path.parent.mkdir(parents=True, exist_ok=True)
    # One position a line keeps the file readable in a diff.
    positions_path.write_text("[\n" + ",\n".join(json.dumps(position) for position in positions) + "\n]\n", encoding="utf-8")
    return positions


if __name__ == "__main__":
    built = build(RAW_DIR, POSITIONS_PATH)
    print(f"{len(built)} positions written to {POSITIONS_PATH}")
