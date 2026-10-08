"""Fine-tunes the Base Model on Camille's training games and measures it against the Baseline.

Run from the repository root, once the dataset is built and the weights fetched:

    python -m pipeline.fetch_models
    python -m pipeline.measure_fine_tuning

A GPU is used when PyTorch finds one; notebooks/fine-tuning.ipynb runs the
same command on Google Colab. On an 8-core CPU the whole run takes hours.

Two variants are trained. The first trains all of the Base Model's weights.
The second freezes them and trains only a small adapter between the trunk and
the heads. Each variant is trained at a few learning rates; the rate, and the
epoch within it, are chosen on validation games set aside from the training
games. Only the chosen model of each variant then plays the Test Set, once,
and is compared with the Baseline position by position.

The Baseline is played here by the PyTorch Base Model, and its counts are
checked against the ones the engine recorded under Node for the Opening Book
experiment: the two must agree for the comparison to mean anything.

Written to docs/experiments/results/fine-tuning.json; Markdown tables go to
standard output, progress to standard error. Each variant's chosen weights
are saved to models/fine-tuned, outside the site: a model reaches the browser
only through models/onnx/maia3-5m.onnx, and only a variant that beats the
Baseline may be converted and put there.
"""

import argparse
import copy
import json
import sys
from dataclasses import asdict
from datetime import date
from pathlib import Path

import torch

from pipeline.convert_maia3 import load_reference
from pipeline.dataset import Position, read_dataset
from pipeline.extract_blunder_profile import DATASET_DIR, REPOSITORY_ROOT
from pipeline.fine_tuning import TrainingSettings, fine_tune, split_validation, top_moves, with_adapter
from pipeline.move_matching import (
    PHASES,
    BaselineComparison,
    MoveMatchingReport,
    MoveMatchingScore,
    beats_baseline,
    compare_with_baseline,
    move_matching_report,
)

# The version of the file's layout. Raise it whenever a reader of the old
# layout would misread the new one.
FORMAT_VERSION = 1

RESULTS_PATH = REPOSITORY_ROOT / "docs" / "experiments" / "results" / "fine-tuning.json"
ENGINE_BASELINE_PATH = REPOSITORY_ROOT / "docs" / "experiments" / "results" / "opening-book.json"
FINE_TUNED_DIR = REPOSITORY_ROOT / "models" / "fine-tuned"

# The Base Model's rating, chosen by the sweep (docs/experiments/base-model-sweep.md).
RATING = 1100

# A tenth of the training games judges each epoch and learning rate.
VALIDATION_FRACTION = 0.1

# The adapter squeezes each square's 256 numbers through this many.
ADAPTER_WIDTH = 16

BATCH_SIZE = 64

# Each grid spans two orders of magnitude around the rates usually used for
# its kind of training: small for weights that already encode millions of
# games, larger for an adapter that starts from nothing.
VARIANTS = {
    "full": {"learning_rates": [1e-6, 1e-5, 1e-4], "epochs": 4},
    "adapter": {"learning_rates": [1e-4, 1e-3, 1e-2], "epochs": 6},
}

SEED = 0


