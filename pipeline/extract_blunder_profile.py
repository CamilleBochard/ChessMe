"""Extracts the Blunder Profile: Stockfish measures every move in the dataset.

Run from the repository root, once Stockfish is installed with
scripts/fetch_stockfish.sh:

    python -m pipeline.extract_blunder_profile

A full run takes hours. It can be stopped with Ctrl+C at any point and run
again to carry on: analyses are kept in data/analysis, one cache file per
engine and depth, which is also why a finished run repeats nothing.

Every move of both the training games and the Test Set is measured. The
profile is a yardstick the Bot is compared against, never fed to it, so the
Test Set has nothing to leak into. Written to data/dataset:
    blunder-profile.json      the distribution of losses, per Phase
    centipawn-losses.jsonl    each move's loss with its game, ply and Phase
"""

import argparse
import json
import os
import re
import time
from dataclasses import asdict
from pathlib import Path
from typing import Callable

from pipeline.blunder_profile import EVALUATION_CAP, MoveLoss, build_blunder_profile, centipawn_loss
from pipeline.dataset import read_dataset
from pipeline.stockfish_analysis import Analyser, StockfishAnalyser, analyse_positions

# The version of the profile's layout. Raise it whenever a reader of the old
# layout would misread the new one.
FORMAT_VERSION = 1

# Deep enough for Stockfish to see the tactics a club player misses, which
# is what the profile measures; about a second per search on a 2012 laptop.
DEFAULT_DEPTH = 18

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
STOCKFISH_PATH = REPOSITORY_ROOT / "tools" / "stockfish" / "stockfish"
DATASET_DIR = REPOSITORY_ROOT / "data" / "dataset"
ANALYSIS_DIR = REPOSITORY_ROOT / "data" / "analysis"
PROFILE_PATH = DATASET_DIR / "blunder-profile.json"
LOSSES_PATH = DATASET_DIR / "centipawn-losses.jsonl"


def extract(
    dataset_dir: Path,
    cache_path: Path,
    profile_path: Path,
    losses_path: Path,
    analysers: list[Analyser],
    report_progress: Callable[[int, int], None] | None = None,
) -> dict:
    dataset = read_dataset(dataset_dir)
    positions = dataset.train + dataset.test
    analyses = analyse_positions(positions, analysers, cache_path, report_progress)

    move_losses = []
    for position in positions:
        analysis = analyses[(position.fen, position.move)]
        loss = centipawn_loss(best=analysis.best, played=analysis.played)
        move_loss = MoveLoss(game_id=position.game_id, ply=position.ply, phase=position.phase, centipawn_loss=loss)
        move_losses.append(move_loss)

    with open(losses_path, "w", encoding="utf-8") as losses_file:
        for move_loss in move_losses:
            line = json.dumps(asdict(move_loss))
            losses_file.write(line + "\n")

    distribution = build_blunder_profile(move_losses)
    profile = {
        "format_version": FORMAT_VERSION,
        "engine": analysers[0].engine,
        "depth": analysers[0].depth,
        "evaluation_cap": EVALUATION_CAP,
        "phases": distribution["phases"],
        "all_phases": distribution["all_phases"],
    }
    profile_path.write_text(json.dumps(profile, indent=1), encoding="utf-8")
    return profile


def _cache_path(engine: str, depth: int) -> Path:
    """One cache file per engine and depth, e.g. data/analysis/stockfish-19-depth-18.jsonl."""
    # "Stockfish 19" becomes "stockfish-19".
    lowercase_engine = engine.lower()
    dashed_engine = re.sub(r"[^a-z0-9]+", "-", lowercase_engine)
    engine_slug = dashed_engine.strip("-")
    return ANALYSIS_DIR / f"{engine_slug}-depth-{depth}.jsonl"


# How many new analyses between two progress lines: about a minute apart at
# depth 18 with four processes.
MOVES_BETWEEN_PROGRESS_LINES = 200


class _ProgressPrinter:
    """Prints how far the run is every MOVES_BETWEEN_PROGRESS_LINES moves, with a rough time left."""

    def __init__(self):
        self.started = time.monotonic()

    def __call__(self, analysed: int, to_analyse: int) -> None:
        is_last_move = analysed == to_analyse
        if analysed % MOVES_BETWEEN_PROGRESS_LINES != 0 and not is_last_move:
            return
        elapsed = time.monotonic() - self.started
        seconds_left = elapsed / analysed * (to_analyse - analysed)
        print(f"{analysed}/{to_analyse} moves analysed, about {seconds_left / 3600:.1f} h left", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Measure every move in the dataset with Stockfish.")
    parser.add_argument(
        "--depth",
        type=int,
        default=DEFAULT_DEPTH,
        help=f"Stockfish search depth, recorded in the profile (default {DEFAULT_DEPTH})",
    )
    # Each Stockfish process uses one core; hyper-threads add little, so the
    # default is about one process per physical core.
    logical_cores = os.cpu_count()
    if logical_cores is None:
        logical_cores = 2
    default_workers = logical_cores // 2
    if default_workers < 1:
        default_workers = 1
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
        cache_path = _cache_path(stockfish_processes[0].engine, arguments.depth)
        ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
        print(
            f"Analysing with {stockfish_processes[0].engine} at depth {arguments.depth}, caching in {cache_path}",
            flush=True,
        )
        written = extract(DATASET_DIR, cache_path, PROFILE_PATH, LOSSES_PATH, stockfish_processes, _ProgressPrinter())
    finally:
        for stockfish in stockfish_processes:
            stockfish.close()

    all_phases = written["all_phases"]
    print(f"{all_phases['moves']} moves measured, mean loss {all_phases['mean']:.1f} cp, written to {PROFILE_PATH}")
