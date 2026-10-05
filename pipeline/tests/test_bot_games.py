import json

from pipeline.bot_games import read_bot_games
from pipeline.dataset import Position

START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
AFTER_E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"


def write_games(path, games):
    lines = [json.dumps(game) + "\n" for game in games]
    path.write_text("".join(lines), encoding="utf-8")


def test_records_the_position_the_bot_faced_before_each_of_its_moves(tmp_path):
    games_path = tmp_path / "bot-games.jsonl"
    write_games(games_path, [{"game_id": "bot:1", "bot_colour": "white", "moves": ["e2e4", "e7e5", "g1f3"]}])

    positions = read_bot_games(games_path)

    assert positions == [
        Position(game_id="bot:1", source="bot", ply=1, phase="opening", fen=START, move="e2e4"),
        Position(game_id="bot:1", source="bot", ply=3, phase="opening", fen=AFTER_E4_E5, move="g1f3"),
    ]
