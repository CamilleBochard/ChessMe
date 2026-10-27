"""Looks for the Level Break in Camille's training games, by the rule of pipeline/level_break.py.

Run from the repository root, once Stockfish is installed with
scripts/fetch_stockfish.sh:

    python -m pipeline.measure_level_break
    python -m pipeline.measure_level_break --first-day 2025-01-01 \\
        --out docs/experiments/results/level-break-since-2025-01.json

The first reads the games the dataset keeps, every ten-minute game since 1
June 2025; the second every ten-minute game since January 2025, to see
whether the rule finds a break near the first day the dataset keeps, which
was set by eye. Both read the exports in data/raw.

Each game's Level comes from Stockfish 19 at depth 18, the analysis the
Blunder Profile uses: moves already in its cache in data/analysis are read
from it, the others analysed and added. The record holds each game's Level
and Camille's rating on its site, every run of the rule and the Level Break
it found; Markdown tables go to standard output.
"""

import argparse
import json
from collections import defaultdict
from datetime import date
from pathlib import Path
from statistics import mean, median
from typing import Callable

from pipeline.build_dataset import PLAYER, RAW_DIR, TEST_FRACTION
from pipeline.dataset import FIRST_DAY_KEPT, build_dataset, kept_games, player_rating
from pipeline.extract_blunder_profile import (
    REPOSITORY_ROOT,
    ProgressPrinter,
    add_stockfish_arguments,
    measure_move_losses,
    running_stockfish,
)
from pipeline.level_break import (
    LAST_OPENING_PLY,
    MIN_GAMES_PER_SIDE,
    MISTAKE_CENTIPAWNS,
    PERCENTILE,
    SEED,
    SHUFFLES,
    BreakSearch,
    find_level_break,
    game_levels,
)
from pipeline.stockfish_analysis import Analyser

FORMAT_VERSION = 1

RESULTS_PATH = REPOSITORY_ROOT / "docs" / "experiments" / "results" / "level-break.json"

SOURCE_LABELS = {"chesscom": "Chess.com", "lichess": "Lichess"}


def measure(
    raw_dir: Path,
    first_day: date,
    analysers: list[Analyser],
    cache_path: Path,
    report_progress: Callable[[int, int], None] | None = None,
) -> dict:
    pgn_paths = sorted(raw_dir.glob("*.pgn"))
    # The Test Set is held back from every use but measuring the Bot, so
    # the rule reads the training games only.
    training = build_dataset(pgn_paths, player=PLAYER, test_fraction=TEST_FRACTION, first_day=first_day).train

    played_at = {}
    sources = {}
    for position in training:
        played_at[position.game_id] = position.played_at
        sources[position.game_id] = position.source
    ratings = {}
    for game, game_id in kept_games(pgn_paths, first_day):
        ratings[game_id] = player_rating(game, PLAYER)

    move_losses = measure_move_losses(training, analysers, cache_path, report_progress)
    levels = game_levels(move_losses, played_at)
    finding = find_level_break(levels)

    games = []
    for game in levels:
        games.append(
            {
                "game_id": game.game_id,
                "source": sources[game.game_id],
                "played_at": game.played_at,
                "level": game.level,
                "rating": ratings[game.game_id],
            }
        )
    searches = [_search_record(search, levels) for search in finding.searches]
    return {
        "format_version": FORMAT_VERSION,
        "first_day": first_day.isoformat(),
        "engine": analysers[0].engine,
        "depth": analysers[0].depth,
        "rule": {
            "mistake_centipawns": MISTAKE_CENTIPAWNS,
            "first_ply_read": LAST_OPENING_PLY + 1,
            "min_games_per_side": MIN_GAMES_PER_SIDE,
            "shuffles": SHUFFLES,
            "percentile": PERCENTILE,
            "seed": SEED,
        },
        "training_games": len(levels),
        "searches": searches,
        "level_break": finding.level_break,
        "level_break_at": finding.level_break_at,
        "games": games,
    }


def _search_record(search: BreakSearch, levels: list) -> dict:
    first_game_at = None
    if search.games > 0:
        first_game_at = levels[search.first_game].played_at
    split_at = None
    if search.split is not None:
        split_at = levels[search.split].played_at
    return {
        "first_game": search.first_game,
        "first_game_at": first_game_at,
        "games": search.games,
        "split": search.split,
        "split_at": split_at,
        "level_before": search.level_before,
        "level_after": search.level_after,
        "difference": search.difference,
        "threshold": search.threshold,
        "is_break": search.is_break,
    }


def tables(results: dict) -> str:
    lines = [
        f"Training games since {results['first_day']} with a move after ply 10: {results['training_games']:,}",
        "",
        "| Month | Games | Mean Level | Chess.com rating (median) | Lichess rating (median) |",
        "|---|---|---|---|---|",
    ]
    for month, games in _by_month(results["games"]).items():
        level = _percent(mean(game["level"] for game in games))
        ratings = []
        for source in SOURCE_LABELS:
            rated = [game["rating"] for game in games if game["source"] == source and game["rating"] is not None]
            if rated:
                ratings.append(f"{median(rated):.0f} ({len(rated)})")
            else:
                ratings.append("")
        lines.append(f"| {month} | {len(games)} | {level} | {ratings[0]} | {ratings[1]} |")

    lines += [
        "",
        "| Run | Games looked at | Candidate break | Level before | Level after | Difference | Threshold (99th percentile) | Break |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for number, search in enumerate(results["searches"], start=1):
        looked_at = f"{search['games']}"
        if search["first_game_at"] is not None:
            looked_at = f"{search['games']} from {search['first_game_at'][:10]}"
        if search["split"] is None:
            lines.append(f"| {number} | {looked_at} | too few games for {MIN_GAMES_PER_SIDE} on each side | | | | | no |")
            continue
        verdict = "yes" if search["is_break"] else "no"
        lines.append(
            f"| {number} | {looked_at} | before {search['split_at'][:10]} | {_percent(search['level_before'])} | "
            f"{_percent(search['level_after'])} | {_points(search['difference'])} | {_points(search['threshold'])} | {verdict} |"
        )

    lines.append("")
    if results["level_break_at"] is None:
        lines.append("Level Break: none found; Level is measured on every game.")
    else:
        lines.append(f"Level Break: the games begun at {results['level_break_at']} or later.")
    return "\n".join(lines)


def _by_month(games: list[dict]) -> dict[str, list[dict]]:
    months: dict[str, list[dict]] = defaultdict(list)
    for game in games:
        months[game["played_at"][:7]].append(game)
    return dict(months)


def _percent(share: float) -> str:
    return f"{100 * share:.1f}%"


def _points(share: float) -> str:
    return f"{100 * share:.2f} points"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Look for the Level Break in Camille's training games.")
    add_stockfish_arguments(parser)
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR, help="the folder of PGN exports to read")
    parser.add_argument(
        "--first-day",
        type=date.fromisoformat,
        default=FIRST_DAY_KEPT,
        help=f"the first day of games read (default {FIRST_DAY_KEPT.isoformat()}, the dataset's)",
    )
    parser.add_argument("--out", type=Path, default=RESULTS_PATH, help="where to write the record")
    arguments = parser.parse_args()

    with running_stockfish(arguments.depth, arguments.workers) as (stockfish_processes, cache_path):
        results = measure(arguments.raw_dir, arguments.first_day, stockfish_processes, cache_path, ProgressPrinter())

    arguments.out.parent.mkdir(parents=True, exist_ok=True)
    arguments.out.write_text(json.dumps(results, indent=1), encoding="utf-8")
    print(f"Written to {arguments.out}")
    print()
    print(tables(results))
