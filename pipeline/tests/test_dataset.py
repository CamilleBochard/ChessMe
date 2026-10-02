from pathlib import Path

from pipeline.dataset import build_dataset

FIXTURES = Path(__file__).parent / "fixtures"
CHESSCOM = FIXTURES / "chesscom.pgn"
LICHESS = FIXTURES / "lichess.pgn"


def moves_of(positions, game_id):
    return [position.move for position in positions if position.game_id == game_id]


def test_records_each_move_the_player_made_in_a_ten_minute_game():
    dataset = build_dataset([CHESSCOM], player="punkycam", test_fraction=0)

    assert moves_of(dataset.train, "chesscom:1001") == ["e2e4", "g1f3", "f1b5"]


def game_ids(positions):
    return {position.game_id for position in positions}


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
