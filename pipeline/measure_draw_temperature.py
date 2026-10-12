"""Measures the Bot's evaluation losses at each temperature its games were
played at, beside Camille's Blunder Profile, and applies the rule that
chooses the temperature.

Run from the repository root, once the dataset is built, Stockfish installed
and the Bot's games played at each temperature with `npm run bot-games`:

    python -m pipeline.measure_draw_temperature \\
        --run 1=data/dataset/bot-games-temperature-1.jsonl \\
        --run 0.75=data/dataset/bot-games-temperature-0.75.jsonl

Every move goes through the Blunder Profile's own code: the same Stockfish
analysis, at the same depth, from the same cache. Camille's moves are in the
cache once the profile has been extracted, so only the Bot's moves cost
Stockfish time. The output says which temperature the rule
(pipeline/draw_temperature.py) wants measured next, or which it chooses.
Written to docs/experiments/results/draw-temperature.json; the tables go to
standard output as Markdown.
"""

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Callable

from pipeline.blunder_profile import (
    PERCENTILES,
    MoveLoss,
    build_blunder_profile,
    position_already_decided,
    share_losing_at_least,
)
from pipeline.bot_games import read_bot_games, read_bot_results
from pipeline.dataset import PHASE_LABELS, PHASES, Position, read_dataset
from pipeline.draw_temperature import loss_distance, next_step
from pipeline.extract_blunder_profile import (
    DATASET_DIR,
    REPOSITORY_ROOT,
    ProgressPrinter,
    add_stockfish_arguments,
    measure_move_losses,
    running_stockfish,
)
from pipeline.stockfish_analysis import Analyser, analyse_positions

# The version of the file's layout. Raise it whenever a reader of the old
# layout would misread the new one.
FORMAT_VERSION = 1

RESULTS_PATH = REPOSITORY_ROOT / "docs" / "experiments" / "results" / "draw-temperature.json"


def extract(
    dataset_dir: Path,
    runs: dict[float, Path],
    cache_path: Path,
    results_path: Path,
    analysers: list[Analyser],
    report_progress: Callable[[int, int], None] | None = None,
) -> dict:
    """Measures Camille's moves and the Bot's at each temperature, keyed by temperature in `runs`."""
    dataset = read_dataset(dataset_dir)
    camille = _measure(dataset.train + dataset.test, analysers, cache_path, report_progress)
    # The same player on two sets of his own games: how far apart they land
    # is how far two sets of games drift by chance, the yardstick for whether
    # the gap between two temperatures means anything.
    training_games = _measure(dataset.train, analysers, cache_path, report_progress)
    test_set = _measure(dataset.test, analysers, cache_path, report_progress)

    temperatures = {}
    distances = {}
    for temperature, games_path in sorted(runs.items()):
        bot_positions = read_bot_games(games_path)
        bot = _measure(bot_positions, analysers, cache_path, report_progress)
        games = {position.game_id for position in bot_positions}
        distance = loss_distance(bot.losses, camille.losses)
        distances[temperature] = distance
        temperatures[f"{temperature:g}"] = {
            "games": len(games),
            "results": read_bot_results(games_path),
            "centipawn_loss": build_blunder_profile(bot.losses),
            "distance": distance,
            "already_decided_share": bot.already_decided_share(),
            "distance_in_undecided_positions": loss_distance(bot.undecided_losses(), camille.undecided_losses()),
        }

    results = {
        "format_version": FORMAT_VERSION,
        "engine": analysers[0].engine,
        "depth": analysers[0].depth,
        "camille": {
            "centipawn_loss": build_blunder_profile(camille.losses),
            "already_decided_share": camille.already_decided_share(),
        },
        "camille_test_set_from_training_games": loss_distance(test_set.losses, training_games.losses),
        "temperatures": temperatures,
        "next_step": asdict(next_step(distances)),
    }
    results_path.write_text(json.dumps(results, indent=1), encoding="utf-8")
    return results


class _MeasuredMoves:
    """A player's moves with the evaluation each lost, and whether its position was already decided."""

    def __init__(self, losses: list[MoveLoss], already_decided: list[bool]):
        self.losses = losses
        self.already_decided = already_decided

    def undecided_losses(self) -> list[MoveLoss]:
        """The moves made while the game was still open, the only ones that could be a mistake."""
        undecided = []
        for loss, decided in zip(self.losses, self.already_decided):
            if not decided:
                undecided.append(loss)
        return undecided

    def already_decided_share(self) -> dict[str, float | None]:
        """Per Phase, the share of moves made in a position already decided."""
        shares = {}
        for phase in PHASES:
            flags = [decided for loss, decided in zip(self.losses, self.already_decided) if loss.phase == phase]
            if not flags:
                shares[phase] = None
                continue
            shares[phase] = sum(flags) / len(flags)
        return shares


