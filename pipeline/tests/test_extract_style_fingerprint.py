import json
from dataclasses import asdict
from pathlib import Path

from chess.engine import Cp

from pipeline.dataset import Position
from pipeline.extract_style_fingerprint import extract, side_by_side_table
from pipeline.stockfish_analysis import Analysis

START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"


class LosingAPawnAnalyser:
    """Stands in for Stockfish: every move it is shown loses exactly one pawn."""

    engine = "Fake engine"
    depth = 18

    def analyse(self, fen: str, move: str) -> Analysis:
        return Analysis(best_move="e2e4", best=Cp(30), played=Cp(-70))


def write_json_lines(rows: list[dict], path: Path) -> None:
    lines = [json.dumps(row) + "\n" for row in rows]
    path.write_text("".join(lines), encoding="utf-8")


def test_writes_camille_s_fingerprint_and_the_bot_s_side_by_side_measured_the_same_way(tmp_path):
    camille_move = Position(game_id="lichess:a", source="lichess", ply=1, phase="opening", fen=START, move="e2e4")
    camille_test_set_move = Position(game_id="lichess:b", source="lichess", ply=1, phase="opening", fen=START, move="d2d4")
    write_json_lines([asdict(camille_move)], tmp_path / "train.jsonl")
    write_json_lines([asdict(camille_test_set_move)], tmp_path / "test.jsonl")
    bot_games_path = tmp_path / "bot-games.jsonl"
    bot_game = {"game_id": "bot:1", "bot_colour": "white", "moves": ["g1f3", "g8f6"]}
    write_json_lines([bot_game], bot_games_path)
    fingerprint_path = tmp_path / "style-fingerprint.json"

    extract(tmp_path, bot_games_path, tmp_path / "cache.jsonl", fingerprint_path, [LosingAPawnAnalyser()])

    written = json.loads(fingerprint_path.read_text(encoding="utf-8"))
    assert written["format_version"] == 1
    assert written["engine"] == "Fake engine"
    assert written["depth"] == 18
    assert written["camille"]["games"] == 2
    assert written["camille"]["piece_share"]["all_phases"]["pawn"] == 1
    assert written["bot"]["piece_share"]["all_phases"]["knight"] == 1
    assert written["camille"]["centipawn_loss"]["all_phases"]["mean"] == 100
    assert written["bot"]["centipawn_loss"]["all_phases"]["moves"] == 1


def test_also_measures_camille_s_training_games_and_test_set_apart_to_show_the_noise(tmp_path):
    training_move = Position(game_id="lichess:a", source="lichess", ply=1, phase="opening", fen=START, move="e2e4")
    test_set_move = Position(game_id="lichess:b", source="lichess", ply=1, phase="opening", fen=START, move="g1f3")
    write_json_lines([asdict(training_move)], tmp_path / "train.jsonl")
    write_json_lines([asdict(test_set_move)], tmp_path / "test.jsonl")
    bot_games_path = tmp_path / "bot-games.jsonl"
    write_json_lines([{"game_id": "bot:1", "bot_colour": "white", "moves": ["e2e4"]}], bot_games_path)
    fingerprint_path = tmp_path / "style-fingerprint.json"

    extract(tmp_path, bot_games_path, tmp_path / "cache.jsonl", fingerprint_path, [LosingAPawnAnalyser()])

    written = json.loads(fingerprint_path.read_text(encoding="utf-8"))
    assert written["camille_training_games"]["piece_share"]["all_phases"]["pawn"] == 1
    assert written["camille_test_set"]["piece_share"]["all_phases"]["knight"] == 1


def test_sets_the_fingerprints_side_by_side_in_one_table_row_per_statistic(tmp_path):
    camille_move = Position(game_id="lichess:a", source="lichess", ply=1, phase="opening", fen=START, move="e2e4")
    write_json_lines([asdict(camille_move)], tmp_path / "train.jsonl")
    write_json_lines([asdict(camille_move)], tmp_path / "test.jsonl")
    bot_games_path = tmp_path / "bot-games.jsonl"
    write_json_lines([{"game_id": "bot:1", "bot_colour": "white", "moves": ["g1f3"]}], bot_games_path)

    fingerprints = extract(
        tmp_path, bot_games_path, tmp_path / "cache.jsonl", tmp_path / "out.json", [LosingAPawnAnalyser()]
    )
    table = side_by_side_table(fingerprints).splitlines()

    assert table[0] == "| Statistic | Camille | Bot | Camille, training games | Camille, Test Set |"
    assert "| Moves made by a knight, Opening (1-10) | 0.0% | 100.0% | 0.0% | 0.0% |" in table
    assert "| Moves losing 300 or more, Opening (1-10) | 0.0% | 0.0% | 0.0% | 0.0% |" in table
    assert "| Mean centipawn loss, Middlegame (11-30) | - | - | - | - |" in table
    assert "| Never castled | 100.0% | 100.0% | 100.0% | 100.0% |" in table
