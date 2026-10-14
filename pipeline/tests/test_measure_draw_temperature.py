import json
from dataclasses import asdict
from pathlib import Path

import pytest
from chess.engine import Cp

from pipeline.dataset import Position
from pipeline.bot_losses import EVERY_MOVE
from pipeline.measure_draw_temperature import extract, loss_tables, phase_distance_table, summary_table
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


def test_sets_the_bot_s_losses_at_each_temperature_beside_camille_s_with_their_distance(tmp_path):
    write_camille_s_games(tmp_path)
    # At 1 the Bot plays like Camille: one game in two loses a pawn on its
    # first move. At 1.25 it loses a pawn in both.
    runs = {1: tmp_path / "temperature-1.jsonl", 1.25: tmp_path / "temperature-1.25.jsonl"}
    write_json_lines([bot_game("bot:13-0", "e2e4"), bot_game("bot:13-1", "f2f3")], runs[1])
    write_json_lines([bot_game("bot:13-0", "f2f3"), bot_game("bot:13-1", "f2f3")], runs[1.25])
    results_path = tmp_path / "draw-temperature.json"

    extract(tmp_path, runs, tmp_path / "cache.jsonl", results_path, [OnlyE4IsBestAnalyser()])

    written = json.loads(results_path.read_text(encoding="utf-8"))
    assert written["format_version"] == 2
    assert written["engine"] == "Fake engine"
    assert written["depth"] == 18
    assert written["camille"]["centipawn_loss"]["phases"]["opening"]["mean"] == 50
    at_1 = written["temperatures"]["1"]
    assert at_1["games"] == 2
    assert at_1["centipawn_loss"]["phases"]["opening"]["mean"] == 50
    assert at_1["distance"] == 0
    assert written["temperatures"]["1.25"]["distance"] == 50


def test_says_what_the_rule_makes_of_the_temperatures_measured_so_far(tmp_path):
    write_camille_s_games(tmp_path)
    runs = {1.0: tmp_path / "temperature-1.jsonl"}
    write_json_lines([bot_game("bot:13-0", "e2e4"), bot_game("bot:13-1", "f2f3")], runs[1.0])
    results_path = tmp_path / "draw-temperature.json"

    extract(tmp_path, runs, tmp_path / "cache.jsonl", results_path, [OnlyE4IsBestAnalyser()])

    written = json.loads(results_path.read_text(encoding="utf-8"))
    assert written["next_step"] == {"measure": 0.75, "chosen": None}


def test_measures_how_far_camille_s_training_games_are_from_his_test_set_as_the_noise_yardstick(tmp_path):
    # His training game's move loses nothing, his Test Set's loses a pawn.
    write_camille_s_games(tmp_path)
    runs = {1: tmp_path / "temperature-1.jsonl"}
    write_json_lines([bot_game("bot:13-0", "e2e4")], runs[1])
    results_path = tmp_path / "draw-temperature.json"

    extract(tmp_path, runs, tmp_path / "cache.jsonl", results_path, [OnlyE4IsBestAnalyser()])

    written = json.loads(results_path.read_text(encoding="utf-8"))
    assert written["camille_test_set_from_training_games"] == 100


def test_counts_the_bot_s_wins_draws_and_losses_at_each_temperature(tmp_path):
    write_camille_s_games(tmp_path)
    runs = {1: tmp_path / "temperature-1.jsonl"}
    won = {"kind": "checkmate", "winner": "white"}
    lost = {"kind": "checkmate", "winner": "black"}
    drawn = {"kind": "stalemate"}
    write_json_lines(
        [bot_game("bot:13-0", "e2e4", won), bot_game("bot:13-1", "e2e4", drawn), bot_game("bot:13-2", "e2e4", lost)],
        runs[1],
    )
    results_path = tmp_path / "draw-temperature.json"

    extract(tmp_path, runs, tmp_path / "cache.jsonl", results_path, [OnlyE4IsBestAnalyser()])

    written = json.loads(results_path.read_text(encoding="utf-8"))
    assert written["temperatures"]["1"]["results"] == {"won": 1, "drawn": 1, "lost": 1}


