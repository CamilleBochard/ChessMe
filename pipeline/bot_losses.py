"""Measures the Bot's evaluation losses in games it played, beside Camille's Blunder Profile.

Every move goes through the Blunder Profile's own code: the same Stockfish
analysis, at the same depth, from the same cache. Each set of the Bot's games
is a run, under a label the caller chooses (a temperature, a model), and is
reported per Phase beside Camille's losses with how far apart the two are.
The profile is a yardstick: nothing here feeds back into how the Bot plays.
"""

import argparse
from pathlib import Path
from typing import Callable

from pipeline.blunder_profile import (
    PERCENTILES,
    MoveLoss,
    build_blunder_profile,
    in_open_positions,
    share_in_decided_positions,
    share_losing_at_least,
)
from pipeline.bot_games import read_bot_games, read_bot_results
from pipeline.dataset import PHASE_LABELS, PHASES, read_dataset
from pipeline.draw_temperature import loss_distance, phase_distances
from pipeline.extract_blunder_profile import measure_move_losses
from pipeline.stockfish_analysis import Analyser

# Which of the players' moves the distance that decides is read on. Open
# positions compare like with like: the Bot's games run on to mate while
# Camille's often end in a resignation, so on every move the Bot would be
# credited with the moves it makes in games already decided. Every move
# counts those moves too, as the Blunder Profile itself does.
OPEN_POSITIONS = "open positions"
EVERY_MOVE = "every move"
YARDSTICKS = [OPEN_POSITIONS, EVERY_MOVE]


def add_yardstick_argument(parser: argparse.ArgumentParser) -> None:
    """The --yardstick option of every command that compares the Bot's losses with Camille's."""
    parser.add_argument(
        "--yardstick",
        choices=YARDSTICKS,
        default=OPEN_POSITIONS,
        help="the moves the distance that decides is read on: those made in Open Positions, or every move, "
        f"including those made once the game was decided (default {OPEN_POSITIONS})",
    )


def moves_read_on(yardstick: str, moves: list[MoveLoss]) -> list[MoveLoss]:
    """The moves a distance on this yardstick is read on."""
    if yardstick == OPEN_POSITIONS:
        return in_open_positions(moves)
    return moves


def measure_against_camille(
    dataset_dir: Path,
    runs: dict[str, Path],
    cache_path: Path,
    analysers: list[Analyser],
    report_progress: Callable[[int, int], None] | None = None,
    yardstick: str = OPEN_POSITIONS,
) -> dict:
    """Measures Camille's moves and the Bot's in each run, keyed by the run's label.

    Each run's "distance" is read on the yardstick's moves; the distance on
    the other moves is reported beside it.
    """
    if yardstick not in YARDSTICKS:
        raise ValueError(f"unknown yardstick {yardstick!r}, expected one of {YARDSTICKS}")
    dataset = read_dataset(dataset_dir)
    camille = measure_move_losses(dataset.train + dataset.test, analysers, cache_path, report_progress)
    # The same player on two sets of his own games: how far apart they land
    # is how far two sets of games drift by chance, the yardstick for whether
    # the gap between two runs means anything.
    training_games = measure_move_losses(dataset.train, analysers, cache_path, report_progress)
    test_set = measure_move_losses(dataset.test, analysers, cache_path, report_progress)

    measured_runs = {}
    for label, games_path in runs.items():
        bot_positions = read_bot_games(games_path)
        bot = measure_move_losses(bot_positions, analysers, cache_path, report_progress)
        games = {position.game_id for position in bot_positions}
        bot_in_open_positions = in_open_positions(bot)
        camille_in_open_positions = in_open_positions(camille)
        measured_runs[label] = {
            "games": len(games),
            "results": read_bot_results(games_path),
            "distance": loss_distance(moves_read_on(yardstick, bot), moves_read_on(yardstick, camille)),
            "distance_on_every_move": loss_distance(bot, camille),
            "distance_in_open_positions": loss_distance(bot_in_open_positions, camille_in_open_positions),
            "phase_distances_on_every_move": phase_distances(bot, camille),
            "phase_distances_in_open_positions": phase_distances(bot_in_open_positions, camille_in_open_positions),
            "share_in_decided_positions": share_in_decided_positions(bot),
            "centipawn_loss": build_blunder_profile(bot),
            "centipawn_loss_in_open_positions": build_blunder_profile(bot_in_open_positions),
        }

    chance_gap = loss_distance(moves_read_on(yardstick, test_set), moves_read_on(yardstick, training_games))

    return {
        "engine": analysers[0].engine,
        "depth": analysers[0].depth,
        "yardstick": yardstick,
        "camille": {
            "centipawn_loss": build_blunder_profile(camille),
            "share_in_decided_positions": share_in_decided_positions(camille),
            "centipawn_loss_in_open_positions": build_blunder_profile(in_open_positions(camille)),
        },
        "camille_test_set_from_training_games": chance_gap,
        "runs": measured_runs,
    }


