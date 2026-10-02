from pathlib import Path

from pipeline.dataset import build_dataset

FIXTURES = Path(__file__).parent / "fixtures"
CHESSCOM = FIXTURES / "chesscom.pgn"


def moves_of(positions, game_id):
    return [position.move for position in positions if position.game_id == game_id]


def test_records_each_move_the_player_made_in_a_ten_minute_game():
    dataset = build_dataset([CHESSCOM], player="punkycam", test_fraction=0)

    assert moves_of(dataset.train, "chesscom:1001") == ["e2e4", "g1f3", "f1b5"]
