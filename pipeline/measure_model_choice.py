"""Measures the evaluation losses of the Bot with each Base Model, beside Camille's Blunder Profile.

Run from the repository root, once the dataset is built, Stockfish installed
and each Bot's games played with `npm run bot-games`:

    python -m pipeline.measure_model_choice \\
        --run original=data/dataset/bot-games-original.jsonl \\
        --run fine-tuned=data/dataset/bot-games-fine-tuned.jsonl

Fine-tuning on Camille's moves may change how often and how badly the Bot
errs as well as which moves it prefers, so both Bots are held to the same
yardstick as the draw's temperature was: the same Stockfish analysis, depth
and cache as the Blunder Profile, and the same distance. Written to
docs/experiments/results/model-choice-losses.json; the tables go to
standard output as Markdown.
"""

import argparse
import json
from pathlib import Path
from typing import Callable

from pipeline import bot_losses
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
FORMAT_VERSION = 2

RESULTS_PATH = REPOSITORY_ROOT / "docs" / "experiments" / "results" / "model-choice-losses.json"


def extract(
    dataset_dir: Path,
    runs: dict[str, Path],
    cache_path: Path,
    results_path: Path,
    analysers: list[Analyser],
    report_progress: Callable[[int, int], None] | None = None,
    yardstick: str = bot_losses.OPEN_POSITIONS,
) -> dict:
    """Measures Camille's moves and each Bot's, keyed by the name given in `runs`."""
    measured = bot_losses.measure_against_camille(dataset_dir, runs, cache_path, analysers, report_progress, yardstick)
    results = {
        "format_version": FORMAT_VERSION,
        "engine": measured["engine"],
        "depth": measured["depth"],
        "yardstick": measured["yardstick"],
        "camille": measured["camille"],
        "camille_test_set_from_training_games": measured["camille_test_set_from_training_games"],
        "bots": measured["runs"],
    }
    results_path.write_text(json.dumps(results, indent=1), encoding="utf-8")
    return results


def summary_table(results: dict) -> str:
    """One row per Bot: its games, its results and how far its losses are from Camille's."""
    return bot_losses.summary_table(results["bots"], "Bot")


def _parse_run(argument: str) -> tuple[str, Path]:
    """Reads one --run argument, a Bot's name and the games it played: fine-tuned=path/to/games.jsonl."""
    name, separator, path = argument.partition("=")
    if separator == "":
        raise argparse.ArgumentTypeError(f"expected <name>=<games file>, got {argument}")
    return name, Path(path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compare each Bot's evaluation losses with Camille's.")
    parser.add_argument(
        "--run",
        type=_parse_run,
        action="append",
        required=True,
        help="a Bot's name and the games npm run bot-games played with it, as fine-tuned=path/to/games.jsonl",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=RESULTS_PATH,
        help=f"where to write the results (default {RESULTS_PATH})",
    )
    parser.add_argument(
        "--yardstick",
        choices=bot_losses.YARDSTICKS,
        default=bot_losses.OPEN_POSITIONS,
        help="the moves the distance that decides is read on; 'every move' reproduces the choices made before "
        f"open positions were the yardstick (default {bot_losses.OPEN_POSITIONS})",
    )
    add_stockfish_arguments(parser)
    arguments = parser.parse_args()
    runs = dict(arguments.run)

    with running_stockfish(arguments.depth, arguments.workers) as (stockfish_processes, cache_path):
        results = extract(
            DATASET_DIR, runs, cache_path, arguments.out, stockfish_processes, ProgressPrinter(), arguments.yardstick
        )

    print(f"Written to {arguments.out}")
    print()
    print(bot_losses.loss_tables(results["camille"], results["bots"]))
    print(summary_table(results))
    print()
    print(bot_losses.phase_distance_table(results["bots"]))
    print()
    print("The same moves without those made in positions already decided:")
    print()
    print(bot_losses.loss_tables(results["camille"], results["bots"], in_open_positions=True))
    noise = results["camille_test_set_from_training_games"]
    print(f"Camille's Test Set from his training games, on {results['yardstick']}: {noise:.1f}")
