"""Asks the style discriminator whether the Bot's games pass for Camille's, with each Base Model.

Run from the repository root, once the dataset is built, the other players'
sample fetched and each Bot's games played with `npm run bot-games`:

    python -m pipeline.measure_model_choice_style \\
        --original data/dataset/bot-games-original.jsonl \\
        --fine-tuned data/dataset/bot-games-fine-tuned.jsonl

The discriminator is trained exactly as in the style discriminator experiment,
on Camille's training games against the other players' training games, and
checked on his Test Set. It then scores both Bots' games. Both sets were
played against the same opponent with the same seed, so they differ only by
the Bot's model; what the experiment reports is the fine-tuned Bot's mean
score minus the original's, with a 95% bootstrap interval. Written to
docs/experiments/results/model-choice-style.json; a Markdown table goes to
standard output.
"""

import argparse
import json
from pathlib import Path

from pipeline.bot_games import read_bot_games
from pipeline.dataset import read_dataset
from pipeline.extract_blunder_profile import DATASET_DIR, REPOSITORY_ROOT
from pipeline.fetch_other_players import OTHER_PLAYERS_PATH
from pipeline.measure_style_discriminator import (
    compare_mean_scores,
    group_summaries,
    score_games,
    separation,
    split_other_players,
)
from pipeline.other_players import read_other_players
from pipeline.style_discriminator import MIN_MOVES_READ, games_long_enough, train_discriminator

# The version of the file's layout. Raise it whenever a reader of the old
# layout would misread the new one.
FORMAT_VERSION = 1

RESULTS_PATH = REPOSITORY_ROOT / "docs" / "experiments" / "results" / "model-choice-style.json"

GROUP_LABELS = {
    "camille_test_set": "Camille, Test Set",
    "other_players_test_split": "Other players, test split",
    "original": "Bot, original model",
    "fine_tuned": "Bot, fine-tuned model",
}


def measure(dataset_dir: Path, other_players_path: Path, original_games_path: Path, fine_tuned_games_path: Path) -> dict:
    dataset = read_dataset(dataset_dir)
    other_training, other_test_split = split_other_players(read_other_players(other_players_path))
    discriminator = train_discriminator(games_long_enough(dataset.train), games_long_enough(other_training))

    groups = {
        "camille_test_set": games_long_enough(dataset.test),
        "other_players_test_split": games_long_enough(other_test_split),
        "original": games_long_enough(read_bot_games(original_games_path)),
        "fine_tuned": games_long_enough(read_bot_games(fine_tuned_games_path)),
    }
    scores = {}
    for name, games in groups.items():
        scores[name] = score_games(discriminator, games)

    return {
        "format_version": FORMAT_VERSION,
        "min_moves_read": MIN_MOVES_READ,
        "groups": group_summaries(scores),
        "test_set_separation": separation(scores["camille_test_set"], scores["other_players_test_split"]),
        "original_against_other_players": separation(scores["original"], scores["other_players_test_split"]),
        "fine_tuned_against_other_players": separation(scores["fine_tuned"], scores["other_players_test_split"]),
        "fine_tuned_against_original": compare_mean_scores(scores["fine_tuned"], scores["original"]),
    }


def table(results: dict) -> str:
    lines = ["| Games | Scored | Mean score (95% interval) | Scored as Camille |", "|---|---|---|---|"]
    for name, label in GROUP_LABELS.items():
        group = results["groups"][name]
        low, high = group["mean_score_interval"]
        share = 100 * group["share_scored_as_camille"]
        lines.append(f"| {label} | {group['games']:,} | {group['mean_score']:.3f} ({low:.3f} to {high:.3f}) | {share:.1f}% |")

    lines += ["", "| Separation from the other players' test split | Area under the curve (95% interval) |", "|---|---|"]
    for key, label in [
        ("test_set_separation", "Camille's Test Set"),
        ("original_against_other_players", "Bot, original model"),
        ("fine_tuned_against_other_players", "Bot, fine-tuned model"),
    ]:
        low, high = results[key]["area_under_curve_interval"]
        lines.append(f"| {label} | {results[key]['area_under_curve']:.3f} ({low:.3f} to {high:.3f}) |")

    comparison = results["fine_tuned_against_original"]
    low, high = comparison["mean_score_difference_interval"]
    lines += ["", f"Fine-tuned Bot's mean score minus the original's: {comparison['mean_score_difference']:+.3f} ({low:+.3f} to {high:+.3f})"]
    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Score both Bots' games with the style discriminator.")
    parser.add_argument("--other-players", type=Path, default=OTHER_PLAYERS_PATH)
    parser.add_argument("--original", type=Path, required=True, help="games the Bot played with the original model")
    parser.add_argument("--fine-tuned", type=Path, required=True, help="games the Bot played with the fine-tuned model")
    arguments = parser.parse_args()

    results = measure(DATASET_DIR, arguments.other_players, arguments.original, arguments.fine_tuned)
    RESULTS_PATH.write_text(json.dumps(results, indent=1), encoding="utf-8")
    print(f"Written to {RESULTS_PATH}")
    print()
    print(table(results))
