"""Brings everything built from Camille's games up to date with the games he has played since the last run.

Run from the repository root, with Stockfish installed (scripts/fetch_stockfish.sh),
the Node packages installed, the served model in models/onnx and the Lichess
token in the environment:

    export LICHESS_TOKEN="$(cat ~/.config/chessme/lichess-token)"
    python -m pipeline.refresh_games

In order:

1. New games are fetched from Chess.com and Lichess into new dated files in
   data/raw (pipeline/fetch_games.py); the files already there are never
   rewritten.
2. The dataset is rebuilt from every export. When it holds moves an engine's
   cache does not, that engine first analyses a sample of its cached moves
   again and the run stops on any difference, so one cache never mixes two
   machines' measures.
3. The Level Break is looked for again (pipeline/level_break.py), then the
   Opening Book is rebuilt from every training game, and the Blunder
   Profile, at the pipeline's depth and at the browser's, from the games
   since the Level Break. Stockfish analyses only moves its cache does not
   hold.
4. The served model's records on the Test Set are extended with new
   positions only, and the site's improbability and loss yardsticks written
   again from the games since the Level Break.
5. A summary of what changed is printed and written to docs/refreshes/, for
   the report of each run.

A second run with no new game writes no game file, analyses nothing and
rebuilds every file exactly as it was.
"""

import argparse
import json
import os
import re
import subprocess
from contextlib import ExitStack
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Callable

from pipeline import build_dataset as dataset_build
from pipeline import build_opening_book
from pipeline.dataset import FIRST_DAY_KEPT, Dataset, build_dataset, read_dataset
from pipeline.extract_blunder_profile import REPOSITORY_ROOT, ProgressPrinter, extract, running_stockfish
from pipeline.fetch_games import fetch_new_games, http_get
from pipeline.measure_level_break import measure as measure_level_break
from pipeline.refresh_summary import book_changes, new_games_summary, profile_movement
from pipeline.stockfish_analysis import Analyser, differences_from_the_cache, moves_not_cached

FORMAT_VERSION = 1

# The depth the browser's analysis mode searches to (src/analysis/browser-engine.ts).
BROWSER_DEPTH = 14
BROWSER_ENGINE = REPOSITORY_ROOT / "scripts" / "stockfish-lite.sh"
# The pipeline's depth for the Blunder Profile (pipeline/extract_blunder_profile.py).
DEEP_DEPTH = 18


@dataclass(frozen=True)
class RefreshPaths:
    """Every file a refresh reads or writes, so a test can point them all at a folder of its own."""

    raw_dir: Path
    dataset_dir: Path
    analysis_dir: Path
    summaries_dir: Path
    site_dir: Path

    @classmethod
    def under(cls, root: Path) -> "RefreshPaths":
        """The repository's layout, under root."""
        return cls(
            raw_dir=root / "data" / "raw",
            dataset_dir=root / "data" / "dataset",
            analysis_dir=root / "data" / "analysis",
            summaries_dir=root / "docs" / "refreshes",
            site_dir=root / "src" / "explanation",
        )

    @property
    def opening_book(self) -> Path:
        return self.dataset_dir / "opening-book.json"

    @property
    def blunder_profile(self) -> Path:
        return self.dataset_dir / "blunder-profile.json"

    @property
    def losses(self) -> Path:
        return self.dataset_dir / "centipawn-losses.jsonl"

    @property
    def browser_profile(self) -> Path:
        return self.dataset_dir / "blunder-profile-browser.json"

    @property
    def browser_losses(self) -> Path:
        return self.dataset_dir / "centipawn-losses-browser.jsonl"

    @property
    def model_records(self) -> Path:
        return self.dataset_dir / "move-probabilities" / "fine-tuned-test.jsonl"

    @property
    def improbability_yardstick(self) -> Path:
        return self.site_dir / "improbability-yardstick.json"

    @property
    def loss_yardstick(self) -> Path:
        return self.site_dir / "loss-yardstick.json"


