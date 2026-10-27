import random
from datetime import datetime, timedelta

from pipeline.blunder_profile import MoveLoss
from pipeline.level_break import GameLevel, find_level_break, game_levels, look_for_break


def history(*stretches: tuple[int, float], seed: int = 1) -> list[GameLevel]:
    """Games in the order they were played, each stretch a number of games around a mean Level.

    Each game's Level is its mean plus noise, as a game's share of mistakes
    varies around the player's true rate.
    """
    noise = random.Random(seed)
    first_game_began = datetime(2025, 1, 1, 9, 0, 0)
    games = []
    for count, mean in stretches:
        for _ in range(count):
            index = len(games)
            level = min(max(mean + noise.gauss(0, 0.04), 0.0), 1.0)
            began = first_game_began + timedelta(hours=index)
            games.append(GameLevel(game_id=f"game:{index}", played_at=began.isoformat(), level=level))
    return games


def test_finds_a_break_near_a_clear_jump_in_level():
    games = history((200, 0.10), (200, 0.05))

    search = look_for_break(games)

    assert search.is_break
    assert abs(search.split - 200) <= 10
    assert search.level_before > search.level_after


def test_finds_no_break_in_a_history_whose_level_never_changes():
    games = history((400, 0.08))

    search = look_for_break(games)

    assert not search.is_break
    assert search.difference <= search.threshold


def test_never_splits_with_fewer_than_150_games_on_a_side():
    jump_after_100_games = history((100, 0.15), (300, 0.05))
    jump_100_games_before_the_end = history((300, 0.05), (100, 0.15))

    first = look_for_break(jump_after_100_games)
    second = look_for_break(jump_100_games_before_the_end)

    assert first.split == 150
    assert second.split == 250


def test_does_not_look_in_a_history_too_short_for_150_games_on_each_side():
    search = look_for_break(history((299, 0.08)))

    assert search.split is None
    assert not search.is_break


def test_runs_again_after_a_break_and_keeps_the_last_one_found():
    games = history((300, 0.14), (300, 0.08), (300, 0.03))

    found = find_level_break(games)

    breaks = [search for search in found.searches if search.is_break]
    assert len(breaks) == 2
    assert abs(found.level_break - 600) <= 10
    assert found.level_break_at == games[found.level_break].played_at


def test_has_no_level_break_when_the_first_search_finds_none():
    found = find_level_break(history((400, 0.08)))

    assert found.level_break is None
    assert found.level_break_at is None
    assert len(found.searches) == 1


def loss(game_id: str, ply: int, centipawns: int) -> MoveLoss:
    return MoveLoss(game_id=game_id, ply=ply, phase="middlegame", centipawn_loss=centipawns, open_position=True)


def test_reads_a_game_s_level_as_its_share_of_mistakes_after_ply_10_in_the_order_the_games_were_played():
    losses = [
        loss("late", 9, 900),
        loss("late", 11, 300),
        loss("late", 13, 299),
        loss("early", 12, 0),
        loss("early", 14, 500),
        loss("early", 16, 20),
        loss("early", 18, 10),
        loss("opening-only", 5, 400),
    ]
    played_at = {"late": "2025-07-02T10:00:00", "early": "2025-07-01T10:00:00", "opening-only": "2025-07-03T10:00:00"}

    levels = game_levels(losses, played_at)

    # A game with no move after ply 10 has no Level to read.
    assert levels == [
        GameLevel(game_id="early", played_at="2025-07-01T10:00:00", level=0.25),
        GameLevel(game_id="late", played_at="2025-07-02T10:00:00", level=0.5),
    ]
