"""Trains the style discriminator, checks it on Camille's Test Set, then asks it about the Bot and the Baseline.

Run from the repository root, once the dataset is built, the other players'
sample fetched and both sets of games played:

    python -m pipeline.fetch_other_players
    npm run bot-games
    npm run bot-games -- --baseline --out data/dataset/baseline-games.jsonl
    python -m pipeline.measure_style_discriminator

The discriminator is trained on Camille's training games against the other
players' training games, the two split by the same hash of the game's id.
It is checked on his Test Set against the other players it never saw, and
only then scores the Bot's games and the Baseline's. Both were played against
the same opponent with the same seed, so they differ only by the Opening
Book, and both are equally unlike a human game in every other way: no clock,
nobody resigns, a model across the board. Their difference is what the
experiment reports; their raw scores are read with that caution. The Bot as
the site serves it is scored too, from its own games.

The site scores the Bot's game at the end of each Session Game with this
same discriminator, so the run also writes what the page needs: the
discriminator's parameters, the scores of Camille's Test Set and of the other
players' test split it is read against, and how far the two stand apart. A
few of Camille's Test Set games and their scores are written beside it, for
the page's own scoring to be checked against this one.

Every figure comes with a 95% bootstrap interval. Written to
docs/experiments/results/style-discriminator.json; Markdown tables go to
standard output.
"""

import argparse
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from statistics import mean

from pipeline.bot_games import read_bot_games
from pipeline.build_dataset import TEST_FRACTION
from pipeline.dataset import Position, is_held_back, read_dataset
from pipeline.extract_blunder_profile import DATASET_DIR, REPOSITORY_ROOT
from pipeline.fetch_other_players import OTHER_PLAYERS_PATH
from pipeline.other_players import read_other_players
from pipeline.score_statistics import area_under_curve, bootstrap_interval
from pipeline.style_discriminator import (
    FIRST_PLY_READ,
    MIN_MOVES_READ,
    StyleDiscriminator,
    games_long_enough,
    train_discriminator,
)

# The version of the file's layout. Raise it whenever a reader of the old
# layout would misread the new one.
FORMAT_VERSION = 2

BOT_GAMES_PATH = DATASET_DIR / "bot-games.jsonl"
BASELINE_GAMES_PATH = DATASET_DIR / "baseline-games.jsonl"
SERVED_BOT_GAMES_PATH = DATASET_DIR / "bot-games-served.jsonl"
RESULTS_PATH = REPOSITORY_ROOT / "docs" / "experiments" / "results" / "style-discriminator.json"
SITE_PATH = REPOSITORY_ROOT / "src" / "explanation" / "style-discriminator.json"
PARITY_PATH = REPOSITORY_ROOT / "src" / "explanation" / "style-discriminator-parity.json"

# How many of Camille's Test Set games the page's scoring is checked on.
PARITY_GAMES = 12

# The decimals each reference score is shipped with: far finer than the
# page draws them, and a few kilobytes for both groups.
SHIPPED_DECIMALS = 4

# The groups of games scored, in the order the tables show them.
GROUP_LABELS = {
    "camille_test_set": "Camille, Test Set",
    "other_players_test_split": "Other players, test split",
    "bot": "Bot",
    "baseline": "Baseline",
    "served_bot": "Bot as served",
    "camille_training_games": "Camille, training games",
    "other_players_training_games": "Other players, training games",
}


@dataclass(frozen=True)
class Measurement:
    results: dict
    discriminator: StyleDiscriminator
    groups: dict[str, list[list[Position]]]
    scores: dict[str, list[dict]]


def measure(
    dataset_dir: Path, other_players_path: Path, bot_games_path: Path, baseline_games_path: Path, served_bot_games_path: Path
) -> Measurement:
    dataset = read_dataset(dataset_dir)
    other_positions = read_other_players(other_players_path)

    other_training_positions, other_test_split_positions = split_other_players(other_positions)

    groups = {
        "camille_test_set": games_long_enough(dataset.test),
        "other_players_test_split": games_long_enough(other_test_split_positions),
        "bot": games_long_enough(read_bot_games(bot_games_path)),
        "baseline": games_long_enough(read_bot_games(baseline_games_path)),
        "served_bot": games_long_enough(read_bot_games(served_bot_games_path)),
        "camille_training_games": games_long_enough(dataset.train),
        "other_players_training_games": games_long_enough(other_training_positions),
    }

    discriminator = train_discriminator(groups["camille_training_games"], groups["other_players_training_games"])

    scores = {}
    for name, games in groups.items():
        scores[name] = score_games(discriminator, games)

    results = {
        "format_version": FORMAT_VERSION,
        "min_moves_read": MIN_MOVES_READ,
        "groups": group_summaries(scores),
        # The check that comes first: on games it never saw, does it tell
        # Camille from players at his Level better than a coin toss?
        "test_set_separation": separation(scores["camille_test_set"], scores["other_players_test_split"]),
        # The same measure on the games it was trained on. Far above the
        # Test Set's figure, it would mean the discriminator memorised its
        # training games rather than learnt a style.
        "training_separation": separation(scores["camille_training_games"], scores["other_players_training_games"]),
        # The other players all come from Lichess, Camille's games mostly
        # from Chess.com. Separation on his Lichess games alone shows
        # whether the discriminator learnt the site rather than the player.
        "test_set_separation_lichess_only": separation(_from_source(scores["camille_test_set"], "lichess"), scores["other_players_test_split"]),
        "test_set_separation_chesscom_only": separation(_from_source(scores["camille_test_set"], "chesscom"), scores["other_players_test_split"]),
        # The Bot and the Baseline measured as Camille's Test Set is: a
        # group that plays like him stands out from the other players as
        # much as his own games do.
        "bot_against_other_players": separation(scores["bot"], scores["other_players_test_split"]),
        "baseline_against_other_players": separation(scores["baseline"], scores["other_players_test_split"]),
        "bot_against_baseline": compare_mean_scores(scores["bot"], scores["baseline"]),
        "served_bot_against_other_players": separation(scores["served_bot"], scores["other_players_test_split"]),
        "weights": _strongest_push_first(discriminator.weights()),
    }
    return Measurement(results=results, discriminator=discriminator, groups=groups, scores=scores)


