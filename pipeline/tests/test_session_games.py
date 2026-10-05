from datetime import date

import pytest

from pipeline.session_games import RejectedGame, open_store, record_session_game, session_game_pgns

PLAYED_ON = date(2026, 10, 5)


def fools_mate_reported_by_the_page():
    """The shortest checkmate: the visitor plays White and the Bot mates with Black."""
    return {
        "botColour": "black",
        "baseModel": "maia3-5m",
        "moves": [
            {"uci": "f2f3"},
            {"uci": "e7e5", "source": "opening-book"},
            {"uci": "g2g4"},
            {"uci": "d8h4", "source": "base-model"},
        ],
    }


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
