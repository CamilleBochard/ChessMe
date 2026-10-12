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
import math
import sys
from dataclasses import dataclass
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
    Gain,
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

# The Base Model's rating, Camille's Maia-Equivalent Rating as the sweep measured it (docs/experiments/base-model-sweep.md).
RATING = 1100

# A tenth of the training games judges each epoch and learning rate.
VALIDATION_FRACTION = 0.1

# The adapter squeezes each square's 256 numbers through this many.
ADAPTER_WIDTH = 16

# Positions per training step: about 330 steps per epoch over the training games.
TRAINING_BATCH_SIZE = 64

SEED = 0


@dataclass(frozen=True)
class LearningRateGrid:
    learning_rates: list[float]
    # Each learning rate trains for this many epochs, of which validation keeps one.
    epochs: int


# Each grid spans two orders of magnitude around the rates usually used for
# its kind of training: small for weights that already encode millions of
# games, larger for an adapter that starts from nothing.
GRIDS = {
    "full": LearningRateGrid(learning_rates=[1e-6, 1e-5, 1e-4], epochs=4),
    "adapter": LearningRateGrid(learning_rates=[1e-4, 1e-3, 1e-2], epochs=6),
}

PHASE_COLUMNS = "| Opening (1-10) | Middlegame (11-30) | Endgame (31+) | After ply 10 | All |"