# The usual thresholds for an inaccuracy, a mistake and a blunder.
LOSS_THRESHOLDS = [50, 100, 300]


def loss_tables(camille: dict, runs: dict[str, dict], in_open_positions: bool = False) -> str:
    """One Markdown table per Phase: Camille's losses, then the Bot's in each run, under the run's name.

    With in_open_positions, only the moves made while the game was still
    open are counted, for both players.
    """
    header_cells = ["Player", "Moves", "Mean"]
    header_cells += [f"p{percentile}" for percentile in PERCENTILES]
    header_cells += [f"{threshold} or more" for threshold in LOSS_THRESHOLDS]

    profile_key = "centipawn_loss"
    if in_open_positions:
        profile_key = "centipawn_loss_in_open_positions"
    players = [("Camille", camille[profile_key])]
    for name, measured in runs.items():
        players.append((name, measured[profile_key]))

    lines = []
    for phase in PHASES:
        lines.append(PHASE_LABELS[phase])
        lines.append("")
        lines.append(table_row(header_cells))
        lines.append("|---|" + "---|" * (len(header_cells) - 1))
        for name, profile in players:
            lines.append(table_row([name] + _loss_cells(profile["phases"][phase])))
        lines.append("")
    return "\n".join(lines)


def _loss_cells(distribution: dict) -> list[str]:
    cells = [f"{distribution['moves']:,}", decimal(distribution["mean"])]
    for percentile in PERCENTILES:
        value = distribution["percentiles"][str(percentile)]
        if value is None:
            cells.append("-")
        else:
            cells.append(str(value))
    for threshold in LOSS_THRESHOLDS:
        cells.append(percent(share_losing_at_least(distribution, threshold)))
    return cells


def summary_table(runs: dict[str, dict], run_heading: str) -> str:
    """One row per run: its games, the Bot's results and how far its losses are from Camille's."""
    header_cells = [
        run_heading,
        "Games",
        "Won, drawn, lost",
        "Distance, every move",
        "Distance, open positions",
        "Endgame moves in decided positions",
    ]
    lines = [table_row(header_cells), "|---|" + "---|" * (len(header_cells) - 1)]
    for label, measured in runs.items():
        outcome = measured["results"]
        cells = [
            label,
            f"{measured['games']:,}",
            f"{outcome['won']}, {outcome['drawn']}, {outcome['lost']}",
            decimal(measured["distance_on_every_move"]),
            decimal(measured["distance_in_open_positions"]),
            percent(measured["share_in_decided_positions"]["endgame"]),
        ]
        lines.append(table_row(cells))
    return "\n".join(lines)


def phase_distance_table(runs: dict[str, dict]) -> str:
    """Each Phase's own distance in each run, on every move, then on the moves made in open positions."""
    labels = list(runs)
    header_cells = ["Phase"] + labels + [f"{label}, open positions" for label in labels]
    lines = [table_row(header_cells), "|---|" + "---|" * (len(header_cells) - 1)]
    for phase in PHASES:
        cells = [PHASE_LABELS[phase]]
        for label in labels:
            cells.append(decimal(runs[label]["phase_distances_on_every_move"][phase]))
        for label in labels:
            cells.append(decimal(runs[label]["phase_distances_in_open_positions"][phase]))
        lines.append(table_row(cells))
    return "\n".join(lines)


def table_row(cells: list[str]) -> str:
    return f"| {' | '.join(cells)} |"


def decimal(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:.1f}"


def percent(share: float | None) -> str:
    if share is None:
        return "-"
    return f"{100 * share:.1f}%"
