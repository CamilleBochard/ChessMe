import pytest

from pipeline.blunder_profile import MoveLoss
from pipeline.draw_temperature import loss_distance, next_step, phase_distances


def losses(phase: str, centipawn_losses: list[int]) -> list[MoveLoss]:
    moves = []
    for index, loss in enumerate(centipawn_losses):
        moves.append(MoveLoss(game_id=f"game:{index}", ply=index + 1, phase=phase, centipawn_loss=loss, open_position=True))
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


def test_gives_each_phase_s_own_distance_and_none_where_camille_has_no_move():
    camille = losses("opening", [0]) + losses("endgame", [0, 0, 0])
    bot = losses("opening", [100]) + losses("middlegame", [50]) + losses("endgame", [0])

    distances = phase_distances(bot, camille)

    assert distances == {"opening": pytest.approx(100), "middlegame": None, "endgame": pytest.approx(0)}


def test_the_search_starts_at_temperature_1():
    step = next_step({})

    assert step.measure == 1
    assert step.chosen is None


def test_both_neighbours_of_the_closest_temperature_so_far_are_measured_lower_one_first():
    assert next_step({1: 40}).measure == 0.75
    assert next_step({1: 40, 0.75: 55}).measure == 1.25


def test_a_temperature_closer_than_both_its_measured_neighbours_is_chosen():
    step = next_step({0.75: 55, 1: 40, 1.25: 48})

    assert step.chosen == 1
    assert step.measure is None


def test_the_search_carries_on_past_the_end_of_what_is_measured_while_it_gets_closer():
    assert next_step({0.75: 55, 1: 40, 1.25: 30}).measure == 1.5
    assert next_step({0.75: 55, 1: 40, 1.25: 30, 1.5: 35}).chosen == 1.25


def test_temperature_0_the_top_move_ends_the_search_downwards():
    step = next_step({0: 20, 0.25: 30, 0.5: 45, 0.75: 60, 1: 70, 1.25: 80})

    assert step.chosen == 0


def test_of_two_temperatures_equally_close_the_one_nearer_1_is_kept():
    step = next_step({0.25: 30, 0.5: 25, 0.75: 30, 1: 40, 1.25: 25, 1.5: 30})

    assert step.chosen == 1.25


def test_of_two_temperatures_equally_close_and_equally_near_1_the_lower_is_kept():
    step = next_step({0.5: 30, 0.75: 25, 1: 40, 1.25: 25, 1.5: 30})

    assert step.chosen == 0.75
