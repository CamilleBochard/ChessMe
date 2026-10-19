import json

from chess.engine import Cp

from pipeline.export_bot_moves import export_bot_moves
from pipeline.stockfish_analysis import Analysis

START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
AFTER_E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"


class OnlyE4IsBestAnalyser:
    """Stands in for Stockfish: e2e4 is the best move everywhere, any other move loses a pawn."""

    engine = "Fake engine"
    depth = 18

    def analyse(self, fen: str, move: str) -> Analysis:
        if move == "e2e4":
            return Analysis(best_move="e2e4", best=Cp(30), played=Cp(30))
        return Analysis(best_move="e2e4", best=Cp(30), played=Cp(-70))


def test_writes_each_of_the_bot_s_moves_in_the_dataset_s_shape_with_the_evaluation_it_lost(tmp_path):
    games_path = tmp_path / "bot-games.jsonl"
    game = {
        "game_id": "bot:13-0",
        "bot_colour": "white",
        "moves": ["e2e4", "e7e5", "g1f3"],
        "ending": {"kind": "resignation", "winner": "white"},
    }
    games_path.write_text(json.dumps(game) + "\n", encoding="utf-8")
    out_path = tmp_path / "bot-moves.jsonl"

    export_bot_moves(games_path, out_path, [OnlyE4IsBestAnalyser()], tmp_path / "cache.jsonl")

    written = [json.loads(line) for line in out_path.read_text(encoding="utf-8").splitlines()]
    assert written == [
        {
            "game_id": "bot:13-0",
            "source": "bot",
            "ply": 1,
            "phase": "opening",
            "fen": START,
            "move": "e2e4",
            "centipawn_loss": 0,
        },
        {
            "game_id": "bot:13-0",
            "source": "bot",
            "ply": 3,
            "phase": "opening",
            "fen": AFTER_E4_E5,
            "move": "g1f3",
            "centipawn_loss": 100,
        },
    ]
