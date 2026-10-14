import json
from dataclasses import asdict
from pathlib import Path

import pytest
from chess.engine import Cp

from pipeline.bot_losses import EVERY_MOVE
from pipeline.dataset import Position
from pipeline.measure_model_choice import extract, summary_table
from pipeline.stockfish_analysis import Analysis

START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"


class OnlyE4IsBestAnalyser:
    """Stands in for Stockfish: e2e4 is the best move everywhere, any other move loses a pawn.

    Except a2a3, played in a game already won by more than ten pawns: it gives
    up three, which the cap reads as nothing.
    """

    engine = "Fake engine"
    depth = 18

    def analyse(self, fen: str, move: str) -> Analysis:
        if move == "e2e4":
            return Analysis(best_move="e2e4", best=Cp(30), played=Cp(30))
        if move == "a2a3":
            return Analysis(best_move="e2e4", best=Cp(1500), played=Cp(1200))
        return Analysis(best_move="e2e4", best=Cp(30), played=Cp(-70))


def write_json_lines(rows: list[dict], path: Path) -> None:
    lines = [json.dumps(row) + "\n" for row in rows]
    path.write_text("".join(lines), encoding="utf-8")


def write_camille_s_games(dataset_dir: Path) -> None:
    """Two games of one move each: e2e4, which loses nothing, and d2d4, which loses a pawn."""
    training_move = Position(game_id="lichess:a", source="lichess", ply=1, phase="opening", fen=START, move="e2e4")
    test_set_move = Position(game_id="lichess:b", source="lichess", ply=1, phase="opening", fen=START, move="d2d4")
    write_json_lines([asdict(training_move)], dataset_dir / "train.jsonl")
    write_json_lines([asdict(test_set_move)], dataset_dir / "test.jsonl")


def bot_game(game_id: str, bot_move: str, ending: dict | None = None) -> dict:
    """A game in which the Bot, White, makes a single move. Only the ending says how it finished."""
    if ending is None:
        ending = {"kind": "checkmate", "winner": "black"}
    return {"game_id": game_id, "bot_colour": "white", "moves": [bot_move, "e7e5"], "ending": ending}


def test_sets_each_bot_s_losses_beside_camille_s_under_its_own_name(tmp_path):
    write_camille_s_games(tmp_path)
    # The original Bot plays like Camille: one game in two loses a pawn. The
    # fine-tuned Bot loses a pawn in both.
    runs = {"original": tmp_path / "original.jsonl", "fine-tuned": tmp_path / "fine-tuned.jsonl"}
    write_json_lines([bot_game("bot:13-0", "e2e4"), bot_game("bot:13-1", "f2f3")], runs["original"])
    write_json_lines([bot_game("bot:13-0", "f2f3"), bot_game("bot:13-1", "f2f3")], runs["fine-tuned"])
    results_path = tmp_path / "model-choice-losses.json"

    extract(tmp_path, runs, tmp_path / "cache.jsonl", results_path, [OnlyE4IsBestAnalyser()])

    written = json.loads(results_path.read_text(encoding="utf-8"))
    assert written["engine"] == "Fake engine"
    assert written["camille_test_set_from_training_games"] == 100
    assert written["bots"]["original"]["distance"] == 0
    assert written["bots"]["fine-tuned"]["distance"] == 50
    assert written["bots"]["fine-tuned"]["centipawn_loss"]["phases"]["opening"]["mean"] == 100


def test_sums_up_each_bot_s_distance_and_results_in_one_row(tmp_path):
    write_camille_s_games(tmp_path)
    runs = {"original": tmp_path / "original.jsonl"}
    write_json_lines([bot_game("bot:13-0", "f2f3")], runs["original"])

    results = extract(tmp_path, runs, tmp_path / "cache.jsonl", tmp_path / "out.json", [OnlyE4IsBestAnalyser()])
    table = summary_table(results).splitlines()

    assert table[0].startswith("| Bot | Games | Won, drawn, lost | Distance, every move | Distance, open positions |")
    assert table[2] == "| original | 1 | 0, 0, 1 | 50.0 | 50.0 | - |"


def test_compares_each_bot_on_open_positions_unless_told_to_read_every_move(tmp_path):
    # The Bot plays like Camille, plus a move in a game already won, which
    # the cap reads as losing nothing.
    write_camille_s_games(tmp_path)
    runs = {"original": tmp_path / "original.jsonl"}
    write_json_lines(
        [bot_game("bot:13-0", "e2e4"), bot_game("bot:13-1", "f2f3"), bot_game("bot:13-2", "a2a3")],
        runs["original"],
    )

    on_open_positions = extract(tmp_path, runs, tmp_path / "cache.jsonl", tmp_path / "open.json", [OnlyE4IsBestAnalyser()])
    on_every_move = extract(
        tmp_path, runs, tmp_path / "cache.jsonl", tmp_path / "every.json", [OnlyE4IsBestAnalyser()], yardstick=EVERY_MOVE
    )

    assert on_open_positions["yardstick"] == "open positions"
    assert on_open_positions["bots"]["original"]["distance"] == 0
    assert on_every_move["bots"]["original"]["distance"] == pytest.approx(100 / 6)