def progress(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def build_variant(base_model: torch.nn.Module, variant: str) -> torch.nn.Module:
    # A fresh copy every time, so no learning rate starts from another's training.
    torch.manual_seed(SEED)
    if variant == "adapter":
        return with_adapter(base_model, width=ADAPTER_WIDTH)
    return copy.deepcopy(base_model)


def trained_parameter_count(model: torch.nn.Module) -> int:
    return sum(parameter.numel() for parameter in model.parameters() if parameter.requires_grad)


def game_count(positions: list[Position]) -> int:
    return len({position.game_id for position in positions})


def check_against_engine(report: MoveMatchingReport) -> dict:
    """Sets the PyTorch Baseline's counts beside the ones the engine recorded with the ONNX file."""
    recorded = json.loads(ENGINE_BASELINE_PATH.read_text(encoding="utf-8"))["baseModelAlone"]
    pytorch_counts = {"overall": report.overall.matched, "afterPly10": report.after_ply_10.matched}
    engine_counts = {"overall": recorded["overall"]["matched"], "afterPly10": recorded["afterPly10"]["matched"]}
    for phase in PHASES:
        pytorch_counts[phase] = report.by_phase[phase].matched
        engine_counts[phase] = recorded["byPhase"][phase]["matched"]
    return {"pytorch": pytorch_counts, "engine": engine_counts, "identical": pytorch_counts == engine_counts}


def score_as_json(score: MoveMatchingScore) -> dict:
    return {
        "matched": score.matched,
        "positions": score.positions,
        "games": score.games,
        "standardError": score.standard_error,
    }


def report_as_json(report: MoveMatchingReport) -> dict:
    return {
        "overall": score_as_json(report.overall),
        "afterPly10": score_as_json(report.after_ply_10),
        "byPhase": {phase: score_as_json(report.by_phase[phase]) for phase in PHASES},
    }


def comparison_as_json(comparison: BaselineComparison) -> dict:
    return {
        "overall": asdict(comparison.overall),
        "afterPly10": asdict(comparison.after_ply_10),
        "byPhase": {phase: asdict(comparison.by_phase[phase]) for phase in PHASES},
    }


def train_variant(
    base_model: torch.nn.Module, variant: str, training: list[Position], validation: list[Position]
) -> tuple[torch.nn.Module, dict]:
    """Trains a variant at every learning rate of its grid and keeps the one validation prefers."""
    grid = VARIANTS[variant]
    runs = []
    models = []
    for learning_rate in grid["learning_rates"]:
        model = build_variant(base_model, variant)
        settings = TrainingSettings(
            learning_rate=learning_rate, epochs=grid["epochs"], batch_size=BATCH_SIZE, rating=RATING, seed=SEED
        )
        progress(f"{variant}: learning rate {learning_rate:g}, {trained_parameter_count(model):,} weights trained")

        def report_epoch(epoch: int, validation_score: float) -> None:
            progress(f"{variant}: learning rate {learning_rate:g}, epoch {epoch}: validation {100 * validation_score:.2f}%")

        run = fine_tune(model, training, validation, settings, report_epoch=report_epoch)
        runs.append(
            {
                "learningRate": learning_rate,
                "validationAfterPly10ByEpoch": run.validation_by_epoch,
                "bestEpoch": run.best_epoch,
            }
        )
        models.append(model)

    best_scores = [run["validationAfterPly10ByEpoch"][run["bestEpoch"]] for run in runs]
    chosen = best_scores.index(max(best_scores))
    chosen_model = models[chosen]
    summary = {
        "trainedParameters": trained_parameter_count(chosen_model),
        "runs": runs,
        "chosenLearningRate": runs[chosen]["learningRate"],
        "chosenEpoch": runs[chosen]["bestEpoch"],
    }
    return chosen_model, summary


def measure(dataset_dir: Path, device: str) -> dict:
    dataset = read_dataset(dataset_dir)
    training, validation = split_validation(dataset.train, VALIDATION_FRACTION)
    test_fens = [position.fen for position in dataset.test]

    base_model = load_reference().to(device)
    progress(f"Baseline: playing {len(dataset.test):,} Test Set positions on {device}")
    baseline_moves = top_moves(base_model, test_fens, RATING)
    baseline_report = move_matching_report(dataset.test, baseline_moves)
    engine_check = check_against_engine(baseline_report)
    if not engine_check["identical"]:
        progress(f"Warning: the PyTorch Baseline differs from the engine's: {engine_check}")

    validation_moves = top_moves(base_model, [position.fen for position in validation], RATING)
    validation_baseline = move_matching_report(validation, validation_moves).after_ply_10

    variants = {}
    FINE_TUNED_DIR.mkdir(parents=True, exist_ok=True)
    for variant in VARIANTS:
        model, summary = train_variant(base_model, variant, training, validation)
        torch.save(model.state_dict(), FINE_TUNED_DIR / f"maia3-5m-{variant}.pt")

        progress(f"{variant}: playing the Test Set")
        moves = top_moves(model, test_fens, RATING)
        comparison = compare_with_baseline(dataset.test, baseline_moves, moves)
        summary["parametersPerTrainingPosition"] = summary["trainedParameters"] / len(training)
        summary["testSet"] = report_as_json(move_matching_report(dataset.test, moves))
        summary["gainOverBaseline"] = comparison_as_json(comparison)
        summary["beatsBaseline"] = beats_baseline(comparison)
        variants[variant] = summary

    return {
        "formatVersion": FORMAT_VERSION,
        "measuredOn": date.today().isoformat(),
        "runtime": f"PyTorch {torch.__version__} on {device}",
        "baseModel": "maia3-5m",
        "rating": RATING,
        "baseModelParameters": sum(parameter.numel() for parameter in base_model.parameters()),
        "training": {"positions": len(training), "games": game_count(training)},
        "validation": {
            "positions": len(validation),
            "games": game_count(validation),
            "baselineAfterPly10": score_as_json(validation_baseline),
        },
        "batchSize": BATCH_SIZE,
        "adapterWidth": ADAPTER_WIDTH,
        "baseline": report_as_json(baseline_report),
        "baselineCheckedAgainstEngine": engine_check,
        "variants": variants,
    }


def percent(score: dict) -> str:
    return f"{100 * score['matched'] / score['positions']:.2f} ± {100 * score['standardError']:.2f}"


def points(difference: dict) -> str:
    return f"{100 * difference['difference']:+.2f} ± {100 * difference['standard_error']:.2f}"


def print_tables(results: dict) -> None:
    slices = [("Opening (1-10)", "opening"), ("Middlegame (11-30)", "middlegame"), ("Endgame (31+)", "endgame")]

    print("Move-Matching on the Test Set, in percent, ± one standard error clustered by game.\n")
    print("| Model | " + " | ".join(label for label, _ in slices) + " | After ply 10 | All |")
    print("|---|" + "---|" * (len(slices) + 2))
    rows = [("Baseline", results["baseline"])]
    for variant, summary in results["variants"].items():
        rows.append((f"Fine-tuned, {variant}", summary["testSet"]))
    for label, report in rows:
        cells = [percent(report["byPhase"][phase]) for _, phase in slices]
        cells.append(percent(report["afterPly10"]))
        cells.append(percent(report["overall"]))
        print(f"| {label} | " + " | ".join(cells) + " |")

    print("\nGain over the Baseline on the same positions, in percentage points, ± one standard error.\n")
    print("| Variant | " + " | ".join(label for label, _ in slices) + " | After ply 10 | All | Beats the Baseline |")
    print("|---|" + "---|" * (len(slices) + 3))
    for variant, summary in results["variants"].items():
        gain = summary["gainOverBaseline"]
        cells = [points(gain["byPhase"][phase]) for _, phase in slices]
        cells.append(points(gain["afterPly10"]))
        cells.append(points(gain["overall"]))
        cells.append("yes" if summary["beatsBaseline"] else "no")
        print(f"| {variant} | " + " | ".join(cells) + " |")

    print("\n| Variant | Weights trained | Per training position | Learning rate | Epoch |")
    print("|---|---|---|---|---|")
    for variant, summary in results["variants"].items():
        print(
            f"| {variant} | {summary['trainedParameters']:,} | {summary['parametersPerTrainingPosition']:.2f} "
            f"| {summary['chosenLearningRate']:g} | {summary['chosenEpoch']} |"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    default_device = "cuda" if torch.cuda.is_available() else "cpu"
    parser.add_argument("--device", default=default_device, help=f"where to run the network (default: {default_device})")
    arguments = parser.parse_args()

    results = measure(DATASET_DIR, arguments.device)
    RESULTS_PATH.write_text(json.dumps(results, indent=1) + "\n", encoding="utf-8")
    print_tables(results)
    progress(f"Written to {RESULTS_PATH}")
