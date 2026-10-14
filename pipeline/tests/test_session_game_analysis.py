from pipeline.session_game_analysis import collapse_ply


def test_finds_the_first_move_before_move_15_at_which_the_player_stood_three_pawns_down():
    # (ply, evaluation before the move, from the player's side, in centipawns)
    evaluations = [(2, 30), (4, -120), (6, -310), (8, -600)]

    assert collapse_ply(evaluations) == 6


def test_finds_no_collapse_when_the_player_never_stood_that_far_down_before_move_15():
    evaluations = [(2, 30), (28, -299), (32, -900)]

    assert collapse_ply(evaluations) is None
