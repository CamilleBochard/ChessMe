from datetime import date

from pipeline.session_game_analysis import collapse_ply, stored_games
from pipeline.session_games import open_store, record_session_game


def test_finds_the_first_move_before_move_15_at_which_the_player_stood_three_pawns_down():
    # (ply, evaluation before the move, from the player's side, in centipawns)
    evaluations = [(2, 30), (4, -120), (6, -310), (8, -600)]

    assert collapse_ply(evaluations) == 6


def test_finds_no_collapse_when_the_player_never_stood_that_far_down_before_move_15():
    evaluations = [(2, 30), (28, -299), (32, -900)]

    assert collapse_ply(evaluations) is None


def fools_mate(assisted: bool) -> dict:
    """Fool's mate as the page reports it, the Bot mating with Black."""
    return {
        "botColour": "black",
        "baseModel": "maia3-5m",
        "rating": 1100,
        "moves": [
            {"uci": "f2f3"},
            {"uci": "e7e5", "source": "opening-book"},
            {"uci": "g2g4"},
            {"uci": "d8h4", "source": "base-model"},
        ],
        "assisted": assisted,
    }


def test_reads_the_bots_moves_of_each_stored_game_played_without_analysis_mode(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")
    game_id = record_session_game(store, fools_mate(assisted=False), played_on=date(2026, 10, 14))
    record_session_game(store, fools_mate(assisted=True), played_on=date(2026, 10, 14))

    games = stored_games(store)

    assert [(game.id, game.bot_colour, game.result) for game in games] == [(game_id, "black", "0-1")]
    bot_moves = [(move.ply, move.phase, move.move, move.came_from) for move in games[0].bot_moves]
    assert bot_moves == [(2, "opening", "e7e5", "opening-book"), (4, "opening", "d8h4", "base-model")]
    assert games[0].bot_moves[1].fen == "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2"
