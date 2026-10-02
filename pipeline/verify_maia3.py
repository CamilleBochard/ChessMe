"""Checks that the converted Maia-3 model plays like CSSLab's reference.

Run from the repository root, after python -m pipeline.convert_maia3:

    python -m pipeline.verify_maia3

Each position in verification_positions.txt is encoded once, with the maia3
package's own encoder, and the same tensors are given to the unmodified
PyTorch model and to the ONNX file run by ONNX Runtime. Any difference comes
from the conversion and nothing else.

Maia-3 takes the rating as an input, so the conversion is checked at several
ratings across the range the candidates cover. Only a FEN is known for each
position, so the history Maia-3 reads is filled with the current position,
as CSSLab's engine does when it is given no moves.
"""

from collections import deque

import chess
import numpy
import onnxruntime
import torch
from maia3.dataset import get_historical_tokens, get_legal_moves_mask, tokenize_board
from maia3.utils import get_all_possible_moves, mirror_move

from pipeline.conversion_check import POSITIONS_PATH, Answer, compare, read_positions
from pipeline.convert_maia3 import CANDIDATE_NAME, ONNX_PATH, load_reference

RATINGS = [1100, 1300, 1500, 1700, 1900]

ALL_MOVES = get_all_possible_moves()
MOVE_INDEX = {move: index for index, move in enumerate(ALL_MOVES)}


def encode(board: chess.Board, config) -> torch.Tensor:
    history = deque([tokenize_board(board)])
    tokens = get_historical_tokens(history, config, base=0.0, inc=0.0, clk_left_before=0.0, clk_ponder=0.0)
    return tokens.unsqueeze(0)


def answer_from_logits(board: chess.Board, logits: numpy.ndarray) -> Answer:
    """Turns one position's move scores into probabilities over its legal moves.

    Maia-3 sees every position from the side to move, so for Black its move
    names are mirrored and are mirrored back here.
    """
    legal = get_legal_moves_mask(board, MOVE_INDEX).numpy()
    legal_logits = numpy.where(legal, logits.astype(numpy.float64), -numpy.inf)
    shifted = numpy.exp(legal_logits - legal_logits.max())
    probabilities = shifted / shifted.sum()

    policy = {}
    for index in numpy.flatnonzero(legal):
        move = ALL_MOVES[index]
        if board.turn == chess.BLACK:
            move = mirror_move(move)
        policy[move] = float(probabilities[index] * 100)

    best_move = max(policy, key=policy.get)
    return Answer(best_move=best_move, policy=policy)


if __name__ == "__main__":
    reference = load_reference()
    converted = onnxruntime.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
    fens = read_positions(POSITIONS_PATH)

    for rating in RATINGS:
        elos = torch.tensor([rating], dtype=torch.long)
        same_best_moves = 0
        largest_difference = 0.0
        largest_logit_difference = 0.0
        for fen in fens:
            board = chess.Board(fen)
            tokens = encode(board, reference.cfg)

            with torch.no_grad():
                reference_logits = reference(tokens, elos, elos)[0][0].numpy()
            feeds = {"tokens": tokens.numpy(), "self_elo": elos.numpy(), "oppo_elo": elos.numpy()}
            converted_logits = converted.run(["policy"], feeds)[0][0]

            reference_answer = answer_from_logits(board, reference_logits)
            converted_answer = answer_from_logits(board, converted_logits)
            comparison = compare(reference_answer, converted_answer)

            if comparison.same_best_move:
                same_best_moves = same_best_moves + 1
            else:
                print(f"  {rating}: {reference_answer.best_move} became {converted_answer.best_move} in {fen}")
            largest_difference = max(largest_difference, comparison.largest_policy_difference)
            logit_difference = float(numpy.abs(reference_logits - converted_logits).max())
            largest_logit_difference = max(largest_logit_difference, logit_difference)

        print(
            f"{CANDIDATE_NAME} at {rating}: same top move in {same_best_moves}/{len(fens)} positions, "
            f"largest policy difference {largest_difference:.6f} percentage points, "
            f"largest raw score difference {largest_logit_difference:.2e}"
        )
