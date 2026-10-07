from datetime import date

import pytest

from pipeline.session_games import (
    RejectedGame,
    RejectedImpression,
    open_store,
    record_impression,
    record_session_game,
    session_game_counts,
    session_game_pgns,
)

PLAYED_ON = date(2026, 10, 5)


# The shortest checkmate: the visitor plays White and the Bot mates with Black.
FOOLS_MATE_MOVES = [
    {"uci": "f2f3"},
    {"uci": "e7e5", "source": "opening-book"},
    {"uci": "g2g4"},
    {"uci": "d8h4", "source": "base-model"},
]


def fools_mate_reported_by_the_page():
    """Fool's mate as the page reports it, with the Bot on the winning side."""
    return {
        "botColour": "black",
        "baseModel": "maia3-5m",
        "rating": 1100,
        "moves": [dict(move) for move in FOOLS_MATE_MOVES],
    }


def fools_mate_with_the_bot_as_white():
    """The same checkmate, with the Bot on the losing side."""
    return {
        "botColour": "white",
        "baseModel": "maia3-5m",
        "rating": 1100,
        "moves": [
            {"uci": "f2f3", "source": "base-model"},
            {"uci": "e7e5"},
            {"uci": "g2g4", "source": "base-model"},
            {"uci": "d8h4"},
        ],
    }


def stalemate_in_ten_with_the_bot_as_black():
    """Sam Loyd's ten-move stalemate: White, the visitor, leaves Black no move."""
    moves = ["e2e3", "a7a5", "d1h5", "a8a6", "h5a5", "h7h5", "h2h4", "a6h6", "a5c7", "f7f6",
             "c7d7", "e8f7", "d7b7", "d8d3", "b7b8", "d3h7", "b8c8", "f7g6", "c8e6"]
    reported = []
    for index, uci in enumerate(moves):
        if index % 2 == 1:
            reported.append({"uci": uci, "source": "base-model"})
        else:
            reported.append({"uci": uci})
    return {"botColour": "black", "baseModel": "maia3-5m", "rating": 1100, "moves": reported}