@dataclass
class Engine:
    """One Stockfish build at one depth, its processes and its cache."""

    analysers: list[Analyser]
    cache_path: Path


@dataclass
class RefreshTools:
    """What a refresh reaches outside Python with, which a test replaces."""

    get: Callable[[str, dict[str, str]], str]
    environ: dict[str, str]
    deep: Engine
    browser: Engine
    # place_moves(positions_path, records_path) extends the served model's
    # records with the positions they lack and returns how many it added.
    place_moves: Callable[[Path, Path], int]
    # write_yardsticks(since) writes the site's two yardsticks from the games
    # begun at since or later, every game when since is None.
    write_yardsticks: Callable[[str | None], None]
    report_progress: Callable[[int, int], None] | None = field(default=None)


def refresh(
    paths: RefreshPaths, day: date, tools: RefreshTools, fetch: bool = True, fetched: list[Path] | None = None
) -> dict:
    """Runs one refresh and returns its summary, which is also written to paths.summaries_dir.

    With fetch False, everything is rebuilt from the exports data/raw holds,
    without asking the sites: the games can be fetched on the machine, or in
    the step, that holds the Lichess token, and the rest run elsewhere.
    fetched then names the files that fetch wrote, for the summary.
    """
    new_files = list(fetched or [])
    if fetch:
        new_files = fetch_new_games(paths.raw_dir, day, tools.get, tools.environ)

    pgn_paths = sorted(paths.raw_dir.glob("*.pgn"))
    rebuilt = build_dataset(pgn_paths, player=dataset_build.PLAYER, test_fraction=dataset_build.TEST_FRACTION)
    every_position = rebuilt.train + rebuilt.test
    # Before anything is analysed and before any file is rebuilt: a machine
    # that scores differently stops the run with nothing changed but the
    # new game files.
    identity_checks = {}
    for engine in (tools.deep, tools.browser):
        if moves_not_cached(every_position, engine.analysers, engine.cache_path):
            compared = _stop_on_a_difference(engine)
            identity_checks[_engine_name(engine)] = {"compared": compared, "differences": 0}

    before = _what_was_built(paths)
    deep_lines_before = _line_count(tools.deep.cache_path)
    browser_lines_before = _line_count(tools.browser.cache_path)

    paths.dataset_dir.mkdir(parents=True, exist_ok=True)
    paths.analysis_dir.mkdir(parents=True, exist_ok=True)
    dataset_build.build(paths.raw_dir, paths.dataset_dir, dataset_build.TEST_FRACTION)

    level_break = measure_level_break(
        paths.raw_dir, FIRST_DAY_KEPT, tools.deep.analysers, tools.deep.cache_path, tools.report_progress
    )
    since = level_break["level_break_at"]

    build_opening_book.build(paths.dataset_dir, paths.opening_book, build_opening_book.DEFAULT_MIN_OCCURRENCES)
    extract(
        paths.dataset_dir,
        tools.deep.cache_path,
        paths.blunder_profile,
        paths.losses,
        tools.deep.analysers,
        tools.report_progress,
        since=since,
    )
    extract(
        paths.dataset_dir,
        tools.browser.cache_path,
        paths.browser_profile,
        paths.browser_losses,
        tools.browser.analysers,
        tools.report_progress,
        since=since,
    )

    paths.model_records.parent.mkdir(parents=True, exist_ok=True)
    records_added = tools.place_moves(paths.dataset_dir / "test.jsonl", paths.model_records)
    paths.site_dir.mkdir(parents=True, exist_ok=True)
    tools.write_yardsticks(since)

    after = _what_was_built(paths)
    previous_break = _previous_level_break(paths.summaries_dir)
    summary = {
        "format_version": FORMAT_VERSION,
        "day": day.isoformat(),
        "new_game_files": [path.name for path in new_files],
        "new_games": new_games_summary(before["positions"], after["positions"]),
        "identity_checks": identity_checks,
        "analyses_added": {
            _engine_name(tools.deep): _line_count(tools.deep.cache_path) - deep_lines_before,
            _engine_name(tools.browser): _line_count(tools.browser.cache_path) - browser_lines_before,
        },
        "model_records_added": records_added,
        "level_break": {
            "at": since,
            "previous": previous_break,
            "is_new": since != previous_break,
            "training_games": level_break["training_games"],
            "searches": level_break["searches"],
        },
        "opening_book": book_changes(before["book"], after["book"]),
        "profiles": profile_movement(before["profiles"], after["profiles"]),
    }
    paths.summaries_dir.mkdir(parents=True, exist_ok=True)
    (paths.summaries_dir / f"{day.isoformat()}.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    return summary


def _engine_name(engine: Engine) -> str:
    return f"{engine.analysers[0].engine} at depth {engine.analysers[0].depth}"


def _stop_on_a_difference(engine: Engine) -> int:
    """Checks the engine against its cache, stops the run on a difference, and says how many moves it compared."""
    check = differences_from_the_cache(engine.analysers, engine.cache_path)
    if check.differences:
        listed = "\n".join(check.differences[:10])
        raise SystemExit(
            f"{_engine_name(engine)} on this machine does not score {len(check.differences)} cached moves "
            f"as the cache holds them, so nothing was analysed:\n{listed}"
        )
    print(f"{_engine_name(engine)}: {check.compared} cached moves analysed again, all as the cache holds them", flush=True)
    return check.compared


def _what_was_built(paths: RefreshPaths) -> dict:
    """The dataset's positions, the Opening Book and the profiles as they stand, empty where not built yet."""
    positions = []
    if (paths.dataset_dir / "train.jsonl").exists():
        dataset: Dataset = read_dataset(paths.dataset_dir)
        positions = dataset.train + dataset.test
    book = {}
    if paths.opening_book.exists():
        book = json.loads(paths.opening_book.read_text(encoding="utf-8"))["positions"]
    profiles = {
        "blunder_profile": _read_json(paths.blunder_profile),
        "improbability": _read_json(paths.improbability_yardstick),
        "loss": _read_json(paths.loss_yardstick),
    }
    return {"positions": positions, "book": book, "profiles": profiles}


def _read_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _line_count(path: Path) -> int:
    if not path.exists():
        return 0
    with open(path, encoding="utf-8") as lines:
        return sum(1 for _ in lines)


def _previous_level_break(summaries_dir: Path) -> str | None:
    """The Level Break the last refresh found; None before the first refresh, as no break had been found then."""
    summaries = sorted(summaries_dir.glob("*.json")) if summaries_dir.exists() else []
    if not summaries:
        return None
    return json.loads(summaries[-1].read_text(encoding="utf-8"))["level_break"]["at"]


SERVED_MODEL_FILE = REPOSITORY_ROOT / "src" / "engine" / "served-model.ts"


def served_model() -> tuple[str, int]:
    """The model the site serves and the rating it plays at, read from src/engine/served-model.ts.

    Read from the file the site is built from rather than copied here, so the
    refresh measures the model the site serves; the yardsticks script checks
    it again.
    """
    text = SERVED_MODEL_FILE.read_text(encoding="utf-8")
    source = re.search(r"SERVED_MODEL_SOURCE = '([^']+)'", text).group(1)
    rating = int(re.search(r"SERVED_MODEL_RATING = (\d+)", text).group(1))
    return source, rating


def place_moves_with_the_served_model(positions_path: Path, records_path: Path) -> int:
    """Runs the served model on the positions its records lack, under Node, and says how many it added."""
    model, rating = served_model()
    lines_before = _line_count(records_path)
    command = ["npm", "run", "--silent", "move-probabilities", "--", model, "--rating", str(rating)]
    command += [_from_root(positions_path), "--out", _from_root(records_path), "--extend"]
    subprocess.run(command, cwd=REPOSITORY_ROOT, check=True)
    return _line_count(records_path) - lines_before


def write_the_site_yardsticks(paths: RefreshPaths, since: str | None) -> None:
    """Writes the site's improbability and loss yardsticks, from the games begun at since or later if given."""
    for command in site_yardstick_commands(paths, since):
        subprocess.run(command, cwd=REPOSITORY_ROOT, check=True)


def site_yardstick_commands(paths: RefreshPaths, since: str | None) -> list[list[str]]:
    """The two npm commands that write the site's yardsticks, run from the repository root.

    Each yardstick records the file it was read from, and the site ships it:
    the paths are given from the repository root, so no machine's own
    folders end up in a published file.
    """
    model, _ = served_model()
    since_flags = []
    if since is not None:
        since_flags = ["--since", since]
    improbability = ["npm", "run", "--silent", "yardsticks", "--", "--model", model]
    improbability += ["--probabilities", _from_root(paths.model_records), "--out", _from_root(paths.improbability_yardstick)]
    losses = ["npm", "run", "--silent", "yardsticks", "--", "--losses", _from_root(paths.browser_losses)]
    losses += ["--loss-profile", _from_root(paths.browser_profile), "--out", _from_root(paths.loss_yardstick)]
    return [improbability + since_flags, losses + since_flags]


def _from_root(path: Path) -> str:
    return str(path.resolve().relative_to(REPOSITORY_ROOT))


def summary_tables(summary: dict) -> str:
    lines = [f"Refresh of {summary['day']}", ""]
    new = summary["new_games"]
    files = ", ".join(summary["new_game_files"]) or "none"
    lines.append(f"New games: {new['games']} (files written: {files}); moves per Phase: {new['moves']}")
    lines.append(f"Identity checks: {summary['identity_checks'] or 'none needed, nothing new to analyse'}")
    lines.append(f"Analyses added: {summary['analyses_added']}; model records added: {summary['model_records_added']}")
    level_break = summary["level_break"]
    verdict = "none found" if level_break["at"] is None else f"games begun at {level_break['at']} or later"
    lines.append(f"Level Break: {verdict} (new: {'yes' if level_break['is_new'] else 'no'})")
    book = summary["opening_book"]
    lines.append(
        f"Opening Book: {book['positions_before']} -> {book['positions_after']} positions, "
        f"{book['added']} added, {book['dropped']} dropped, {book['changed']} answered otherwise"
    )
    lines += ["", "| Profile | Figure | Before | After |", "|---|---|---|---|"]
    for profile, figures in summary["profiles"].items():
        for figure, values in figures.items():
            lines.append(f"| {profile} | {figure} | {_figure(values['before'])} | {_figure(values['after'])} |")
    return "\n".join(lines)


def _figure(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.4g}"
    return str(value)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Refresh Camille's games and everything built from them.")
    parser.add_argument("--workers", type=int, default=os.cpu_count() // 2 or 1, help="Stockfish processes per engine")
    parser.add_argument(
        "--no-fetch",
        action="store_true",
        help="rebuild from the exports data/raw holds, without asking the sites for new games",
    )
    parser.add_argument(
        "--fetched",
        nargs="*",
        type=Path,
        default=[],
        help="with --no-fetch, the game files a separate fetch wrote, named in the summary",
    )
    arguments = parser.parse_args()
    paths = RefreshPaths.under(REPOSITORY_ROOT)

    with ExitStack() as stack:
        deep_analysers, deep_cache = stack.enter_context(running_stockfish(DEEP_DEPTH, arguments.workers))
        browser_analysers, browser_cache = stack.enter_context(
            running_stockfish(BROWSER_DEPTH, arguments.workers, BROWSER_ENGINE)
        )
        tools = RefreshTools(
            get=http_get,
            environ=dict(os.environ),
            deep=Engine(deep_analysers, deep_cache),
            browser=Engine(browser_analysers, browser_cache),
            place_moves=place_moves_with_the_served_model,
            write_yardsticks=lambda since: write_the_site_yardsticks(paths, since),
            report_progress=ProgressPrinter(),
        )
        written = refresh(paths, date.today(), tools, fetch=not arguments.no_fetch, fetched=arguments.fetched)

    print(summary_tables(written))
    print(f"Written to {paths.summaries_dir / (written['day'] + '.json')}")
