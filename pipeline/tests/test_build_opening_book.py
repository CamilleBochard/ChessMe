import json
from dataclasses import asdict
from pathlib import Path

from pipeline.build_opening_book import build
from pipeline.dataset import Position

START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"


def write_json_lines(positions: list[Position], path: Path) -> None:
    lines = [json.dumps(asdict(position)) + "\n" for position in positions]
    path.write_text("".join(lines), encoding="utf-8")


def opening_move(game_id: str, move: str) -> Position:
    return Position(game_id=game_id, source="lichess", ply=1, phase="opening", fen=START, move=move)


def test_writes_the_book_built_from_the_dataset_files_as_json(tmp_path):
    write_json_lines([opening_move("lichess:a", "e2e4"), opening_move("lichess:b", "e2e4")], tmp_path / "train.jsonl")
    write_json_lines([opening_move("lichess:c", "d2d4")], tmp_path / "test.jsonl")
    book_path = tmp_path / "opening-book.json"

    build(tmp_path, book_path, min_occurrences=2)

    written = json.loads(book_path.read_text(encoding="utf-8"))
    assert written == {
        "min_occurrences": 2,
        "positions": {"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": "e2e4"},
    }