def test_reports_the_distance_on_every_move_beside_the_one_on_open_positions(tmp_path):
    # Camille loses nothing on one move and a pawn on the other. The Bot does
    # the same, plus a third move in a position already won, which the cap
    # reads as losing nothing.
    write_camille_s_games(tmp_path)
    runs = {1: tmp_path / "temperature-1.jsonl"}
    write_json_lines(
        [bot_game("bot:13-0", "e2e4"), bot_game("bot:13-1", "f2f3"), bot_game("bot:13-2", "a2a3")],
        runs[1],
    )
    results_path = tmp_path / "draw-temperature.json"

    extract(tmp_path, runs, tmp_path / "cache.jsonl", results_path, [OnlyE4IsBestAnalyser()])

    written = json.loads(results_path.read_text(encoding="utf-8"))
    at_1 = written["temperatures"]["1"]
    assert at_1["distance_on_every_move"] == pytest.approx(100 / 6)
    assert at_1["share_left_out"]["opening"] == pytest.approx(1 / 3)
    assert at_1["distance_in_open_positions"] == 0
    assert written["camille"]["share_left_out"]["opening"] == 0


def test_breaks_the_distance_down_by_phase_and_describes_the_losses_in_open_positions(tmp_path):
    write_camille_s_games(tmp_path)
    runs = {1: tmp_path / "temperature-1.jsonl"}
    write_json_lines(
        [bot_game("bot:13-0", "e2e4"), bot_game("bot:13-1", "f2f3"), bot_game("bot:13-2", "a2a3")],
        runs[1],
    )
    results_path = tmp_path / "draw-temperature.json"

    extract(tmp_path, runs, tmp_path / "cache.jsonl", results_path, [OnlyE4IsBestAnalyser()])

    written = json.loads(results_path.read_text(encoding="utf-8"))
    at_1 = written["temperatures"]["1"]
    assert at_1["phase_distances_on_every_move"]["opening"] == pytest.approx(100 / 6)
    assert at_1["phase_distances_on_every_move"]["middlegame"] is None
    assert at_1["phase_distances_in_open_positions"]["opening"] == 0
    assert at_1["centipawn_loss_in_open_positions"]["phases"]["opening"]["moves"] == 2
    assert written["camille"]["centipawn_loss_in_open_positions"]["phases"]["opening"]["mean"] == 50


def test_sets_each_temperature_s_losses_under_camille_s_in_one_table_per_phase(tmp_path):
    write_camille_s_games(tmp_path)
    runs = {1: tmp_path / "temperature-1.jsonl"}
    write_json_lines([bot_game("bot:13-0", "f2f3")], runs[1])

    results = extract(tmp_path, runs, tmp_path / "cache.jsonl", tmp_path / "out.json", [OnlyE4IsBestAnalyser()])
    table = loss_tables(results).splitlines()

    assert table[0] == "Opening (1-10)"
    assert table[2] == (
        "| Player | Moves | Mean | p50 | p75 | p90 | p95 | p99 | 50 or more | 100 or more | 300 or more |"
    )
    assert table[4] == "| Camille | 2 | 50.0 | 0 | 100 | 100 | 100 | 100 | 50.0% | 50.0% | 0.0% |"
    assert table[5] == "| Bot at 1 | 1 | 100.0 | 100 | 100 | 100 | 100 | 100 | 100.0% | 100.0% | 0.0% |"


def test_sums_up_each_temperature_s_distance_and_results_in_one_row(tmp_path):
    write_camille_s_games(tmp_path)
    runs = {1: tmp_path / "temperature-1.jsonl"}
    write_json_lines([bot_game("bot:13-0", "f2f3")], runs[1])

    results = extract(tmp_path, runs, tmp_path / "cache.jsonl", tmp_path / "out.json", [OnlyE4IsBestAnalyser()])
    table = summary_table(results).splitlines()

    assert table[0] == (
        "| Temperature | Games | Won, drawn, lost | Distance, every move | Distance, open positions "
        "| Endgame moves in decided positions |"
    )
    assert table[2] == "| 1 | 1 | 0, 0, 1 | 50.0 | 50.0 | - |"


