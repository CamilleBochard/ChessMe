from datetime import date

from pipeline.session_game_analysis import AnalysedMove, collapse_ply, phase_summaries, stored_games
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


def test_sums_up_each_phase_by_its_average_loss_in_open_positions_and_its_share_of_model_moves_under_1_percent():
    moves = [
        AnalysedMove(phase="middlegame", centipawn_loss=100, open_position=True, probability=0.005),
        AnalysedMove(phase="middlegame", centipawn_loss=20, open_position=True, probability=0.30),
        # Made once the game was decided: left out of the loss, still a move of the model.
        AnalysedMove(phase="middlegame", centipawn_loss=0, open_position=False, probability=0.50),
        # From the Opening Book: no model probability.
        AnalysedMove(phase="middlegame", centipawn_loss=60, open_position=True, probability=None),
    ]

    summaries = phase_summaries(moves)

    middlegame = summaries["middlegame"]
    assert (middlegame.open_moves, middlegame.average_loss) == (3, 60)
    assert (middlegame.model_moves, middlegame.share_under_1_percent) == (3, 1 / 3)
    assert summaries["endgame"].open_moves == 0
    assert summaries["endgame"].average_loss is None
