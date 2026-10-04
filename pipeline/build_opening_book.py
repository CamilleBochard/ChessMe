"""Builds the Opening Book from the dataset in data/dataset.

Run from the repository root, after pipeline.build_dataset:

    python -m pipeline.build_opening_book [--min-occurrences 3]

Only the training games feed the book; the Test Set is read so that the
builder, not the caller, is what keeps it out. The book is written to
data/dataset/opening-book.json for the Move-Selection Engine to read.
"""

import argparse
import json
from pathlib import Path

from pipeline.dataset import read_dataset
from pipeline.opening_book import build_opening_book

# A position must have been reached at least this many times, so a position
# met in only one or two games never enters the book. The book then plays
# the most played reply, which need not be a majority of the visits.
DEFAULT_MIN_OCCURRENCES = 3

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
DATASET_DIR = REPOSITORY_ROOT / "data" / "dataset"
BOOK_PATH = DATASET_DIR / "opening-book.json"


def build(dataset_dir: Path, book_path: Path, min_occurrences: int) -> dict[str, str]:
    dataset = read_dataset(dataset_dir)
    book = build_opening_book(dataset, min_occurrences=min_occurrences)

    written = {"min_occurrences": min_occurrences, "positions": book}
    book_path.write_text(json.dumps(written, indent=1), encoding="utf-8")
    return book


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build the Opening Book from the training games.")
    parser.add_argument(
        "--min-occurrences",
        type=int,
        default=DEFAULT_MIN_OCCURRENCES,
        help=f"times a position must have been reached to enter the book (default {DEFAULT_MIN_OCCURRENCES})",
    )
    arguments = parser.parse_args()

    built = build(DATASET_DIR, BOOK_PATH, arguments.min_occurrences)
    print(f"{len(built)} positions reached at least {arguments.min_occurrences} times, written to {BOOK_PATH}")
