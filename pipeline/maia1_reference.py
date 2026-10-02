"""Records lc0's answers on fixed positions, for the engine to check its encoding against.

Run from the repository root, after python -m pipeline.convert_maia1:

    python -m pipeline.maia1_reference

The Move-Selection Engine turns a position into a Maia-1 network's input with
its own TypeScript code. lc0 is the reference for that encoding. Here lc0 runs
the very ONNX file the engine loads, through its ONNX Runtime backend, on every
position in verification_positions.txt. If the engine encodes a position the
way lc0 does, the two give the same probabilities; any difference comes from
the encoding, since the network and its weights are the same file.

The answers are written to src/engine/fixtures, where a test compares them with
the engine's own. lc0 names castling as the king taking its own rook (e1h1);
those names are rewritten to the king's two-square step (e1g1), the form the
rest of the project uses.

One rating bin is enough: every Maia-1 candidate shares the same input encoding
and differs only in its weights.
"""

import json

import chess

from pipeline.conversion_check import POSITIONS_PATH, read_positions
from pipeline.convert_maia1 import VERIFY_DIR
from pipeline.fixture_models import FIXTURES_DIR
from pipeline.verify_maia1 import Lc0

CANDIDATE_NAME = "maia1-1500"
REFERENCE_PATH = FIXTURES_DIR / f"{CANDIDATE_NAME}-lc0-reference.json"


def standard_uci(fen: str, lc0_move: str) -> str:
    """The move in standard UCI. python-chess reads lc0's king-takes-rook castling."""
    board = chess.Board(fen)
    return board.parse_uci(lc0_move).uci()


if __name__ == "__main__":
    lc0 = Lc0("onnx-cpu", VERIFY_DIR / f"{CANDIDATE_NAME}.onnx.pb.gz")
    positions = []
    for fen in read_positions(POSITIONS_PATH):
        answer = lc0.answer(fen)
        policy = {standard_uci(fen, move): percent for move, percent in answer.policy.items()}
        best_move = standard_uci(fen, answer.best_move)
        positions.append({"fen": fen, "best_move": best_move, "policy_percent": policy})
    lc0.close()

    reference = {
        "model": f"models/onnx/{CANDIDATE_NAME}.onnx",
        "produced_by": "lc0 v0.32.1, onnx-cpu backend, go nodes 1, policy softmax temperature 1",
        # How lc0 arrives at the printed numbers, which a comparison must reproduce.
        "printed_policy": "softmax over legal moves using lc0's FastExp, stored in 16 bits, printed in percent to 2 decimals",
        "positions": positions,
    }
    REFERENCE_PATH.write_text(json.dumps(reference, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote lc0's answers on {len(positions)} positions to {REFERENCE_PATH}")
