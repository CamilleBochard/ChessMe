import json
import shutil
from pathlib import Path

from pipeline.build_player_positions import build

FIXTURES = Path(__file__).parent / "fixtures"


def test_writes_the_positions_of_the_kept_games_as_a_json_list(tmp_path):
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    for fixture in FIXTURES.glob("*.pgn"):
        shutil.copy(fixture, raw_dir / fixture.name)
    positions_path = tmp_path / "camille-positions.json"

    build(raw_dir, positions_path)

    positions = json.loads(positions_path.read_text(encoding="utf-8"))
    assert len(positions) > 0
    assert positions == sorted(set(positions))
    assert all(len(position.split(" ")) == 3 for position in positions)
