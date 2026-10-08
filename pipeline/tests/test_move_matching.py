import math

from pipeline.dataset import Position
from pipeline.move_matching import BaselineComparison, Difference, beats_baseline, compare_with_baseline, move_matching_report


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


def test_measures_how_far_a_model_moves_from_the_baseline_on_the_same_positions():
    positions = [
        position("a", 12, "middlegame", "e2e4"),
        position("a", 14, "middlegame", "g1f3"),
        position("b", 12, "middlegame", "d2d4"),
        position("b", 14, "middlegame", "c2c4"),
    ]
    baseline_moves = ["a2a3", "a2a3", "d2d4", "a2a3"]
    model_moves = ["e2e4", "g1f3", "a2a3", "c2c4"]

    comparison = compare_with_baseline(positions, baseline_moves, model_moves)

    # One match for the Baseline, three for the model: half a point more of the four positions.
    assert math.isclose(comparison.after_ply_10.difference, 0.5)
    # Game a gains two matches and game b none, each one away from the one
    # the overall gain predicts: the variance is 2/1 * (1 + 1) / 4^2 = 0.25.
    assert math.isclose(comparison.after_ply_10.standard_error, 0.5)
    assert math.isclose(comparison.by_phase["middlegame"].difference, 0.5)


def comparison_after_ply_10(difference: float, standard_error: float) -> BaselineComparison:
    gap = Difference(difference=difference, standard_error=standard_error)
    unused = Difference(difference=0.0, standard_error=0.01)
    return BaselineComparison(
        overall=unused, after_ply_10=gap, by_phase={"opening": unused, "middlegame": unused, "endgame": unused}
    )


def test_a_gain_after_ply_10_of_more_than_two_standard_errors_beats_the_baseline():
    assert beats_baseline(comparison_after_ply_10(difference=0.011, standard_error=0.005))


def test_a_gain_within_two_standard_errors_does_not_beat_the_baseline():
    assert not beats_baseline(comparison_after_ply_10(difference=0.009, standard_error=0.005))
