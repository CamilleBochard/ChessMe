"""Records Maia-3's answers on fixed positions, for the engine to check its encoding against.

Run from the repository root, after python -m pipeline.convert_maia3:

    python -m pipeline.maia3_reference

The Move-Selection Engine encodes positions for Maia-3 with its own TypeScript
code. CSSLab's maia3 package is the reference for that encoding. Here each
position in verification_positions.txt is encoded by the maia3 package and run
through the very ONNX file the engine loads, with ONNX Runtime. If the engine
encodes a position the same way, the two give the same probabilities; the
network and its weights are the same file, so any difference comes from the
encoding.

Unlike lc0, nothing here rounds the probabilities, so they are written at
full precision. The rating is fixed at 1500 for both players: the encoding
does not depend on it, and the rating inputs are passed through untouched.
"""

import json

import chess
import onnxruntime
import torch

from pipeline.conversion_check import POSITIONS_PATH, read_positions
from pipeline.convert_maia3 import CANDIDATE_NAME, ONNX_PATH, load_reference
from pipeline.fixture_models import FIXTURES_DIR
from pipeline.verify_maia3 import answer_from_logits, encode

RATING = 1500
REFERENCE_PATH = FIXTURES_DIR / f"{CANDIDATE_NAME}-reference.json"


if __name__ == "__main__":
    # The model configuration (history length, time features) comes from the
    # reference model, so the encoding is the one CSSLab's engine would use.
    config = load_reference().cfg
    session = onnxruntime.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
    ratings = torch.tensor([RATING], dtype=torch.long).numpy()

    positions = []
    for fen in read_positions(POSITIONS_PATH):
        board = chess.Board(fen)
        tokens = encode(board, config).numpy()
        feeds = {"tokens": tokens, "self_elo": ratings, "oppo_elo": ratings}
        logits = session.run(["policy"], feeds)[0][0]
        answer = answer_from_logits(board, logits)
        positions.append({"fen": fen, "best_move": answer.best_move, "policy_percent": answer.policy})

    reference = {
        "model": f"models/onnx/{CANDIDATE_NAME}.onnx",
        "rating": RATING,
        "produced_by": "maia3 package encoder, ONNX Runtime CPU, softmax over legal moves in float64",
        "positions": positions,
    }
    REFERENCE_PATH.write_text(json.dumps(reference, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote Maia-3's answers on {len(positions)} positions to {REFERENCE_PATH}")
