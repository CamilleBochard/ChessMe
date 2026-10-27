"""Move-Matching of the served model on the games a refresh brings, measured before anything is trained on them.

The Test Set is the same 230 games every time. The games each refresh brings
are new to the served model, so measured before it trains on them they are
a fresh out-of-sample test. The untrained Maia-3 5M answers the same
positions: some months' positions are easier to guess than others, and the
untrained model is the yardstick that separates that from what Camille's
games taught the served one. The figure followed from month to month is the
gain, served minus untrained.

Each game's moves and matches are kept per Phase, so that months too short to
be reported alone can be pooled and their errors computed again over the
union of their games.

The refresh (pipeline/refresh_games.py) measures the games it has just
fetched. To measure games already in data/raw as a refresh that had just
fetched them would, name their files, from the repository root:

    python -m pipeline.new_games_matching data/raw/lichess-2026-10-13.pgn data/raw/lichess-2026-10-27.pgn

The games of the named files that no other file holds are measured.
"""

import argparse
import hashlib
import json
import math
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Callable

from pipeline.build_dataset import PLAYER, TEST_FRACTION
from pipeline.dataset import PHASE_LABELS, PHASES, Position, build_dataset
from pipeline.dated_files import dated_files_in_order, new_dated_file
from pipeline.move_matching import GameTally, clustered_standard_error

FORMAT_VERSION = 1

# How many of Camille's moves a figure needs before it is reported, fixed
# before the first measurement. Camille's months range from 143 to 5,798
# moves. On the Test Set, where neither model trained, samples of whole games
# adding up to 1,500 moves measure the gain to about ±0.8 points (median
# standard error of 200 random samples: 0.83), against ±1.0 at 1,000 moves;
# the served model's gain there is 4.1 points.
MINIMUM_MOVES = 1500

# The yardstick: Maia-3 5M as published, converted by pipeline/convert_maia3.py.
UNTRAINED_MODEL = "models/onnx/maia3-5m.onnx"


@dataclass(frozen=True)
class MeasuredModels:
    """The two models compared and the rating both play at, the served one."""

    served: Path
    untrained: Path
    rating: int


# first_choice_matches(model, positions) says, position by position, whether
# the model's most likely move is the move Camille played.
FirstChoiceMatches = Callable[[Path, list[Position]], list[bool]]


def positions_of_new_games(pgn_paths: list[Path], new_files: list[Path]) -> list[Position]:
    """Camille's positions in the games new_files bring: kept in the dataset, and in none of the other files.

    The games are filtered as the dataset filters them. A game a new file
    shares with an older one is not new.
    """
    new_names = {path.name for path in new_files}
    other_paths = [path for path in pgn_paths if path.name not in new_names]
    every_game = build_dataset(pgn_paths, player=PLAYER, test_fraction=TEST_FRACTION)
    earlier = build_dataset(other_paths, player=PLAYER, test_fraction=TEST_FRACTION)
    known_games = {position.game_id for position in earlier.train + earlier.test}
    every_position = every_game.train + every_game.test
    return [position for position in every_position if position.game_id not in known_games]


