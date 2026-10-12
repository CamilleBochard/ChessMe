"""Separates what fine-tuning learns from Camille from what any player at his Level would teach it.

Run from the repository root, once the dataset is built, the weights fetched
and the other players' sample drawn:

    python -m pipeline.fetch_other_players
    python -m pipeline.measure_fine_tuning_control

Fine-tuning the Base Model on Camille's games raised Move-Matching on his
Test Set (docs/experiments/fine-tuning.md). Part of that gain may have
nothing to do with him: the model may be adapting to the copied history the
engine gives it, or to ten-minute games. Here two models are trained with
the same recipe, the one the first run chose on validation (every weight,
learning rate 1e-5, one epoch). One learns from Camille's training games,
the other from as many positions of other players' ten-minute games at his
Level. Both are measured on Camille's Test Set. Whatever the second gains
over the Baseline is not his Style; what the first gains over the second is.

Both models are trained in the same run rather than reusing the first
run's weights, so that nothing but the games differs between them.

Written to docs/experiments/results/fine-tuning-control.json; Markdown
tables go to standard output, progress to standard error.
"""

import argparse
import copy
import json
from datetime import date
from pathlib import Path

import torch

from pipeline.convert_maia3 import load_reference
from pipeline.dataset import Position, read_dataset
from pipeline.extract_blunder_profile import DATASET_DIR, REPOSITORY_ROOT
from pipeline.fetch_other_players import OTHER_PLAYERS_PATH
from pipeline.fine_tuning import TrainingSettings, fine_tune, split_validation, take_whole_games, top_moves
from pipeline.measure_fine_tuning import (
    PHASE_COLUMNS,
    RATING,
    SEED,
    TRAINING_BATCH_SIZE,
    VALIDATION_FRACTION,
    check_against_engine,
    comparison_as_json,
    game_count,
    percent,
    phase_cells,
    points,
    progress,
    report_as_json,
)
from pipeline.move_matching import compare_with_baseline, move_matching_report
from pipeline.other_players import read_other_players

# The version of the file's layout. Raise it whenever a reader of the old
# layout would misread the new one.
FORMAT_VERSION = 1

RESULTS_PATH = REPOSITORY_ROOT / "docs" / "experiments" / "results" / "fine-tuning-control.json"

# The recipe the first run chose on validation for training every weight.
LEARNING_RATE = 1e-5
EPOCHS = 1

# Whose games each model learns from, in the order the tables show them.
SOURCE_LABELS = {"camille": "Camille's games", "otherPlayers": "other players' games"}


def train_on(base_model: torch.nn.Module, training: list[Position], validation: list[Position], source: str):
    """A copy of the Base Model fine-tuned with the fixed recipe on one source's positions."""
    torch.manual_seed(SEED)
    model = copy.deepcopy(base_model)
    settings = TrainingSettings(
        learning_rate=LEARNING_RATE,
        epochs=EPOCHS,
        batch_size=TRAINING_BATCH_SIZE,
        rating=RATING,
        seed=SEED,
    )
    progress(f"{source}: training on {len(training):,} positions from {game_count(training):,} games")

    def report_epoch(epoch: int, validation_score: float) -> None:
        progress(f"{source}: epoch {epoch}: validation {100 * validation_score:.2f}%")

    run = fine_tune(model, training, validation, settings, report_epoch=report_epoch)
    return model, run


def measure(dataset_dir: Path, other_players_path: Path, device: str) -> dict:
    dataset = read_dataset(dataset_dir)
    camille_training, validation = split_validation(dataset.train, VALIDATION_FRACTION)
    other_positions = read_other_players(other_players_path)
    other_training = take_whole_games(other_positions, len(camille_training))
    sources = {"camille": camille_training, "otherPlayers": other_training}
    test_fens = [position.fen for position in dataset.test]

    base_model = load_reference().to(device)
    progress(f"Baseline: playing {len(dataset.test):,} Test Set positions on {device}")
    baseline_moves = top_moves(base_model, test_fens, RATING)
    baseline_report = move_matching_report(dataset.test, baseline_moves)
    engine_check = check_against_engine(baseline_report)
    if not engine_check["identical"]:
        progress(f"Warning: the PyTorch Baseline differs from the engine's: {engine_check}")

    models_moves = {}
    models = {}
    for source, training in sources.items():
        model, run = train_on(base_model, training, validation, source)
        progress(f"{source}: playing the Test Set")
        moves = top_moves(model, test_fens, RATING)
        comparison = compare_with_baseline(dataset.test, baseline_moves, moves)
        models_moves[source] = moves
        models[source] = {
            "training": {"positions": len(training), "games": game_count(training)},
            "validationAfterPly10ByEpoch": run.validation_by_epoch,
            "testSet": report_as_json(move_matching_report(dataset.test, moves)),
            "gainOverBaseline": comparison_as_json(comparison),
        }

    # Camille's model against the control: the part of the gain only his games gave.
    camille_over_control = compare_with_baseline(dataset.test, models_moves["otherPlayers"], models_moves["camille"])

    return {
        "formatVersion": FORMAT_VERSION,
        "measuredOn": date.today().isoformat(),
        "runtime": f"PyTorch {torch.__version__} on {device}",
        "baseModel": "maia3-5m",
        "rating": RATING,
        "learningRate": LEARNING_RATE,
        "epochs": EPOCHS,
        "batchSize": TRAINING_BATCH_SIZE,
        "validation": {"positions": len(validation), "games": game_count(validation)},
        "baseline": report_as_json(baseline_report),
        "baselineCheckedAgainstEngine": engine_check,
        "models": models,
        "camilleOverControl": comparison_as_json(camille_over_control),
    }


def print_tables(results: dict) -> None:
    print("Move-Matching on Camille's Test Set, in percent, ± one standard error clustered by game.\n")
    print(f"| Model {PHASE_COLUMNS}")
    print("|---|---|---|---|---|---|")
    print(f"| Baseline | {phase_cells(results['baseline'], percent)} |")
    for source, label in SOURCE_LABELS.items():
        print(f"| Fine-tuned on {label} | {phase_cells(results['models'][source]['testSet'], percent)} |")

    print("\nGains on the same positions, in percentage points, ± one standard error.\n")
    print(f"| Gain {PHASE_COLUMNS}")
    print("|---|---|---|---|---|---|")
    for source, label in SOURCE_LABELS.items():
        gain = results["models"][source]["gainOverBaseline"]
        print(f"| Trained on {label}, over the Baseline | {phase_cells(gain, points)} |")
    print(f"| Trained on Camille's games, over other players' | {phase_cells(results['camilleOverControl'], points)} |")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    default_device = "cuda" if torch.cuda.is_available() else "cpu"
    parser.add_argument("--device", default=default_device, help=f"where to run the network (default: {default_device})")
    arguments = parser.parse_args()

    results = measure(DATASET_DIR, OTHER_PLAYERS_PATH, arguments.device)
    RESULTS_PATH.write_text(json.dumps(results, indent=1) + "\n", encoding="utf-8")
    print_tables(results)
    progress(f"Written to {RESULTS_PATH}")
