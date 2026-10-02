"""Builds the dataset from every export in data/raw.

Run from the repository root:

    python -m pipeline.build_dataset

The raw exports are only read. The positions are written to data/dataset as
train.jsonl and test.jsonl, one JSON object per line, for the Python steps
and the TypeScript evaluation harness to read.
"""

import json
from dataclasses import asdict
from pathlib import Path

from pipeline.dataset import Dataset, Position, build_dataset

PLAYER = "punkycam"
TEST_FRACTION = 0.2

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPOSITORY_ROOT / "data" / "raw"
DATASET_DIR = REPOSITORY_ROOT / "data" / "dataset"


def build(raw_dir: Path, dataset_dir: Path, test_fraction: float) -> Dataset:
    pgn_paths = sorted(raw_dir.glob("*.pgn"))
    dataset = build_dataset(pgn_paths, player=PLAYER, test_fraction=test_fraction)

    dataset_dir.mkdir(parents=True, exist_ok=True)
    _write_json_lines(dataset.train, dataset_dir / "train.jsonl")
    _write_json_lines(dataset.test, dataset_dir / "test.jsonl")
    return dataset


def _write_json_lines(positions: list[Position], path: Path) -> None:
    with open(path, "w", encoding="utf-8") as output:
        for position in positions:
            line = json.dumps(asdict(position))
            output.write(line)
            output.write("\n")


def _print_summary(dataset: Dataset) -> None:
    all_positions = dataset.train + dataset.test
    rows = [("train", dataset.train), ("test", dataset.test), ("total", all_positions)]
    for name, positions in rows:
        game_count = len({position.game_id for position in positions})
        print(f"{name:>5}: {game_count:>5} games, {len(positions):>6} of {PLAYER}'s moves")


if __name__ == "__main__":
    built = build(RAW_DIR, DATASET_DIR, TEST_FRACTION)
    _print_summary(built)
