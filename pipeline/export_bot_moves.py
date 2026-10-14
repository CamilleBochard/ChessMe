"""Writes each move the Bot made in a set of games, with the evaluation it lost.

Run from the repository root:

    python -m pipeline.export_bot_moves data/dataset/bot-games-original.jsonl \\
        --out data/dataset/bot-moves-original.jsonl

Each line holds one of the Bot's moves in the dataset's shape (game, ply,
Phase, the position as a FEN and the move) and its centipawn loss, measured
by the Blunder Profile's own code from the same Stockfish cache. Games
already analysed for an earlier measurement cost no new analysis.

The losses stay with Python, which owns Stockfish; the measurements written
in TypeScript read this file to know which of the Bot's moves were mistakes.
"""

import argparse
import json
from dataclasses import asdict
from pathlib import Path

from pipeline.bot_games import read_bot_games
from pipeline.extract_blunder_profile import (
    ProgressPrinter,
    add_stockfish_arguments,
    measure_move_losses,
    running_stockfish,
)
from pipeline.stockfish_analysis import Analyser


def export_bot_moves(games_path: Path, out_path: Path, analysers: list[Analyser], cache_path: Path) -> int:
    """Writes the Bot's moves with their losses and returns how many were written."""
    positions = read_bot_games(games_path)
    losses = measure_move_losses(positions, analysers, cache_path, ProgressPrinter())

    with open(out_path, "w", encoding="utf-8") as out_file:
        for position, loss in zip(positions, losses):
            row = asdict(position)
            row["centipawn_loss"] = loss.centipawn_loss
            out_file.write(json.dumps(row) + "\n")
    return len(positions)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Write the Bot's moves in a set of games with their losses.")
    parser.add_argument("games", type=Path, help="Games written by scripts/bot-games.ts")
    parser.add_argument("--out", type=Path, required=True, help="Where to write the moves, one per line")
    add_stockfish_arguments(parser)
    arguments = parser.parse_args()

    with running_stockfish(arguments.depth, arguments.workers) as (stockfish_processes, cache_path):
        written = export_bot_moves(arguments.games, arguments.out, stockfish_processes, cache_path)
    print(f"{written} moves of the Bot written to {arguments.out}")
