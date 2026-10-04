from chess.engine import Cp, Mate

from pipeline.blunder_profile import centipawn_loss


def test_centipawn_loss_is_how_far_the_played_move_falls_below_the_best_move():
    assert centipawn_loss(best=Cp(150), played=Cp(-50)) == 200


def test_a_played_move_scored_above_the_best_move_loses_nothing():
    assert centipawn_loss(best=Cp(30), played=Cp(45)) == 0


def test_missing_a_mate_counts_the_mate_as_a_decisive_ten_pawn_evaluation():
    assert centipawn_loss(best=Mate(3), played=Cp(200)) == 800