def site_record(measurement: Measurement, measured_on: date) -> dict:
    """What the page reads to score a game and set it against Camille's games and other players'."""
    results = measurement.results
    groups = results["groups"]
    return {
        "measuredOn": measured_on.isoformat(),
        "firstPlyRead": FIRST_PLY_READ,
        "minMovesRead": MIN_MOVES_READ,
        "discriminator": _camel_case_keys(measurement.discriminator.exported()),
        "trainedOn": {
            "camille": groups["camille_training_games"]["games"],
            "otherPlayers": groups["other_players_training_games"]["games"],
        },
        "camille": _shipped_group(measurement.scores["camille_test_set"], groups["camille_test_set"]),
        "otherPlayers": _shipped_group(measurement.scores["other_players_test_split"], groups["other_players_test_split"]),
        "separation": _shipped_separation(results["test_set_separation"]),
        "separationLichessOnly": _shipped_separation(results["test_set_separation_lichess_only"]),
    }


def parity_record(measurement: Measurement) -> dict:
    """A few of Camille's Test Set games, move by move, with the score this discriminator gives each."""
    games = sorted(measurement.groups["camille_test_set"], key=lambda game: game[0].game_id)[:PARITY_GAMES]
    shipped = []
    for game in games:
        moves = [{"ply": position.ply, "fen": position.fen, "uci": position.move} for position in game]
        shipped.append({"gameId": game[0].game_id, "moves": moves, "score": measurement.discriminator.camille_probability(game)})
    return {"games": shipped}


def _shipped_group(scored: list[dict], summary: dict) -> dict:
    scores = sorted(round(game["score"], SHIPPED_DECIMALS) for game in scored)
    return {"games": summary["games"], "shareScoredAsCamille": summary["share_scored_as_camille"], "scores": scores}


def _shipped_separation(separation: dict) -> dict:
    return {
        "candidateGames": separation["candidate_games"],
        "areaUnderCurve": separation["area_under_curve"],
        "interval": separation["area_under_curve_interval"],
    }


def _camel_case_keys(record: dict) -> dict:
    """The keys of a Python record as the page's JSON files write them."""
    shipped = {}
    for key, value in record.items():
        first, *rest = key.split("_")
        shipped[first + "".join(word.capitalize() for word in rest)] = value
    return shipped


def split_other_players(other_positions: list[Position]) -> tuple[list[Position], list[Position]]:
    """The other players' training games and test split, divided by the same hash as Camille's."""
    training = []
    test_split = []
    for position in other_positions:
        if is_held_back(position.game_id, TEST_FRACTION):
            test_split.append(position)
        else:
            training.append(position)
    return training, test_split


def score_games(discriminator: StyleDiscriminator, games: list[list[Position]]) -> list[dict]:
    scored = []
    for game in games:
        scored.append({"game_id": game[0].game_id, "source": game[0].source, "score": discriminator.camille_probability(game)})
    return scored


def _values(scored: list[dict]) -> list[float]:
    return [game["score"] for game in scored]


def _from_source(scored: list[dict], source: str) -> list[dict]:
    return [game for game in scored if game["source"] == source]


def group_summaries(scores: dict[str, list[dict]]) -> dict:
    summaries = {}
    for name, scored in scores.items():
        values = _values(scored)
        above_half = [value for value in values if value > 0.5]
        low, high = bootstrap_interval([values], mean)
        summaries[name] = {
            "games": len(values),
            "mean_score": mean(values),
            "mean_score_interval": [low, high],
            "share_scored_as_camille": len(above_half) / len(values),
        }
    return summaries