def progress(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def build_variant(base_model: torch.nn.Module, variant: str) -> torch.nn.Module:
    """A fresh copy of the Base Model for every learning rate, so none starts from another's training."""
    # Seeded, so the adapter's first layer starts from the same weights each time.
    torch.manual_seed(SEED)
    if variant == "adapter":
        return with_adapter(base_model, width=ADAPTER_WIDTH)
    return copy.deepcopy(base_model)


def trained_parameter_count(model: torch.nn.Module) -> int:
    return sum(parameter.numel() for parameter in model.parameters() if parameter.requires_grad)


def game_count(positions: list[Position]) -> int:
    return len({position.game_id for position in positions})


def check_against_engine(report: MoveMatchingReport) -> dict:
    """Sets the PyTorch Baseline's figures beside the ones the engine recorded with the ONNX file.

    Matching counts and matching clustered errors in every slice mean the two
    played Camille's move in the same number of positions of every game.
    """
    recorded_file = json.loads(ENGINE_BASELINE_PATH.read_text(encoding="utf-8"))
    recorded = recorded_file["baseModelAlone"]
    pytorch_scores = {"overall": report.overall, "afterPly10": report.after_ply_10}
    engine_scores = {"overall": recorded["overall"], "afterPly10": recorded["afterPly10"]}
    for phase in PHASES:
        pytorch_scores[phase] = report.by_phase[phase]
        engine_scores[phase] = recorded["byPhase"][phase]

    slices = {}
    identical = True
    for name, pytorch_score in pytorch_scores.items():
        engine_score = engine_scores[name]
        same_count = pytorch_score.matched == engine_score["matched"]
        same_error = math.isclose(pytorch_score.standard_error, engine_score["standardError"], rel_tol=1e-9)
        if not (same_count and same_error):
            identical = False
        slices[name] = {
            "pytorch": {"matched": pytorch_score.matched, "standardError": pytorch_score.standard_error},
            "engine": {"matched": engine_score["matched"], "standardError": engine_score["standardError"]},
        }
    return {"slices": slices, "identical": identical}


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


def gain_as_json(gain: Gain) -> dict:
    return {"gain": gain.gain, "standardError": gain.standard_error}


def comparison_as_json(comparison: BaselineComparison) -> dict:
    return {
        "overall": gain_as_json(comparison.overall),
        "afterPly10": gain_as_json(comparison.after_ply_10),
        "byPhase": {phase: gain_as_json(comparison.by_phase[phase]) for phase in PHASES},
    }


def train_variant(
    base_model: torch.nn.Module, variant: str, training: list[Position], validation: list[Position]
) -> tuple[torch.nn.Module, dict]:
    """Trains a variant at every learning rate of its grid and keeps the one validation prefers."""
    grid = GRIDS[variant]
    chosen_model = None
    chosen_run = None
    chosen_learning_rate = None
    runs_as_json = []
    for learning_rate in grid.learning_rates:
        model = build_variant(base_model, variant)
        settings = TrainingSettings(
            learning_rate=learning_rate,
            epochs=grid.epochs,
            batch_size=TRAINING_BATCH_SIZE,
            rating=RATING,
            seed=SEED,
        )
        weights_trained = trained_parameter_count(model)
        progress(f"{variant}: learning rate {learning_rate:g}, {weights_trained:,} weights trained")

        def report_epoch(epoch: int, validation_score: float) -> None:
            progress(f"{variant}: learning rate {learning_rate:g}, epoch {epoch}: validation {100 * validation_score:.2f}%")

        run = fine_tune(model, training, validation, settings, report_epoch=report_epoch)
        runs_as_json.append(
            {
                "learningRate": learning_rate,
                "validationAfterPly10ByEpoch": run.validation_by_epoch,
                "bestEpoch": run.best_epoch,
            }
        )
        best_score = run.validation_by_epoch[run.best_epoch]
        if chosen_run is None or best_score > chosen_run.validation_by_epoch[chosen_run.best_epoch]:
            chosen_model = model
            chosen_run = run
            chosen_learning_rate = learning_rate

    summary = {
        "trainedParameters": trained_parameter_count(chosen_model),
        "runs": runs_as_json,
        "chosenLearningRate": chosen_learning_rate,
        "chosenEpoch": chosen_run.best_epoch,
    }
    return chosen_model, summary


def measure(dataset_dir: Path, device: str) -> dict:
    dataset = read_dataset(dataset_dir)
    training, validation = split_validation(dataset.train, VALIDATION_FRACTION)
    test_fens = [position.fen for position in dataset.test]
    validation_fens = [position.fen for position in validation]

    base_model = load_reference().to(device)
    progress(f"Baseline: playing {len(dataset.test):,} Test Set positions on {device}")
    baseline_moves = top_moves(base_model, test_fens, RATING)
    baseline_report = move_matching_report(dataset.test, baseline_moves)
    engine_check = check_against_engine(baseline_report)
    if not engine_check["identical"]:
        progress(f"Warning: the PyTorch Baseline differs from the engine's: {engine_check}")

    validation_moves = top_moves(base_model, validation_fens, RATING)
    validation_baseline = move_matching_report(validation, validation_moves).after_ply_10

    variants = {}
    FINE_TUNED_DIR.mkdir(parents=True, exist_ok=True)
    for variant in GRIDS:
        model, summary = train_variant(base_model, variant, training, validation)
        torch.save(model.state_dict(), FINE_TUNED_DIR / f"maia3-5m-{variant}.pt")

        progress(f"{variant}: playing the Test Set")
        moves = top_moves(model, test_fens, RATING)
        report = move_matching_report(dataset.test, moves)
        comparison = compare_with_baseline(dataset.test, baseline_moves, moves)
        summary["parametersPerTrainingPosition"] = summary["trainedParameters"] / len(training)
        summary["testSet"] = report_as_json(report)
        summary["gainOverBaseline"] = comparison_as_json(comparison)
        summary["beatsBaseline"] = beats_baseline(comparison)
        variants[variant] = summary

    base_model_parameters = sum(parameter.numel() for parameter in base_model.parameters())
    return {
        "formatVersion": FORMAT_VERSION,
        "measuredOn": date.today().isoformat(),
        "runtime": f"PyTorch {torch.__version__} on {device}",
        "baseModel": "maia3-5m",
        "rating": RATING,
        "baseModelParameters": base_model_parameters,
        "training": {"positions": len(training), "games": game_count(training)},
        "validation": {
            "positions": len(validation),
            "games": game_count(validation),
            "baselineAfterPly10": score_as_json(validation_baseline),
        },
        "batchSize": TRAINING_BATCH_SIZE,
        "adapterWidth": ADAPTER_WIDTH,
        "baseline": report_as_json(baseline_report),
        "baselineCheckedAgainstEngine": engine_check,
        "variants": variants,
    }


def percent(score: dict) -> str:
    share = score["matched"] / score["positions"]
    return f"{100 * share:.2f} ± {100 * score['standardError']:.2f}"


def points(gain: dict) -> str:
    return f"{100 * gain['gain']:+.2f} ± {100 * gain['standardError']:.2f}"


def phase_cells(by_slice: dict, format_cell) -> str:
    """One table row's cells in PHASE_COLUMNS order."""
    cells = []
    for phase in PHASES:
        cells.append(format_cell(by_slice["byPhase"][phase]))
    cells.append(format_cell(by_slice["afterPly10"]))
    cells.append(format_cell(by_slice["overall"]))
    return " | ".join(cells)


def print_tables(results: dict) -> None:
    print("Move-Matching on the Test Set, in percent, ± one standard error clustered by game.\n")
    print(f"| Model {PHASE_COLUMNS}")
    print("|---|---|---|---|---|---|")
    print(f"| Baseline | {phase_cells(results['baseline'], percent)} |")
    for variant, summary in results["variants"].items():
        print(f"| Fine-tuned, {variant} | {phase_cells(summary['testSet'], percent)} |")

    print("\nGain over the Baseline on the same positions, in percentage points, ± one standard error.\n")
    print(f"| Variant {PHASE_COLUMNS} Beats the Baseline |")
    print("|---|---|---|---|---|---|---|")
    for variant, summary in results["variants"].items():
        if summary["beatsBaseline"]:
            verdict = "yes"
        else:
            verdict = "no"
        print(f"| {variant} | {phase_cells(summary['gainOverBaseline'], points)} | {verdict} |")

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