def test_stores_a_finished_game_as_pgn(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")

    record_session_game(store, fools_mate_reported_by_the_page(), played_on=PLAYED_ON)

    pgns = session_game_pgns(store)
    assert len(pgns) == 1
    assert '[Result "0-1"]' in pgns[0]
    assert "1. f3 e5 2. g4 Qh4# 0-1" in pgns[0]


def test_names_the_bot_and_the_visitor_and_the_date_in_the_pgn(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")

    record_session_game(store, fools_mate_reported_by_the_page(), played_on=PLAYED_ON)

    pgn = session_game_pgns(store)[0]
    assert '[White "Visitor"]' in pgn
    assert '[Black "ChessMe Bot"]' in pgn
    assert '[Date "2026.10.05"]' in pgn


def test_refuses_a_game_that_has_not_ended(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")
    abandoned_after_two_moves = {
        "botColour": "black",
        "baseModel": "maia3-5m",
        "rating": 1100,
        "moves": [{"uci": "e2e4"}, {"uci": "e7e5", "source": "opening-book"}],
    }

    with pytest.raises(RejectedGame, match="has not ended"):
        record_session_game(store, abandoned_after_two_moves, played_on=PLAYED_ON)

    assert session_game_pgns(store) == []


def test_refuses_a_game_with_an_illegal_move(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")
    report = fools_mate_reported_by_the_page()
    # A pawn cannot advance three squares.
    report["moves"][0] = {"uci": "f2f5"}

    with pytest.raises(RejectedGame, match="illegal move f2f5"):
        record_session_game(store, report, played_on=PLAYED_ON)


def test_counts_the_bots_wins_losses_and_draws(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")
    record_session_game(store, fools_mate_reported_by_the_page(), played_on=PLAYED_ON)
    record_session_game(store, fools_mate_reported_by_the_page(), played_on=PLAYED_ON)
    record_session_game(store, fools_mate_with_the_bot_as_white(), played_on=PLAYED_ON)
    record_session_game(store, stalemate_in_ten_with_the_bot_as_black(), played_on=PLAYED_ON)

    counts = session_game_counts(store)

    assert counts["games"] == 4
    assert counts["bot_wins"] == 2
    assert counts["bot_losses"] == 1
    assert counts["draws"] == 1


def test_counts_the_bots_moves_by_where_they_came_from(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")
    # One book move and one Base Model move.
    record_session_game(store, fools_mate_reported_by_the_page(), played_on=PLAYED_ON)
    # Two Base Model moves.
    record_session_game(store, fools_mate_with_the_bot_as_white(), played_on=PLAYED_ON)

    counts = session_game_counts(store)

    assert counts["bot_moves_from_opening_book"] == 1
    assert counts["bot_moves_from_base_model"] == 3


@pytest.mark.parametrize("source", [None, "random", "stockfish"])
def test_refuses_a_bot_move_not_marked_as_from_the_book_or_the_base_model(tmp_path, source):
    store = open_store(tmp_path / "session-games.sqlite")
    report = fools_mate_reported_by_the_page()
    if source is None:
        report["moves"][1] = {"uci": "e7e5"}
    else:
        report["moves"][1] = {"uci": "e7e5", "source": source}

    with pytest.raises(RejectedGame, match="Bot's move e7e5"):
        record_session_game(store, report, played_on=PLAYED_ON)

    assert session_game_pgns(store) == []


def test_refuses_a_report_that_does_not_say_which_side_the_bot_played(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")
    report = fools_mate_reported_by_the_page()
    report["botColour"] = "green"

    with pytest.raises(RejectedGame, match="Bot's colour green"):
        record_session_game(store, report, played_on=PLAYED_ON)


@pytest.mark.parametrize(
    "report",
    [
        "not a game",
        {"botColour": "black", "baseModel": "maia3-5m"},
        {"botColour": "black", "baseModel": "maia3-5m", "rating": 1100, "moves": "f2f3 e7e5"},
        {"botColour": "black", "baseModel": "maia3-5m", "rating": 1100, "moves": [{"from": "f2", "to": "f3"}]},
        {"botColour": "black", "baseModel": "maia3-5m", "rating": 1100, "moves": [{"uci": 42}]},
        # A finished game, so that only the missing or mistyped rating is wrong.
        {"botColour": "black", "baseModel": "maia3-5m", "moves": FOOLS_MATE_MOVES},
        {"botColour": "black", "baseModel": "maia3-5m", "rating": "1100", "moves": FOOLS_MATE_MOVES},
        {"botColour": "black", "baseModel": "maia3-5m", "rating": True, "moves": FOOLS_MATE_MOVES},
        # An unfinished game, so that only a resignation that is not a plain
        # true could let it through.
        {"botColour": "black", "baseModel": "maia3-5m", "rating": 1100, "moves": [], "visitorResigned": "yes"},
        {"botColour": "black", "baseModel": "maia3-5m", "rating": 1100, "moves": [], "visitorResigned": 1},
    ],
)
def test_refuses_a_report_that_is_not_shaped_like_the_pages(tmp_path, report):
    store = open_store(tmp_path / "session-games.sqlite")

    with pytest.raises(RejectedGame):
        record_session_game(store, report, played_on=PLAYED_ON)


def test_names_the_base_model_the_bot_played_with_in_the_pgn(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")

    record_session_game(store, fools_mate_reported_by_the_page(), played_on=PLAYED_ON)

    pgn = session_game_pgns(store)[0]
    assert '[BaseModel "maia3-5m"]' in pgn


def test_counts_whether_visitors_felt_they_played_a_real_player(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")
    felt_real = record_session_game(store, fools_mate_reported_by_the_page(), played_on=PLAYED_ON)
    felt_artificial = record_session_game(store, fools_mate_reported_by_the_page(), played_on=PLAYED_ON)
    record_session_game(store, fools_mate_reported_by_the_page(), played_on=PLAYED_ON)

    record_impression(store, felt_real, felt_like_a_real_player=True)
    record_impression(store, felt_artificial, felt_like_a_real_player=False)

    counts = session_game_counts(store)
    assert counts["felt_like_a_real_player"] == 1
    assert counts["did_not_feel_like_a_real_player"] == 1
    assert counts["impression_not_given"] == 1


def test_keeps_the_first_impression_given_for_a_game(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")
    game_id = record_session_game(store, fools_mate_reported_by_the_page(), played_on=PLAYED_ON)
    record_impression(store, game_id, felt_like_a_real_player=True)

    with pytest.raises(RejectedImpression, match="already"):
        record_impression(store, game_id, felt_like_a_real_player=False)

    assert session_game_counts(store)["felt_like_a_real_player"] == 1


def test_refuses_an_impression_for_a_game_that_was_never_stored(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")

    with pytest.raises(RejectedImpression, match="no game"):
        record_impression(store, "00000000-0000-4000-8000-000000000000", felt_like_a_real_player=True)


def knights_out_and_back(plies):
    """Both sides' king's knights out and home again, repeating the start, cut after plies."""
    moves = ["g1f3", "g8f6", "f3g1", "f6g8"] * 2
    reported = []
    for index, uci in enumerate(moves[:plies]):
        if index % 2 == 1:
            reported.append({"uci": uci, "source": "base-model"})
        else:
            reported.append({"uci": uci})
    return {"botColour": "black", "baseModel": "maia3-5m", "rating": 1100, "moves": reported}


def test_stores_a_draw_by_threefold_repetition(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")

    # The starting position stands for the third time.
    record_session_game(store, knights_out_and_back(8), played_on=PLAYED_ON)

    assert session_game_counts(store)["draws"] == 1


def test_refuses_a_game_one_move_short_of_threefold_repetition(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")

    # Black could repeat the position next move, but the page only ends the
    # game once the repetition has happened.
    with pytest.raises(RejectedGame, match="has not ended"):
        record_session_game(store, knights_out_and_back(7), played_on=PLAYED_ON)


def test_names_the_rating_the_base_model_played_at_in_the_pgn(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")
    record_session_game(store, fools_mate_reported_by_the_page(), played_on=PLAYED_ON)

    pgn = session_game_pgns(store)[0]
    assert '[BaseModelRating "1100"]' in pgn


def resigned_after_two_moves():
    """The visitor, playing White, resigns after one move each: the Bot wins."""
    return {
        "botColour": "black",
        "baseModel": "maia3-5m",
        "rating": 1100,
        "moves": [{"uci": "e2e4"}, {"uci": "e7e5", "source": "opening-book"}],
        "visitorResigned": True,
    }


def test_stores_a_game_the_visitor_resigned_as_won_by_the_bot(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")

    record_session_game(store, resigned_after_two_moves(), played_on=PLAYED_ON)

    pgn = session_game_pgns(store)[0]
    assert '[Result "0-1"]' in pgn
    assert '[Termination "Visitor resigned"]' in pgn
    assert session_game_counts(store)["bot_wins"] == 1


def test_refuses_a_resignation_after_the_game_ended_on_the_board(tmp_path):
    store = open_store(tmp_path / "session-games.sqlite")
    report = fools_mate_reported_by_the_page()
    report["visitorResigned"] = True

    with pytest.raises(RejectedGame, match="already ended"):
        record_session_game(store, report, played_on=PLAYED_ON)
