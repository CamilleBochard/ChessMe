import json
from dataclasses import asdict
from pathlib import Path

from chess.engine import Cp

from pipeline.dataset import Position
from pipeline.extract_blunder_profile import extract
from pipeline.stockfish_analysis import Analysis

START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
AFTER_E4_E5_NF3 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"


class LosingAPawnAnalyser:
    """Stands in for Stockfish: every move it is shown loses exactly one pawn."""

    engine = "Fake engine"
    depth = 18

    def analyse(self, fen: str, move: str) -> Analysis:
        return Analysis(best_move="e2e4", best=Cp(30), played=Cp(-70))


def write_json_lines(positions: list[Position], path: Path) -> None:
    lines = [json.dumps(asdict(position)) + "\n" for position in positions]
    path.write_text("".join(lines), encoding="utf-8")


def test_writes_the_profile_with_its_depth_and_each_move_s_loss_with_its_phase(tmp_path):
    training_move = Position(game_id="lichess:a", source="lichess", ply=1, phase="opening", fen=START, move="d2d4")
    test_set_move = Position(
        game_id="lichess:b", source="lichess", ply=12, phase="middlegame", fen=AFTER_E4_E5_NF3, move="f7f6"
    )
    write_json_lines([training_move], tmp_path / "train.jsonl")
    write_json_lines([test_set_move], tmp_path / "test.jsonl")
    profile_path = tmp_path / "blunder-profile.json"
    losses_path = tmp_path / "centipawn-losses.jsonl"

    extract(tmp_path, tmp_path / "cache.jsonl", profile_path, losses_path, [LosingAPawnAnalyser()])

    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    assert profile["format_version"] == 1
    assert profile["engine"] == "Fake engine"
    assert profile["depth"] == 18
    assert profile["phases"]["opening"]["mean"] == 100
    assert profile["phases"]["middlegame"]["mean"] == 100
    written_losses = [json.loads(line) for line in losses_path.read_text(encoding="utf-8").splitlines()]
    assert written_losses == [
        {"game_id": "lichess:a", "ply": 1, "phase": "opening", "centipawn_loss": 100},
        {"game_id": "lichess:b", "ply": 12, "phase": "middlegame", "centipawn_loss": 100},
    ]