def _measure(
    positions: list[Position],
    analysers: list[Analyser],
    cache_path: Path,
    report_progress: Callable[[int, int], None] | None,
) -> _MeasuredMoves:
    losses = measure_move_losses(positions, analysers, cache_path, report_progress)
    # Every move is in the cache by now, so this analyses nothing again.
    analyses = analyse_positions(positions, analysers, cache_path)
    already_decided = []
    for position in positions:
        analysis = analyses[(position.fen, position.move)]
        already_decided.append(position_already_decided(best=analysis.best, played=analysis.played))
    return _MeasuredMoves(losses, already_decided)


# The usual thresholds for an inaccuracy, a mistake and a blunder.
LOSS_THRESHOLDS = [50, 100, 300]


def loss_tables(results: dict) -> str:
    """One Markdown table per Phase: Camille's losses, then the Bot's at each temperature."""
    header_cells = ["Player", "Moves", "Mean"]
    header_cells += [f"p{percentile}" for percentile in PERCENTILES]
    header_cells += [f"{threshold} or more" for threshold in LOSS_THRESHOLDS]

    players = [("Camille", results["camille"]["centipawn_loss"])]
    for temperature, measured in results["temperatures"].items():
        players.append((f"Bot at {temperature}", measured["centipawn_loss"]))

    lines = []
    for phase in PHASES:
        lines.append(PHASE_LABELS[phase])
        lines.append("")
        lines.append(_table_row(header_cells))
        lines.append("|---|" + "---|" * (len(header_cells) - 1))
        for name, profile in players:
            lines.append(_table_row([name] + _loss_cells(profile["phases"][phase])))
        lines.append("")
    return "\n".join(lines)


def _loss_cells(distribution: dict) -> list[str]:
    cells = [f"{distribution['moves']:,}", _decimal(distribution["mean"])]
    for percentile in PERCENTILES:
        value = distribution["percentiles"][str(percentile)]
        if value is None:
            cells.append("-")
        else:
            cells.append(str(value))
    for threshold in LOSS_THRESHOLDS:
        cells.append(_percent(share_losing_at_least(distribution, threshold)))
    return cells


def summary_table(results: dict) -> str:
    """One row per temperature: its games, the Bot's results and how far its losses are from Camille's."""
    header_cells = [
        "Temperature",
        "Games",
        "Won, drawn, lost",
        "Distance",
        "Distance, undecided positions",
        "Endgame moves in decided positions",
    ]
    lines = [_table_row(header_cells), "|---|" + "---|" * (len(header_cells) - 1)]
    for temperature, measured in results["temperatures"].items():
        outcome = measured["results"]
        cells = [
            temperature,
            f"{measured['games']:,}",
            f"{outcome['won']}, {outcome['drawn']}, {outcome['lost']}",
            _decimal(measured["distance"]),
            _decimal(measured["distance_in_undecided_positions"]),
            _percent(measured["already_decided_share"]["endgame"]),
        ]
        lines.append(_table_row(cells))
    return "\n".join(lines)


def _table_row(cells: list[str]) -> str:
    return f"| {' | '.join(cells)} |"


def _decimal(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:.1f}"


def _percent(share: float | None) -> str:
    if share is None:
        return "-"
    return f"{100 * share:.1f}%"


def _parse_run(argument: str) -> tuple[float, Path]:
    """Reads one --run argument, a temperature and the games played at it: 0.75=path/to/games.jsonl."""
    temperature, separator, path = argument.partition("=")
    if separator == "":
        raise argparse.ArgumentTypeError(f"expected <temperature>=<games file>, got {argument}")
    return float(temperature), Path(path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Compare the Bot's evaluation losses at each temperature with Camille's."
    )
    parser.add_argument(
        "--run",
        type=_parse_run,
        action="append",
        required=True,
        help="a temperature and the games npm run bot-games played at it, as 0.75=path/to/games.jsonl",
    )
    add_stockfish_arguments(parser)
    arguments = parser.parse_args()
    runs = dict(arguments.run)

    with running_stockfish(arguments.depth, arguments.workers) as (stockfish_processes, cache_path):
        results = extract(DATASET_DIR, runs, cache_path, RESULTS_PATH, stockfish_processes, ProgressPrinter())

    print(f"Written to {RESULTS_PATH}")
    print()
    print(loss_tables(results))
    print(summary_table(results))
    print()
    noise = results["camille_test_set_from_training_games"]
    print(f"Camille's Test Set from his training games: {noise:.1f}")
    step = results["next_step"]
    if step["chosen"] is None:
        print(f"The rule asks for temperature {step['measure']:g} to be measured next.")
    else:
        print(f"The rule chooses temperature {step['chosen']:g}.")
