import math

from pipeline.dataset import Position
from pipeline.new_games_matching import figures, game_tallies


def position(game_id: str, ply: int, phase: str) -> Position:
    # Only the game, the ply and the Phase matter here: whether each model
    # matched Camille's move is given beside the positions.
    return Position(game_id=game_id, source="lichess", ply=ply, phase=phase, fen="unused", move="e2e4")


def test_the_gain_is_measured_position_by_position_with_its_error_clustered_by_game():
    positions = [
        position("a", 3, "opening"),
        position("a", 15, "middlegame"),
        position("b", 4, "opening"),
        position("b", 40, "endgame"),
    ]
    # Game a: the served model matches both moves, the untrained one the first.
    # Game b: each model matches one move, the same one.
    served = [True, True, True, False]
    untrained = [True, False, True, False]

    overall = figures(game_tallies(positions, served, untrained))["all"]

    assert (overall["games"], overall["moves"]) == (2, 4)
    assert math.isclose(overall["served"]["share"], 0.75)
    assert math.isclose(overall["untrained"]["share"], 0.5)
    assert math.isclose(overall["gain"]["share"], 0.25)
    # Game a gains one match, game b none: against the 0.5 a game of two
    # moves is expected to gain at 0.25 a move, each strays by 0.5, so the
    # variance is 2/1 * (0.25 + 0.25) / 4^2 and the error 0.25.
    assert math.isclose(overall["gain"]["standard_error"], 0.25)
    # The untrained model matched one move in each game, just as expected.
    assert math.isclose(overall["untrained"]["standard_error"], 0.0)


def test_each_phase_counts_only_the_games_with_moves_in_it_and_gives_no_error_for_a_single_game():
    positions = [
        position("a", 3, "opening"),
        position("a", 15, "middlegame"),
        position("b", 4, "opening"),
        position("b", 40, "endgame"),
    ]
    served = [True, True, False, False]
    untrained = [False, True, False, True]

    by_slice = figures(game_tallies(positions, served, untrained))

    opening = by_slice["opening"]
    assert (opening["games"], opening["moves"]) == (2, 2)
    assert math.isclose(opening["served"]["share"], 0.5)
    assert math.isclose(opening["gain"]["share"], 0.5)
    endgame = by_slice["endgame"]
    assert (endgame["games"], endgame["moves"]) == (1, 1)
    assert math.isclose(endgame["gain"]["share"], -1.0)
    # One game's spread cannot be measured; the record says so with null,
    # which JSON can hold, rather than NaN, which it cannot.
    assert endgame["gain"]["standard_error"] is None