def measure_new_games(
    positions: list[Position],
    day: date,
    game_files: list[Path],
    models: MeasuredModels,
    first_choice_matches: FirstChoiceMatches,
    monthly_dir: Path,
) -> dict:
    """Measures both models on the new games' positions, records it, and returns what the refresh's summary says of it.

    The measurement is written to monthly_dir as <day>.json, beside the
    earlier ones, and the cumulative table of them all to monthly_dir/README.md.
    With no position, nothing is measured or written.
    """
    if not positions:
        print("New games' Move-Matching: no new game, nothing measured", flush=True)
        return {"skipped": "no new game"}

    served_matches = first_choice_matches(models.served, positions)
    untrained_matches = first_choice_matches(models.untrained, positions)
    measurement = {
        "format_version": FORMAT_VERSION,
        "measured_on": day.isoformat(),
        "game_files": [path.name for path in game_files],
        "served_model": _model_record(models.served, models.rating),
        "untrained_model": _model_record(models.untrained, models.rating),
        "games": game_tallies(positions, served_matches, untrained_matches),
    }
    monthly_dir.mkdir(parents=True, exist_ok=True)
    measurement_path = new_dated_file(monthly_dir, day)
    measurement_path.write_text(json.dumps(measurement, indent=1), encoding="utf-8")

    every_measurement = []
    for path in dated_files_in_order(monthly_dir):
        every_measurement.append(json.loads(path.read_text(encoding="utf-8")))
    groups = table_groups(every_measurement, MINIMUM_MOVES)
    (monthly_dir / "README.md").write_text(_table_page(groups), encoding="utf-8")

    # This measurement is in the last group: alone, pooled with earlier ones,
    # or still waiting for the next.
    its_group = groups[-1]
    return {
        "measurement": measurement_path.name,
        "games": len(measurement["games"]),
        "moves": len(positions),
        "group": its_group,
    }


def first_choices_under_node(rating: int, repository_root: Path) -> FirstChoiceMatches:
    """Asks each model for its most likely move with the engine's own code, under Node, at the given rating.

    npm run move-probabilities places Camille's move in the model's
    distribution over the legal moves, most likely first: the model's first
    choice is his move when his move ranks first. That is the move the
    Move-Selection Engine plays from the model alone at temperature 0, as
    docs/experiments/move-matching.md measures it.
    """

    def first_choice_matches(model: Path, positions: list[Position]) -> list[bool]:
        with tempfile.TemporaryDirectory() as folder:
            positions_path = Path(folder) / "positions.jsonl"
            records_path = Path(folder) / "records.jsonl"
            lines = [json.dumps(asdict(position)) + "\n" for position in positions]
            positions_path.write_text("".join(lines), encoding="utf-8")
            command = ["npm", "run", "--silent", "move-probabilities", "--", str(model), "--rating", str(rating)]
            command += [str(positions_path), "--out", str(records_path)]
            subprocess.run(command, cwd=repository_root, check=True)
            records = [json.loads(line) for line in records_path.read_text(encoding="utf-8").splitlines()]

        matches = []
        # The records come in the order of the positions, one each.
        for played_position, record in zip(positions, records, strict=True):
            if (record["game_id"], record["ply"]) != (played_position.game_id, played_position.ply):
                raise ValueError(f"{model} answered {record['game_id']} ply {record['ply']} for {played_position.game_id} ply {played_position.ply}")
            matches.append(record["rank"] == 1)
        return matches

    return first_choice_matches