def test_sets_each_phase_s_distance_at_each_temperature_in_one_table(tmp_path):
    write_camille_s_games(tmp_path)
    runs = {1: tmp_path / "temperature-1.jsonl"}
    write_json_lines([bot_game("bot:13-0", "f2f3")], runs[1])

    results = extract(tmp_path, runs, tmp_path / "cache.jsonl", tmp_path / "out.json", [OnlyE4IsBestAnalyser()])
    table = phase_distance_table(results).splitlines()

    assert table[0] == "| Phase | 1 | 1, open positions |"
    assert table[2] == "| Opening (1-10) | 50.0 | 50.0 |"
    assert table[3] == "| Middlegame (11-30) | - | - |"


def test_can_set_out_the_losses_of_open_positions_alone(tmp_path):
    write_camille_s_games(tmp_path)
    runs = {1: tmp_path / "temperature-1.jsonl"}
    write_json_lines([bot_game("bot:13-0", "f2f3"), bot_game("bot:13-1", "a2a3")], runs[1])

    results = extract(tmp_path, runs, tmp_path / "cache.jsonl", tmp_path / "out.json", [OnlyE4IsBestAnalyser()])
    table = loss_tables(results, in_open_positions=True).splitlines()

    assert table[5] == "| Bot at 1 | 1 | 100.0 | 100 | 100 | 100 | 100 | 100 | 100.0% | 100.0% | 0.0% |"


def test_reads_the_distance_on_open_positions_unless_told_to_read_every_move(tmp_path):
    # The Bot plays like Camille, plus a third move in a game already won,
    # which the cap reads as losing nothing.
    write_camille_s_games(tmp_path)
    runs = {1: tmp_path / "temperature-1.jsonl"}
    write_json_lines(
        [bot_game("bot:13-0", "e2e4"), bot_game("bot:13-1", "f2f3"), bot_game("bot:13-2", "a2a3")],
        runs[1],
    )

    on_open_positions = extract(tmp_path, runs, tmp_path / "cache.jsonl", tmp_path / "open.json", [OnlyE4IsBestAnalyser()])
    on_every_move = extract(
        tmp_path, runs, tmp_path / "cache.jsonl", tmp_path / "every.json", [OnlyE4IsBestAnalyser()], yardstick=EVERY_MOVE
    )

    assert on_open_positions["yardstick"] == "open positions"
    assert on_open_positions["temperatures"]["1"]["distance"] == 0
    assert on_every_move["yardstick"] == "every move"
    assert on_every_move["temperatures"]["1"]["distance"] == pytest.approx(100 / 6)


def test_measures_the_chance_gap_between_camille_s_games_on_the_same_moves_as_the_distance(tmp_path):
    # His training game's move loses nothing. His Test Set loses a pawn on one
    # move and makes another in a game already won.
    training_move = Position(game_id="lichess:a", source="lichess", ply=1, phase="opening", fen=START, move="e2e4")
    test_set_moves = [
        Position(game_id="lichess:b", source="lichess", ply=1, phase="opening", fen=START, move="d2d4"),
        Position(game_id="lichess:b", source="lichess", ply=3, phase="opening", fen=START, move="a2a3"),
    ]
    write_json_lines([asdict(training_move)], tmp_path / "train.jsonl")
    write_json_lines([asdict(move) for move in test_set_moves], tmp_path / "test.jsonl")
    runs = {1: tmp_path / "temperature-1.jsonl"}
    write_json_lines([bot_game("bot:13-0", "e2e4")], runs[1])

    on_open_positions = extract(tmp_path, runs, tmp_path / "cache.jsonl", tmp_path / "open.json", [OnlyE4IsBestAnalyser()])
    on_every_move = extract(
        tmp_path, runs, tmp_path / "cache.jsonl", tmp_path / "every.json", [OnlyE4IsBestAnalyser()], yardstick=EVERY_MOVE
    )

    assert on_open_positions["camille_test_set_from_training_games"] == 100
    assert on_every_move["camille_test_set_from_training_games"] == 50
