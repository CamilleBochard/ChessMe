"""Recreates the fine-tuned Base Model from the repository and checks it against the recorded run.

Run from the repository root, once the dataset is built and the weights fetched:

    python -m pipeline.fetch_models
    python -m pipeline.recreate_fine_tuned

The model is trained with the recipe the fine-tuning experiment chose on
validation (every weight, learning rate 1e-5, one epoch, seed 0), on the same
training games, then plays the Test Set. Its matched counts are set beside the
ones the experiment recorded in docs/experiments/results/fine-tuning.json,
slice by slice. A processor other than the one the experiment trained on
rounds differently, so the counts may come out a few moves apart; when the
experiment's own weights are at models/fine-tuned/maia3-5m-full.pt, the two
models are also compared weight by weight and move by move, which tells
rounding apart from a recipe that no longer reproduces.

The weights are written to models/fine-tuned/maia3-5m-full-recreated.pt, the
check to docs/experiments/results/fine-tuned-recreation.json; progress goes to
standard error.
"""

import argparse
import json
import os
import platform
import time
from datetime import date

import torch

from pipeline.convert_maia3 import load_reference
from pipeline.dataset import read_dataset
from pipeline.extract_blunder_profile import DATASET_DIR, REPOSITORY_ROOT
from pipeline.fine_tuning import largest_weight_difference, split_validation, top_moves
from pipeline.measure_fine_tuning import (
    FINE_TUNED_DIR,
    RATING,
    RESULTS_PATH as FINE_TUNING_RESULTS_PATH,
    VALIDATION_FRACTION,
    progress,
    report_as_json,
)
from pipeline.measure_fine_tuning_control import EPOCHS, LEARNING_RATE, train_on
from pipeline.move_matching import move_matching_report, same_counts_as_recorded

# The version of the file's layout. Raise it whenever a reader of the old
# layout would misread the new one.
FORMAT_VERSION = 1

EXPERIMENT_WEIGHTS_PATH = FINE_TUNED_DIR / "maia3-5m-full.pt"
RECREATED_WEIGHTS_PATH = FINE_TUNED_DIR / "maia3-5m-full-recreated.pt"
RESULTS_PATH = REPOSITORY_ROOT / "docs" / "experiments" / "results" / "fine-tuned-recreation.json"


def recreate(device: str) -> dict:
    dataset = read_dataset(DATASET_DIR)
    training, validation = split_validation(dataset.train, VALIDATION_FRACTION)
    test_fens = [position.fen for position in dataset.test]

    base_model = load_reference().to(device)
    started = time.monotonic()
    model, run = train_on(base_model, training, validation, "camille")
    training_minutes = (time.monotonic() - started) / 60
    FINE_TUNED_DIR.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), RECREATED_WEIGHTS_PATH)

    progress("Playing the Test Set")
    moves = top_moves(model, test_fens, RATING)
    report = move_matching_report(dataset.test, moves)
    recorded_file = json.loads(FINE_TUNING_RESULTS_PATH.read_text(encoding="utf-8"))
    recorded = recorded_file["variants"]["full"]["testSet"]

    results = {
        "formatVersion": FORMAT_VERSION,
        "measuredOn": date.today().isoformat(),
        "runtime": f"PyTorch {torch.__version__} on {device}, {platform.machine()}, {os.cpu_count()} logical processors",
        "recordedRuntime": recorded_file["runtime"],
        "learningRate": LEARNING_RATE,
        "epochs": EPOCHS,
        "trainingMinutes": training_minutes,
        "validationAfterPly10ByEpoch": run.validation_by_epoch,
        "testSet": report_as_json(report),
        "countsAgainstRecorded": same_counts_as_recorded(report, recorded),
        "againstExperimentWeights": None,
    }

    if EXPERIMENT_WEIGHTS_PATH.exists():
        progress(f"Comparing with the experiment's weights at {EXPERIMENT_WEIGHTS_PATH}")
        experiment_model = load_reference(EXPERIMENT_WEIGHTS_PATH).to(device)
        experiment_moves = top_moves(experiment_model, test_fens, RATING)
        different_moves = 0
        for recreated_move, experiment_move in zip(moves, experiment_moves):
            if recreated_move != experiment_move:
                different_moves += 1
        recreated_weights = _on_cpu(model.state_dict())
        experiment_weights = _on_cpu(experiment_model.state_dict())
        results["againstExperimentWeights"] = {
            "largestWeightDifference": largest_weight_difference(recreated_weights, experiment_weights),
            "testSetPositionsWithAnotherTopMove": different_moves,
        }
    return results


def _on_cpu(state: dict[str, torch.Tensor]) -> dict[str, torch.Tensor]:
    """A model's weights copied to the CPU, so two models trained on different devices compare."""
    weights = {}
    for name, tensor in state.items():
        weights[name] = tensor.cpu()
    return weights


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    default_device = "cuda" if torch.cuda.is_available() else "cpu"
    parser.add_argument("--device", default=default_device, help=f"where to run the network (default: {default_device})")
    arguments = parser.parse_args()

    results = recreate(arguments.device)
    RESULTS_PATH.write_text(json.dumps(results, indent=1) + "\n", encoding="utf-8")

    check = results["countsAgainstRecorded"]
    for name, counts in check["slices"].items():
        print(f"{name:>11}: recorded {counts['recorded']:>5}, recreated {counts['measured']:>5}")
    if check["identical"]:
        print("Identical to the recorded run in every slice.")
    else:
        print("NOT identical to the recorded run.")
    against = results["againstExperimentWeights"]
    if against is not None:
        print(f"Largest weight difference from the experiment's weights: {against['largestWeightDifference']:.3g}")
        print(f"Test Set positions where the two play another top move: {against['testSetPositionsWithAnotherTopMove']}")
    print(f"Training took {results['trainingMinutes']:.1f} minutes. Written to {RESULTS_PATH}")
