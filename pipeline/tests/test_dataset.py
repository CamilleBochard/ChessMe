from pathlib import Path

import pytest

from pipeline.dataset import build_dataset

FIXTURES = Path(__file__).parent / "fixtures"
CHESSCOM = FIXTURES / "chesscom.pgn"
LICHESS = FIXTURES / "lichess.pgn"


def positions_of(positions, game_id):
    return [position for position in positions if position.game_id == game_id]


def moves_of(positions, game_id):
    return [position.move for position in positions_of(positions, game_id)]


def game_ids(positions):
    return {position.game_id for position in positions}


def test_records_each_move_the_player_made_in_a_ten_minute_game():
    dataset = build_dataset([CHESSCOM], player="punkycam", test_fraction=0)

    assert moves_of(dataset.train, "chesscom:1001") == ["e2e4", "g1f3", "f1b5"]


def test_leaves_out_games_that_are_not_ten_minutes():
    dataset = build_dataset([CHESSCOM], player="punkycam", test_fraction=0)

    assert "chesscom:1002" not in game_ids(dataset.train)
    assert "chesscom:1003" not in game_ids(dataset.train)


def test_leaves_out_games_played_before_june_2025():
    dataset = build_dataset([CHESSCOM], player="punkycam", test_fraction=0)

    assert "chesscom:1004" not in game_ids(dataset.train)


def test_merges_lichess_games_with_chesscom_games():
    dataset = build_dataset([CHESSCOM, LICHESS], player="punkycam", test_fraction=0)

    assert moves_of(dataset.train, "chesscom:1001") == ["e2e4", "g1f3", "f1b5"]
    assert moves_of(dataset.train, "lichess:abcd1234") == ["d7d5", "e7e6", "g8f6"]


def test_records_the_phase_of_each_position_by_ply():
    dataset = build_dataset([LICHESS], player="punkycam", test_fraction=0)

    # Camille is White, so he moves on the odd plies 1 to 33.
    game = positions_of(dataset.train, "lichess:long0001")
    phases = [position.phase for position in game]
    assert phases == ["opening"] * 5 + ["middlegame"] * 10 + ["endgame"] * 2


def test_records_which_site_each_position_comes_from():
    dataset = build_dataset([CHESSCOM, LICHESS], player="punkycam", test_fraction=0)

    sources = {position.game_id: position.source for position in dataset.train}
    assert sources["chesscom:1001"] == "chesscom"
    assert sources["lichess:abcd1234"] == "lichess"


def test_records_the_position_camille_faced_before_each_move():
    dataset = build_dataset([LICHESS], player="punkycam", test_fraction=0)

    first = positions_of(dataset.train, "lichess:abcd1234")[0]
    assert first.fen == "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1"


def test_holds_back_whole_games_so_none_straddles_the_split():
    dataset = build_dataset([CHESSCOM, LICHESS], player="punkycam", test_fraction=0.5)

    train_games = game_ids(dataset.train)
    test_games = game_ids(dataset.test)
    assert train_games and test_games
    assert train_games.isdisjoint(test_games)
    assert train_games | test_games == {
        "chesscom:1001",
        "chesscom:1005",
        "chesscom:1006",
        "chesscom:1007",
        "lichess:abcd1234",
        "lichess:long0001",
    }


def test_makes_the_same_split_on_every_run_whatever_the_file_order():
    first = build_dataset([CHESSCOM, LICHESS], player="punkycam", test_fraction=0.5)
    second = build_dataset([LICHESS, CHESSCOM], player="punkycam", test_fraction=0.5)

    assert game_ids(first.test) == game_ids(second.test)
    assert game_ids(first.train) == game_ids(second.train)


def test_counts_a_game_found_in_two_exports_once():
    dataset = build_dataset([CHESSCOM, CHESSCOM], player="punkycam", test_fraction=0)

    assert moves_of(dataset.train, "chesscom:1001") == ["e2e4", "g1f3", "f1b5"]


def test_refuses_a_game_the_player_did_not_play(tmp_path):
    spectated = tmp_path / "spectated.pgn"
    spectated.write_text(
        '[Site "Chess.com"]\n[White "Someone"]\n[Black "SomeoneElse"]\n'
        '[UTCDate "2025.07.01"]\n[TimeControl "600"]\n'
        '[Link "https://www.chess.com/game/live/2001"]\n\n1. e4 e5 *\n',
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="chesscom:2001"):
        build_dataset([spectated], player="punkycam", test_fraction=0)


def test_leaves_out_games_of_other_variants():
    dataset = build_dataset([LICHESS], player="punkycam", test_fraction=0)

    assert "lichess:c9600001" not in game_ids(dataset.train)
