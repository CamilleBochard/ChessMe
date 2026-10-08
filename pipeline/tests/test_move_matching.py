import math

from pipeline.dataset import Position
from pipeline.move_matching import move_matching_report


def position(game_id: str, ply: int, phase: str, move: str) -> Position:
    # The board itself plays no part in scoring: only the moves are compared.
    return Position(game_id=game_id, source="lichess", ply=ply, phase=phase, fen="unused", move=move)


def test_counts_the_moves_matched_in_every_phase_and_after_ply_10():
    positions = [
        position("a", 3, "opening", "e2e4"),
        position("a", 15, "middlegame", "g1f3"),
        position("b", 4, "opening", "d2d4"),
        position("b", 40, "endgame", "a2a3"),
    ]
    model_moves = ["e2e4", "g1f3", "c2c4", "a2a4"]

    report = move_matching_report(positions, model_moves)

    assert (report.overall.matched, report.overall.positions, report.overall.games) == (2, 4, 2)
    assert (report.after_ply_10.matched, report.after_ply_10.positions) == (1, 2)
    assert (report.by_phase["opening"].matched, report.by_phase["opening"].positions) == (1, 2)
    assert (report.by_phase["middlegame"].matched, report.by_phase["middlegame"].positions) == (1, 1)
    assert (report.by_phase["endgame"].matched, report.by_phase["endgame"].positions) == (0, 1)
    # Game a matched both its positions and game b neither: the share is 0.5,
    # each game strays by one match from the one it predicts, so the variance
    # is 2/1 * (1 + 1) / 4^2 = 0.25.
    assert math.isclose(report.overall.standard_error, 0.5)
