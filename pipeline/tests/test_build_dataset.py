import json
import shutil
from pathlib import Path

from pipeline.build_dataset import build

FIXTURES = Path(__file__).parent / "fixtures"


def copy_fixtures_to(raw_dir: Path) -> None:
    raw_dir.mkdir()
    for fixture in FIXTURES.glob("*.pgn"):
        shutil.copy(fixture, raw_dir / fixture.name)


def read_json_lines(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def test_writes_each_position_as_one_json_line(tmp_path):
    raw_dir = tmp_path / "raw"
    copy_fixtures_to(raw_dir)

    build(raw_dir, tmp_path / "dataset", test_fraction=0)

    train = read_json_lines(tmp_path / "dataset" / "train.jsonl")
    assert {
        "game_id": "lichess:abcd1234",
        "source": "lichess",
        "ply": 2,
        "phase": "opening",
        "fen": "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1",
        "move": "d7d5",
    } in train


def test_leaves_the_raw_exports_untouched(tmp_path):
    raw_dir = tmp_path / "raw"
    copy_fixtures_to(raw_dir)
    before = {path.name: path.read_bytes() for path in raw_dir.iterdir()}

    build(raw_dir, tmp_path / "dataset", test_fraction=0.5)

    after = {path.name: path.read_bytes() for path in raw_dir.iterdir()}
    assert after == before
