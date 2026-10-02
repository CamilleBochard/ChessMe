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

from pipeline.dataset import Position, build_dataset

PLAYER = "punkycam"
TEST_FRACTION = 0.2

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPOSITORY_ROOT / "data" / "raw"
DATASET_DIR = REPOSITORY_ROOT / "data" / "dataset"


def build(raw_dir: Path, dataset_dir: Path, test_fraction: float) -> None:
    pgn_paths = sorted(raw_dir.glob("*.pgn"))
    dataset = build_dataset(pgn_paths, player=PLAYER, test_fraction=test_fraction)

    dataset_dir.mkdir(parents=True, exist_ok=True)
    _write_json_lines(dataset.train, dataset_dir / "train.jsonl")
    _write_json_lines(dataset.test, dataset_dir / "test.jsonl")


def _write_json_lines(positions: list[Position], path: Path) -> None:
    with open(path, "w", encoding="utf-8") as output:
        for position in positions:
            output.write(json.dumps(asdict(position)) + "\n")


if __name__ == "__main__":
    build(RAW_DIR, DATASET_DIR, TEST_FRACTION)
