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

Camille's training games and Test Set are also measured apart: the same
player on two sets of games shows how far fingerprints drift by chance.
Written to data/dataset/style-fingerprint.json; a Markdown table of the
fingerprints goes to standard output.
"""

import argparse
import json
from pathlib import Path
from typing import Callable

from pipeline.blunder_profile import share_losing_at_least
from pipeline.bot_games import read_bot_games
from pipeline.dataset import PHASE_LABELS, PHASES, Position, read_dataset
from pipeline.extract_blunder_profile import (
    DATASET_DIR,
    ProgressPrinter,
    add_stockfish_arguments,
    measure_move_losses,
    running_stockfish,
)
from pipeline.stockfish_analysis import Analyser
from pipeline.style_fingerprint import PIECE_NAMES, build_style_fingerprint

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

    fingerprints = {
        "format_version": FORMAT_VERSION,
        "engine": analysers[0].engine,
        "depth": analysers[0].depth,
        "camille": _fingerprint(camille_positions, analysers, cache_path, report_progress),
        "bot": _fingerprint(bot_positions, analysers, cache_path, report_progress),
        # The same player on two sets of his own games: how far apart they
        # land is how far two fingerprints drift by chance, the yardstick for
        # whether a gap between Camille and the Bot means anything.
        "camille_training_games": _fingerprint(dataset.train, analysers, cache_path, report_progress),
        "camille_test_set": _fingerprint(dataset.test, analysers, cache_path, report_progress),
    }
    fingerprint_path.write_text(json.dumps(fingerprints, indent=1), encoding="utf-8")
    return fingerprints


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


# The columns of the table, in order, and the fingerprint each one shows.
COLUMNS = [
    ("Camille", "camille"),
    ("Bot", "bot"),
    ("Camille, training games", "camille_training_games"),
    ("Camille, Test Set", "camille_test_set"),
]

# The usual threshold for a blunder: three pawns.
BLUNDER_CENTIPAWNS = 300


def side_by_side_table(fingerprints: dict) -> str:
    """The fingerprints as one Markdown table: Camille, the Bot, then Camille's two halves for scale."""
    titles = [title for title, _ in COLUMNS]
    rows = [_table_row("Statistic", titles), "|---|" + "---|" * len(COLUMNS)]

    def add(label: str, cell_of: Callable[[dict], str]) -> None:
        cells = [cell_of(fingerprints[key]) for _, key in COLUMNS]
        rows.append(_table_row(label, cells))

    add("Games", lambda player: f"{player['games']:,}")
    add("Moves", lambda player: f"{player['moves']:,}")

    for phase in PHASES:
        label = PHASE_LABELS[phase]
        add(f"Mean centipawn loss, {label}", lambda player: _decimal(_losses(player, phase)["mean"]))
        add(f"Median loss, {label}", lambda player: _whole(_losses(player, phase)["percentiles"]["50"]))
        add(f"90th percentile loss, {label}", lambda player: _whole(_losses(player, phase)["percentiles"]["90"]))
        add(
            f"Moves losing {BLUNDER_CENTIPAWNS} or more, {label}",
            lambda player: _percent(share_losing_at_least(_losses(player, phase), BLUNDER_CENTIPAWNS)),
        )

    # Shares over the whole game would mostly measure how long games last,
    # since the king and rooks move far more in the endgame, so each Phase is
    # shown on its own.
    for phase in PHASES:
        for piece in PIECE_NAMES.values():
            add(
                f"Moves made by a {piece}, {PHASE_LABELS[phase]}",
                lambda player: _percent(player["piece_share"]["phases"][phase][piece]),
            )

    for phase in PHASES:
        add(
            f"Capture taken when one is on offer, {PHASE_LABELS[phase]}",
            lambda player: _percent(player["capture_taken_rate"]["phases"][phase]["rate"]),
        )

    add("Queens off before move 20", lambda player: _percent(player["queen_trade_before_move_20"]["rate"]))
    add("Games reaching move 30", lambda player: _percent(_share_reaching_move_30(player)))
    add("Material at move 30, mean (of 78)", lambda player: _decimal(player["material_at_move_30"]["mean"]))
    add("Castled kingside", lambda player: _percent(player["castling"]["kingside"]))
    add("Castled queenside", lambda player: _percent(player["castling"]["queenside"]))
    add("Never castled", lambda player: _percent(player["castling"]["never"]))
    return "\n".join(rows)


def _table_row(label: str, cells: list[str]) -> str:
    columns = [label] + cells
    return f"| {' | '.join(columns)} |"


def _losses(player: dict, phase: str) -> dict:
    """The distribution of one Phase's centipawn losses."""
    return player["centipawn_loss"]["phases"][phase]


def _share_reaching_move_30(player: dict) -> float:
    material = player["material_at_move_30"]
    return material["games_reaching_move_30"] / material["games"]


def _decimal(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:.1f}"


def _whole(value: int | None) -> str:
    if value is None:
        return "-"
    return str(value)


def _percent(share: float | None) -> str:
    if share is None:
        return "-"
    return f"{100 * share:.1f}%"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Measure the Style Fingerprint of Camille and of the Bot.")
    parser.add_argument("--bot-games", type=Path, default=BOT_GAMES_PATH, help="the games npm run bot-games wrote")
    add_stockfish_arguments(parser)
    arguments = parser.parse_args()

    with running_stockfish(arguments.depth, arguments.workers) as (stockfish_processes, cache_path):
        fingerprints = extract(
            DATASET_DIR, arguments.bot_games, cache_path, FINGERPRINT_PATH, stockfish_processes, ProgressPrinter()
        )

    print(f"Written to {FINGERPRINT_PATH}")
    print()
    print(side_by_side_table(fingerprints))
