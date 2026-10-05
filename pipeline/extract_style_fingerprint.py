"""Measures the Style Fingerprint of Camille and of the Bot, side by side.

Run from the repository root, once the dataset is built, Stockfish installed
and the Bot's games played with `npm run bot-games`:

    python -m pipeline.extract_style_fingerprint

Camille's positions come from the dataset, training games and Test Set
together; the Bot's from data/dataset/bot-games.jsonl. Both go through the
same code: the same Stockfish analysis, at the same depth, from the same
cache, and the same fingerprint function. Camille's moves are already in the
cache once the Blunder Profile has been extracted, so only the Bot's moves
cost Stockfish time.

Written to data/dataset/style-fingerprint.json; a Markdown table of the two
fingerprints goes to standard output.
"""

import argparse
import json
from pathlib import Path
from typing import Callable

from pipeline.bot_games import read_bot_games
from pipeline.dataset import PHASES, Position, read_dataset
from pipeline.extract_blunder_profile import (
    ANALYSIS_DIR,
    DATASET_DIR,
    DEFAULT_DEPTH,
    STOCKFISH_PATH,
    ProgressPrinter,
    cache_path_for,
    default_worker_count,
    measure_move_losses,
)
from pipeline.stockfish_analysis import Analyser, StockfishAnalyser
from pipeline.style_fingerprint import build_style_fingerprint

# The version of the file's layout. Raise it whenever a reader of the old
# layout would misread the new one.
FORMAT_VERSION = 1

BOT_GAMES_PATH = DATASET_DIR / "bot-games.jsonl"
FINGERPRINT_PATH = DATASET_DIR / "style-fingerprint.json"


def extract(
    dataset_dir: Path,
    bot_games_path: Path,
    cache_path: Path,
    fingerprint_path: Path,
    analysers: list[Analyser],
    report_progress: Callable[[int, int], None] | None = None,
) -> dict:
    dataset = read_dataset(dataset_dir)
    camille_positions = dataset.train + dataset.test
    bot_positions = read_bot_games(bot_games_path)

    written = {
        "format_version": FORMAT_VERSION,
        "engine": analysers[0].engine,
        "depth": analysers[0].depth,
        "camille": _fingerprint(camille_positions, analysers, cache_path, report_progress),
        "bot": _fingerprint(bot_positions, analysers, cache_path, report_progress),
    }
    fingerprint_path.write_text(json.dumps(written, indent=1), encoding="utf-8")
    return written


def _fingerprint(
    positions: list[Position],
    analysers: list[Analyser],
    cache_path: Path,
    report_progress: Callable[[int, int], None] | None,
) -> dict:
    move_losses = measure_move_losses(positions, analysers, cache_path, report_progress)
    games = {position.game_id for position in positions}
    fingerprint = {"games": len(games), "moves": len(positions)}
    fingerprint.update(build_style_fingerprint(positions, move_losses))
    return fingerprint


PHASE_LABELS = {"opening": "Opening (1-10)", "middlegame": "Middlegame (11-30)", "endgame": "Endgame (31+)"}

PIECES = ["pawn", "knight", "bishop", "rook", "queen", "king"]


def side_by_side_table(written: dict) -> str:
    """The two fingerprints as one Markdown table, Camille's column beside the Bot's."""
    camille = written["camille"]
    bot = written["bot"]
    rows = ["| Statistic | Camille | Bot |", "|---|---|---|"]

    def add(label: str, read: Callable[[dict], str]) -> None:
        rows.append(f"| {label} | {read(camille)} | {read(bot)} |")

    add("Games", lambda player: f"{player['games']:,}")
    add("Moves", lambda player: f"{player['moves']:,}")

    for phase in PHASES:
        label = PHASE_LABELS[phase]
        add(f"Mean centipawn loss, {label}", lambda player: _number(player["centipawn_loss"]["phases"][phase]["mean"]))
        add(f"Moves losing 300 or more, {label}", lambda player: _percent(_share_losing_300(player, phase)))
        add(f"Median loss, {label}", lambda player: str(player["centipawn_loss"]["phases"][phase]["percentiles"]["50"]))
        add(f"90th percentile loss, {label}", lambda player: str(player["centipawn_loss"]["phases"][phase]["percentiles"]["90"]))

    for piece in PIECES:
        add(f"Moves made by a {piece}", lambda player: _percent(player["piece_share"]["all_phases"][piece]))

    for phase in PHASES:
        label = PHASE_LABELS[phase]
        add(f"Capture taken when one is on offer, {label}", lambda player: _percent(player["capture_taken_rate"]["phases"][phase]["rate"]))

    add("Queens off before move 20", lambda player: _percent(player["queen_trade_before_move_20"]["rate"]))
    add("Games reaching move 30", lambda player: _percent(player["material_at_move_30"]["games_reaching_move_30"] / player["games"]))
    add("Material at move 30, mean (of 78)", lambda player: _number(player["material_at_move_30"]["mean"]))
    add("Castled kingside", lambda player: _percent(player["castling"]["kingside"]))
    add("Castled queenside", lambda player: _percent(player["castling"]["queenside"]))
    add("Never castled", lambda player: _percent(player["castling"]["never"]))
    return "\n".join(rows)


def _share_losing_300(player: dict, phase: str) -> float | None:
    distribution = player["centipawn_loss"]["phases"][phase]
    if distribution["moves"] == 0:
        return None
    losing_300 = 0
    for bucket in distribution["histogram"]:
        if bucket["from"] >= 300:
            losing_300 += bucket["moves"]
    return losing_300 / distribution["moves"]


def _number(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:.1f}"


def _percent(share: float | None) -> str:
    if share is None:
        return "-"
    return f"{100 * share:.1f}%"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Measure the Style Fingerprint of Camille and of the Bot.")
    parser.add_argument("--bot-games", type=Path, default=BOT_GAMES_PATH, help="the games npm run bot-games wrote")
    parser.add_argument(
        "--depth",
        type=int,
        default=DEFAULT_DEPTH,
        help=f"Stockfish search depth, the Blunder Profile's by default ({DEFAULT_DEPTH})",
    )
    default_workers = default_worker_count()
    parser.add_argument(
        "--workers",
        type=int,
        default=default_workers,
        help=f"Stockfish processes run in parallel (default {default_workers})",
    )
    arguments = parser.parse_args()

    if not STOCKFISH_PATH.exists():
        raise SystemExit(f"Stockfish is not at {STOCKFISH_PATH}; run scripts/fetch_stockfish.sh first.")

    stockfish_processes = []
    for _ in range(arguments.workers):
        stockfish_processes.append(StockfishAnalyser(STOCKFISH_PATH, arguments.depth))
    try:
        cache_path = cache_path_for(stockfish_processes[0].engine, arguments.depth)
        ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
        print(
            f"Analysing with {stockfish_processes[0].engine} at depth {arguments.depth}, caching in {cache_path}",
            flush=True,
        )
        result = extract(
            DATASET_DIR, arguments.bot_games, cache_path, FINGERPRINT_PATH, stockfish_processes, ProgressPrinter()
        )
    finally:
        for stockfish in stockfish_processes:
            stockfish.close()

    print(f"Written to {FINGERPRINT_PATH}")
    print()
    print(side_by_side_table(result))
