import chess

from pipeline.player_positions import positions_reached
from pipeline.tests.test_player_record import PLAYER, game


def test_keeps_the_position_after_each_of_the_players_moves():
    games = [game(PLAYER, "someone", "1-0", ["e4", "e5", "Nf3"])]

    positions = positions_reached(games, PLAYER, plies=30)

    after_e4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq"
    after_nf3 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq"
    assert positions == sorted([after_e4, after_nf3])


def test_keeps_the_players_positions_with_black_and_none_past_the_plies_given():
    games = [game("someone", PLAYER, "0-1", ["e4", "e5", "Nf3", "Nc6"])]

    positions = positions_reached(games, PLAYER, plies=2)

    assert positions == ["rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq"]
