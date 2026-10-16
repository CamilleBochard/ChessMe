import json
import shutil
from pathlib import Path

from pipeline.build_player_record import build

FIXTURES = Path(__file__).parent / "fixtures"


def test_writes_the_record_of_the_kept_games_with_openings_named_from_the_table(tmp_path):
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    for fixture in FIXTURES.glob("*.pgn"):
        shutil.copy(fixture, raw_dir / fixture.name)
    # The table as Lichess publishes it: one tab-separated file per ECO letter.
    openings_dir = tmp_path / "openings"
    openings_dir.mkdir()
    (openings_dir / "b.tsv").write_text("eco\tname\tpgn\nB20\tSicilian Defense\t1. e4 c5\n", encoding="utf-8")
    (openings_dir / "d.tsv").write_text(
        "eco\tname\tpgn\nD30\tQueen's Gambit Declined\t1. d4 d5 2. c4 e6\n", encoding="utf-8"
    )
    record_path = tmp_path / "player-record.json"

    build(raw_dir, openings_dir, record_path)

    record = json.loads(record_path.read_text(encoding="utf-8"))
    assert record["games"] == 6
    assert record["white"]["games"] == 2
    assert [opening["name"] for opening in record["black"]["openings"]] == [
        "Sicilian Defense",
        "Queen's Gambit Declined",
    ]
