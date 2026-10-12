import pytest

from pipeline.blunder_profile import MoveLoss
from pipeline.draw_temperature import loss_distance


def losses(phase: str, centipawn_losses: list[int]) -> list[MoveLoss]:
    moves = []
    for index, loss in enumerate(centipawn_losses):
        moves.append(MoveLoss(game_id=f"game:{index}", ply=index + 1, phase=phase, centipawn_loss=loss))
    return moves


def test_a_player_whose_losses_are_shifted_by_a_constant_is_that_far_away():
    camille = losses("middlegame", [0, 40, 300])
    bot = losses("middlegame", [20, 60, 320])

    assert loss_distance(bot, camille) == pytest.approx(20)


def test_losses_with_the_same_mean_but_another_shape_are_apart():
    # The same mean of 100: Camille loses a pawn on every move, the Bot
    # either nothing or two pawns. Every loss has to move by a pawn to turn
    # one distribution into the other.
    camille = losses("middlegame", [100, 100])
    bot = losses("middlegame", [0, 200])

    assert loss_distance(bot, camille) == pytest.approx(100)


def test_each_phase_is_compared_on_its_own_and_weighed_by_camilles_share_of_moves_in_it():
    # Opening: a pawn apart. Endgame: identical. Camille makes one move in
    # four in the opening, so the distance is a quarter of a pawn, however
    # few endgame moves the Bot's games happen to hold.
    camille = losses("opening", [0]) + losses("endgame", [0, 0, 0])
    bot = losses("opening", [100]) + losses("endgame", [0])

    assert loss_distance(bot, camille) == pytest.approx(25)