def _model_record(path: Path, rating: int) -> dict:
    return {"file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "rating": rating}


def game_tallies(positions: list[Position], served_matches: list[bool], untrained_matches: list[bool]) -> list[dict]:
    """Per game and per Phase: Camille's moves, and how many of them each model's first choice matched.

    served_matches[i] says whether the served model's most likely move in
    positions[i] is the move Camille played, untrained_matches[i] the same for
    the untrained model.
    """
    games: dict[str, dict] = {}
    for played_position, served_matched, untrained_matched in zip(positions, served_matches, untrained_matches, strict=True):
        game = games.get(played_position.game_id)
        if game is None:
            by_phase = {}
            for phase in PHASES:
                by_phase[phase] = {"moves": 0, "served": 0, "untrained": 0}
            game = {"game_id": played_position.game_id, "played_at": played_position.played_at, "by_phase": by_phase}
            games[played_position.game_id] = game

        tally = game["by_phase"][played_position.phase]
        tally["moves"] = tally["moves"] + 1
        if served_matched:
            tally["served"] = tally["served"] + 1
        if untrained_matched:
            tally["untrained"] = tally["untrained"] + 1
    return list(games.values())


def figures(games: list[dict]) -> dict:
    """Each model's Move-Matching and the gain between them, over every move ("all") and per Phase.

    Shares are fractions, like their standard errors, which are clustered by
    game: a game's moves share an opening, a plan and an opponent, so they
    are not independent samples. The gain's error is computed from each
    game's own gain, both models having answered the same positions, so
    whatever makes one game easier to guess than another cancels out of it.
    """
    slices = {"all": [_whole_game(game) for game in games]}
    for phase in PHASES:
        slices[phase] = [game["by_phase"][phase] for game in games]

    result = {}
    for name, tallies in slices.items():
        result[name] = _slice_figures(tallies)
    return result


def _whole_game(game: dict) -> dict:
    whole = {"moves": 0, "served": 0, "untrained": 0}
    for tally in game["by_phase"].values():
        for count in whole:
            whole[count] = whole[count] + tally[count]
    return whole


def _slice_figures(tallies: list[dict]) -> dict:
    # A game with no move in the slice, such as a short game in the endgame,
    # is not one of the slice's clusters.
    played = [tally for tally in tallies if tally["moves"] > 0]

    served = []
    untrained = []
    gain = []
    for tally in played:
        served.append(GameTally(total=tally["served"], positions=tally["moves"]))
        untrained.append(GameTally(total=tally["untrained"], positions=tally["moves"]))
        gain.append(GameTally(total=tally["served"] - tally["untrained"], positions=tally["moves"]))

    return {
        "games": len(played),
        "moves": sum(tally["moves"] for tally in played),
        "served": _mean_with_error(served),
        "untrained": _mean_with_error(untrained),
        "gain": _mean_with_error(gain),
    }


def _mean_with_error(games: list[GameTally]) -> dict:
    moves = sum(game.positions for game in games)
    if moves == 0:
        return {"share": None, "standard_error": None}
    total = sum(game.total for game in games)
    standard_error = clustered_standard_error(games)
    # One game's spread cannot be measured. The figures are written as JSON,
    # which holds null but not NaN.
    if math.isnan(standard_error):
        standard_error = None
    return {"share": total / moves, "standard_error": standard_error}


def table_groups(measurements: list[dict], minimum: int) -> list[dict]:
    """The measurements, in the order they were taken, gathered into the rows of the cumulative table.

    A measurement with at least `minimum` of Camille's moves is reported
    alone. One with fewer is not reported: its games wait for the next
    measurement's and are pooled with them, until the group holds the
    minimum. A group still short of it at the end is "waiting", and carries
    no figures.

    Months measured on two different served models are never pooled: the
    gain would then mix two models. A short group the served model changed
    under is closed "below the minimum", with no figures either.
    """
    groups = []
    open_group = []
    for taken in measurements:
        if open_group and _served_model(taken) != _served_model(open_group[-1]):
            groups.append(_group(open_group, "below the minimum"))
            open_group = []

        open_group.append(taken)
        if _moves_in(open_group) >= minimum:
            if len(open_group) > 1:
                groups.append(_group(open_group, "pooled"))
            else:
                groups.append(_group(open_group, "reported"))
            open_group = []
    if open_group:
        groups.append(_group(open_group, "waiting"))
    return groups


def _served_model(taken: dict) -> str:
    return taken["served_model"]["sha256"]


def _moves_in(measurements: list[dict]) -> int:
    moves = 0
    for taken in measurements:
        for game in taken["games"]:
            moves = moves + _whole_game(game)["moves"]
    return moves


def _group(measurements: list[dict], status: str) -> dict:
    games = []
    for taken in measurements:
        games.extend(taken["games"])

    months = set()
    for game in games:
        # "2026-10-03T10:00:00" was played in "2026-10".
        months.add(game["played_at"][:7])

    # Only a group that reached the minimum is reported.
    group_figures = None
    if status in ("reported", "pooled"):
        group_figures = figures(games)

    return {
        "measured_on": [taken["measured_on"] for taken in measurements],
        "months": sorted(months),
        "status": status,
        "games": len(games),
        "moves": _moves_in(measurements),
        "figures": group_figures,
    }


# What the table writes in place of a Phase for a group that is not reported.
UNREPORTED_LABELS = {
    "waiting": "Waiting for the next month",
    "below the minimum": "Below the minimum; the served model changed",
}


def cumulative_table(groups: list[dict]) -> str:
    """The cumulative table in Markdown: one block of rows per group, every move first, then each Phase.

    Move-Matching is in percent and the gain in points, each ± one standard
    error clustered by game. A group not reported gets a single row saying
    why, with its games and moves.
    """
    lines = [
        "| Games played | Measured on | Phase | Games | Moves | Served model | Untrained model | Gain |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for group in groups:
        months = ", ".join(group["months"])
        measured_on = ", ".join(group["measured_on"])
        if group["status"] == "pooled":
            measured_on = f"{measured_on} (pooled)"

        if group["figures"] is None:
            label = UNREPORTED_LABELS[group["status"]]
            lines.append(f"| {months} | {measured_on} | {label} | {group['games']} | {group['moves']} |  |  |  |")
            continue

        slice_labels = {"all": "All"}
        slice_labels.update(PHASE_LABELS)
        for slice_name, slice_label in slice_labels.items():
            slice_figures = group["figures"][slice_name]
            served = _percent(slice_figures["served"])
            untrained = _percent(slice_figures["untrained"])
            gain = _points(slice_figures["gain"])
            counts = f"{slice_figures['games']} | {slice_figures['moves']}"
            row = f"| {months} | {measured_on} | {slice_label} | {counts} | {served} | {untrained} | {gain} |"
            lines.append(row)
            # Only the first row of a group names its months and dates.
            months = ""
            measured_on = ""
    return "\n".join(lines) + "\n"


def _percent(figure: dict) -> str:
    if figure["share"] is None:
        return ""
    return f"{100 * figure['share']:.2f} ± {_error(figure)}"


def _points(figure: dict) -> str:
    if figure["share"] is None:
        return ""
    return f"{100 * figure['share']:+.2f} ± {_error(figure)}"


def _error(figure: dict) -> str:
    if figure["standard_error"] is None:
        return "n/a"
    return f"{100 * figure['standard_error']:.2f}"


def _table_page(groups: list[dict]) -> str:
    """The README of the monthly folder: what the table holds, then the table."""
    introduction = f"""# Move-Matching on each month's new games

Written by `pipeline/new_games_matching.py` at each refresh; the method is in
[the new games' Move-Matching](../new-games-matching.md). Each row measures the
served model and the untrained Maia-3 5M on the games a refresh brought,
before anything was trained on them: Move-Matching of each model's most
likely move, in percent, and the gain, served minus untrained, in points,
each ± one standard error clustered by game. A month with fewer than
{MINIMUM_MOVES:,} of Camille's moves is pooled with the next.

"""
    return introduction + cumulative_table(groups)


if __name__ == "__main__":
    # Imported here: the refresh imports this module, and owns where the
    # served model and the records live.
    from pipeline.refresh_games import REPOSITORY_ROOT, RefreshPaths, served_model

    parser = argparse.ArgumentParser(description="Measure the served and the untrained model on the games the named files bring.")
    parser.add_argument("new_files", nargs="+", type=Path, help="the game files whose games are new")
    arguments = parser.parse_args()
    paths = RefreshPaths.under(REPOSITORY_ROOT)
    _, served_rating = served_model()

    result = measure_new_games(
        positions_of_new_games(sorted(paths.raw_dir.glob("*.pgn")), arguments.new_files),
        date.today(),
        arguments.new_files,
        MeasuredModels(served=paths.served_model, untrained=paths.untrained_model, rating=served_rating),
        first_choices_under_node(served_rating, REPOSITORY_ROOT),
        paths.monthly_dir,
    )
    print(json.dumps(result, indent=1))
