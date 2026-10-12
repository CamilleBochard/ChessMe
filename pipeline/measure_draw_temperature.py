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

from pipeline import bot_losses
from pipeline.draw_temperature import next_step
from pipeline.extract_blunder_profile import (
    DATASET_DIR,
    REPOSITORY_ROOT,
    ProgressPrinter,
    add_stockfish_arguments,
    running_stockfish,
)
from pipeline.stockfish_analysis import Analyser

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
    labelled_runs = {}
    for temperature, games_path in sorted(runs.items()):
        labelled_runs[f"{temperature:g}"] = games_path
    measured = bot_losses.measure_against_camille(dataset_dir, labelled_runs, cache_path, analysers, report_progress)

    distances = {}
    for temperature in runs:
        distances[temperature] = measured["runs"][f"{temperature:g}"]["distance"]

    results = {
        "format_version": FORMAT_VERSION,
        "engine": measured["engine"],
        "depth": measured["depth"],
        "camille": measured["camille"],
        "camille_test_set_from_training_games": measured["camille_test_set_from_training_games"],
        "temperatures": measured["runs"],
        "next_step": asdict(next_step(distances)),
    }
    results_path.write_text(json.dumps(results, indent=1), encoding="utf-8")
    return results


def loss_tables(results: dict, in_undecided_positions: bool = False) -> str:
    """One Markdown table per Phase: Camille's losses, then the Bot's at each temperature."""
    runs = {}
    for temperature, measured in results["temperatures"].items():
        runs[f"Bot at {temperature}"] = measured
    return bot_losses.loss_tables(results["camille"], runs, in_undecided_positions)


def summary_table(results: dict) -> str:
    """One row per temperature: its games, the Bot's results and how far its losses are from Camille's."""
    return bot_losses.summary_table(results["temperatures"], "Temperature")


def phase_distance_table(results: dict) -> str:
    """Each Phase's own distance at each temperature, with all moves, then without those in decided positions."""
    return bot_losses.phase_distance_table(results["temperatures"])


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
    print(phase_distance_table(results))
    print()
    print("The same moves without those made in positions already decided:")
    print()
    print(loss_tables(results, in_undecided_positions=True))
    noise = results["camille_test_set_from_training_games"]
    print(f"Camille's Test Set from his training games: {noise:.1f}")
    step = results["next_step"]
    if step["chosen"] is None:
        print(f"The rule asks for temperature {step['measure']:g} to be measured next.")
    else:
        print(f"The rule chooses temperature {step['chosen']:g}.")
