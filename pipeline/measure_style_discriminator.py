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
experiment reports; their raw scores are read with that caution.

Every figure comes with a 95% bootstrap interval. Written to
docs/experiments/results/style-discriminator.json; Markdown tables go to
standard output.
"""

import argparse
import json
from pathlib import Path
from statistics import mean

from pipeline.bot_games import read_bot_games
from pipeline.build_dataset import TEST_FRACTION
from pipeline.dataset import Position, is_held_back, read_dataset
from pipeline.extract_blunder_profile import DATASET_DIR, REPOSITORY_ROOT
from pipeline.fetch_other_players import OTHER_PLAYERS_PATH
from pipeline.other_players import read_other_players
from pipeline.score_statistics import area_under_curve, bootstrap_interval
from pipeline.style_discriminator import MIN_MOVES_READ, StyleDiscriminator, games_long_enough, train_discriminator

# The version of the file's layout. Raise it whenever a reader of the old
# layout would misread the new one.
FORMAT_VERSION = 1

BOT_GAMES_PATH = DATASET_DIR / "bot-games.jsonl"
BASELINE_GAMES_PATH = DATASET_DIR / "baseline-games.jsonl"
RESULTS_PATH = REPOSITORY_ROOT / "docs" / "experiments" / "results" / "style-discriminator.json"

# The groups of games scored, in the order the tables show them.
GROUP_LABELS = {
    "camille_test_set": "Camille, Test Set",
    "other_players_test_split": "Other players, test split",
    "bot": "Bot",
    "baseline": "Baseline",
    "camille_training_games": "Camille, training games",
    "other_players_training_games": "Other players, training games",
}


def measure(dataset_dir: Path, other_players_path: Path, bot_games_path: Path, baseline_games_path: Path) -> dict:
    dataset = read_dataset(dataset_dir)
    other_positions = read_other_players(other_players_path)

    other_training_positions = []
    other_test_split_positions = []
    for position in other_positions:
        if is_held_back(position.game_id, TEST_FRACTION):
            other_test_split_positions.append(position)
        else:
            other_training_positions.append(position)

    groups = {
        "camille_test_set": games_long_enough(dataset.test),
        "other_players_test_split": games_long_enough(other_test_split_positions),
        "bot": games_long_enough(read_bot_games(bot_games_path)),
        "baseline": games_long_enough(read_bot_games(baseline_games_path)),
        "camille_training_games": games_long_enough(dataset.train),
        "other_players_training_games": games_long_enough(other_training_positions),
    }

    discriminator = train_discriminator(groups["camille_training_games"], groups["other_players_training_games"])

    scores = {}
    for name, games in groups.items():
        scores[name] = _scores(discriminator, games)

    return {
        "format_version": FORMAT_VERSION,
        "min_moves_read": MIN_MOVES_READ,
        "groups": _group_summaries(scores),
        # The check that comes first: on games it never saw, does it tell
        # Camille from players at his Level better than a coin toss?
        "test_set_separation": _separation(scores["camille_test_set"], scores["other_players_test_split"]),
        # The same measure on the games it was trained on. Far above the
        # Test Set's figure, it would mean the discriminator memorised its
        # training games rather than learnt a style.
        "training_separation": _separation(scores["camille_training_games"], scores["other_players_training_games"]),
        # The other players all come from Lichess, Camille's games mostly
        # from Chess.com. Separation on his Lichess games alone shows
        # whether the discriminator learnt the site rather than the player.
        "test_set_separation_lichess_only": _separation(_from_source(scores["camille_test_set"], "lichess"), scores["other_players_test_split"]),
        "test_set_separation_chesscom_only": _separation(_from_source(scores["camille_test_set"], "chesscom"), scores["other_players_test_split"]),
        # The Bot and the Baseline measured as Camille's Test Set is: a
        # group that plays like him stands out from the other players as
        # much as his own games do.
        "bot_against_other_players": _separation(scores["bot"], scores["other_players_test_split"]),
        "baseline_against_other_players": _separation(scores["baseline"], scores["other_players_test_split"]),
        "bot_against_baseline": _bot_against_baseline(scores["bot"], scores["baseline"]),
        "weights": _strongest_push_first(discriminator.weights()),
    }


def _scores(discriminator: StyleDiscriminator, games: list[list[Position]]) -> list[dict]:
    scored = []
    for game in games:
        scored.append({"game_id": game[0].game_id, "source": game[0].source, "score": discriminator.camille_probability(game)})
    return scored


def _values(scored: list[dict]) -> list[float]:
    return [game["score"] for game in scored]


def _from_source(scored: list[dict], source: str) -> list[dict]:
    return [game for game in scored if game["source"] == source]


def _group_summaries(scores: dict[str, list[dict]]) -> dict:
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


def _separation(candidate_scored: list[dict], other_scored: list[dict]) -> dict:
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


def _bot_against_baseline(bot_scored: list[dict], baseline_scored: list[dict]) -> dict:
    bot_values = _values(bot_scored)
    baseline_values = _values(baseline_scored)

    def difference_of_means(bot: list[float], baseline: list[float]) -> float:
        return mean(bot) - mean(baseline)

    difference_low, difference_high = bootstrap_interval([bot_values, baseline_values], difference_of_means)
    # The probability that a Bot game looks more like Camille's than a
    # Baseline game does: 0.5 when the book changes nothing the
    # discriminator can see.
    auc_low, auc_high = bootstrap_interval([bot_values, baseline_values], area_under_curve)
    return {
        "mean_score_difference": difference_of_means(bot_values, baseline_values),
        "mean_score_difference_interval": [difference_low, difference_high],
        "area_under_curve": area_under_curve(bot_values, baseline_values),
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
    arguments = parser.parse_args()

    results = measure(DATASET_DIR, arguments.other_players, arguments.bot_games, arguments.baseline_games)
    RESULTS_PATH.write_text(json.dumps(results, indent=1), encoding="utf-8")

    print(f"Written to {RESULTS_PATH}")
    print()
    print(tables(results))