def separation(candidate_scored: list[dict], other_scored: list[dict]) -> dict:
    """How far a group of games stands out from other players' games as Camille's: the area under the curve."""
    candidate_values = _values(candidate_scored)
    other_values = _values(other_scored)
    low, high = bootstrap_interval([candidate_values, other_values], area_under_curve)
    return {
        "candidate_games": len(candidate_values),
        "other_games": len(other_values),
        "area_under_curve": area_under_curve(candidate_values, other_values),
        "area_under_curve_interval": [low, high],
    }


def compare_mean_scores(first_scored: list[dict], second_scored: list[dict]) -> dict:
    """How much more like Camille's the first group of games scores than the second, with intervals."""
    first_values = _values(first_scored)
    second_values = _values(second_scored)

    def difference_of_means(first: list[float], second: list[float]) -> float:
        return mean(first) - mean(second)

    difference_low, difference_high = bootstrap_interval([first_values, second_values], difference_of_means)
    # The probability that a game of the first group looks more like
    # Camille's than a game of the second: 0.5 when nothing the
    # discriminator can see tells the two groups apart.
    auc_low, auc_high = bootstrap_interval([first_values, second_values], area_under_curve)
    return {
        "mean_score_difference": difference_of_means(first_values, second_values),
        "mean_score_difference_interval": [difference_low, difference_high],
        "area_under_curve": area_under_curve(first_values, second_values),
        "area_under_curve_interval": [auc_low, auc_high],
    }


def _strongest_push_first(weights: dict[str, float]) -> dict[str, float]:
    """The weights, strongest push first, whichever its direction."""
    names = sorted(weights, key=lambda name: abs(weights[name]), reverse=True)
    return {name: weights[name] for name in names}


def tables(results: dict) -> str:
    lines = ["| Games | Scored | Mean score (95% interval) | Scored as Camille |", "|---|---|---|---|"]
    for name, label in GROUP_LABELS.items():
        group = results["groups"][name]
        interval = _interval(group["mean_score"], group["mean_score_interval"])
        lines.append(f"| {label} | {group['games']:,} | {interval} | {_percent(group['share_scored_as_camille'])} |")

    lines += ["", "| Separation | Area under the curve (95% interval) |", "|---|---|"]
    separations = [
        ("Camille's Test Set against the other players' test split", results["test_set_separation"]),
        ("Camille's Lichess Test Set games against the other players' test split", results["test_set_separation_lichess_only"]),
        ("Camille's Chess.com Test Set games against the other players' test split", results["test_set_separation_chesscom_only"]),
        ("Training games, for comparison", results["training_separation"]),
        ("Bot against the other players' test split", results["bot_against_other_players"]),
        ("Baseline against the other players' test split", results["baseline_against_other_players"]),
        ("Bot against Baseline", results["bot_against_baseline"]),
        ("Bot as served against the other players' test split", results["served_bot_against_other_players"]),
    ]
    for label, separation in separations:
        lines.append(f"| {label} | {_interval(separation['area_under_curve'], separation['area_under_curve_interval'])} |")

    comparison = results["bot_against_baseline"]
    difference = _interval(comparison["mean_score_difference"], comparison["mean_score_difference_interval"], signed=True)
    lines += ["", f"Bot's mean score minus the Baseline's: {difference}"]

    lines += ["", "| Statistic | Weight |", "|---|---|"]
    for name, weight in results["weights"].items():
        lines.append(f"| {name} | {weight:+.2f} |")
    return "\n".join(lines)


def _interval(value: float, interval: list[float], signed: bool = False) -> str:
    low, high = interval
    if signed:
        return f"{value:+.3f} ({low:+.3f} to {high:+.3f})"
    return f"{value:.3f} ({low:.3f} to {high:.3f})"


def _percent(share: float) -> str:
    return f"{100 * share:.1f}%"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train the style discriminator and score the Bot's and the Baseline's games.")
    parser.add_argument("--other-players", type=Path, default=OTHER_PLAYERS_PATH)
    parser.add_argument("--bot-games", type=Path, default=BOT_GAMES_PATH)
    parser.add_argument("--baseline-games", type=Path, default=BASELINE_GAMES_PATH)
    parser.add_argument("--served-bot-games", type=Path, default=SERVED_BOT_GAMES_PATH)
    arguments = parser.parse_args()

    measurement = measure(
        DATASET_DIR, arguments.other_players, arguments.bot_games, arguments.baseline_games, arguments.served_bot_games
    )
    RESULTS_PATH.write_text(json.dumps(measurement.results, indent=1), encoding="utf-8")
    SITE_PATH.write_text(json.dumps(site_record(measurement, date.today()), indent=1), encoding="utf-8")
    PARITY_PATH.write_text(json.dumps(parity_record(measurement), indent=1), encoding="utf-8")

    print(f"Written to {RESULTS_PATH}, {SITE_PATH} and {PARITY_PATH}")
    print()
    print(tables(measurement.results))
