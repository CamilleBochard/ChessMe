from chess.engine import Cp, Mate

import pytest

from pipeline.blunder_profile import MoveLoss, build_blunder_profile, centipawn_loss, share_losing_at_least


def test_centipawn_loss_is_how_far_the_played_move_falls_below_the_best_move():
    assert centipawn_loss(best=Cp(150), played=Cp(-50)) == 200


def test_a_played_move_scored_above_the_best_move_loses_nothing():
    assert centipawn_loss(best=Cp(30), played=Cp(45)) == 0


def test_missing_a_mate_counts_the_mate_as_a_decisive_ten_pawn_evaluation():
    assert centipawn_loss(best=Mate(3), played=Cp(200)) == 800



def losses(phase: str, centipawn_losses: list[int]) -> list[MoveLoss]:
    moves = []
    for index, loss in enumerate(centipawn_losses):
        moves.append(MoveLoss(game_id=f"lichess:{index}", ply=index + 1, phase=phase, centipawn_loss=loss))
    return moves


def test_counts_and_averages_the_losses_of_each_phase_separately():
    moves = losses("opening", [0, 0, 30, 90]) + losses("middlegame", [400])

    profile = build_blunder_profile(moves)

    assert profile["phases"]["opening"]["moves"] == 4
    assert profile["phases"]["opening"]["mean"] == 30
    assert profile["phases"]["middlegame"]["moves"] == 1
    assert profile["phases"]["middlegame"]["mean"] == 400


def test_sorts_each_phase_into_loss_buckets_from_no_loss_to_more_than_ten_pawns():
    moves = losses("endgame", [0, 0, 5, 10, 60, 99, 100, 350, 1500])

    profile = build_blunder_profile(moves)

    assert profile["phases"]["endgame"]["histogram"] == [
        {"from": 0, "to": 1, "moves": 2},
        {"from": 1, "to": 10, "moves": 1},
        {"from": 10, "to": 25, "moves": 1},
        {"from": 25, "to": 50, "moves": 0},
        {"from": 50, "to": 100, "moves": 2},
        {"from": 100, "to": 200, "moves": 1},
        {"from": 200, "to": 300, "moves": 0},
        {"from": 300, "to": 500, "moves": 1},
        {"from": 500, "to": 1000, "moves": 0},
        {"from": 1000, "to": None, "moves": 1},
    ]


def test_reports_the_loss_below_which_each_share_of_a_phase_s_moves_falls():
    one_to_a_hundred = list(range(1, 101))
    moves = losses("middlegame", one_to_a_hundred)

    profile = build_blunder_profile(moves)

    assert profile["phases"]["middlegame"]["percentiles"] == {"50": 50, "75": 75, "90": 90, "95": 95, "99": 99}


def test_also_summarises_every_move_whatever_its_phase():
    moves = losses("opening", [0, 20]) + losses("endgame", [500])

    profile = build_blunder_profile(moves)

    assert profile["all_phases"]["moves"] == 3
    assert profile["all_phases"]["percentiles"]["50"] == 20


def test_reads_the_share_of_moves_losing_at_least_a_threshold_off_the_histogram():
    profile = build_blunder_profile(losses("opening", [0, 50, 299, 300, 1200]))

    assert share_losing_at_least(profile["phases"]["opening"], 300) == 0.4


def test_refuses_a_threshold_the_histogram_cannot_answer():
    profile = build_blunder_profile(losses("opening", [0, 400]))

    with pytest.raises(ValueError):
        share_losing_at_least(profile["phases"]["opening"], 250)
