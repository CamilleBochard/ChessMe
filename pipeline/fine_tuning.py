"""Fine-tunes the Base Model on Camille's training games, in PyTorch.

The Base Model's own weights are a PyTorch checkpoint, built and loaded with
CSSLab's maia3 package (pipeline.convert_maia3.load_reference). Positions are
encoded here exactly as the Move-Selection Engine encodes them for the ONNX
copy: the maia3 package's tokenizer, the history filled with copies of the
current position, and one rating for both players.
"""

import chess
import torch
from maia3.dataset import get_legal_moves_mask
from maia3.utils import mirror_move

from pipeline.verify_maia3 import ALL_MOVES, MOVE_INDEX, encode

# Positions run through the network at once. Large enough to keep a CPU or GPU
# busy, small enough to fit an ordinary GPU's memory while training.
BATCH_SIZE = 256


def encode_positions(fens: list[str], config) -> tuple[torch.Tensor, torch.Tensor]:
    """The network's input for each position, and which of its move scores are legal moves.

    Returns tokens of shape (positions, 64, features) and a boolean mask of
    shape (positions, moves the network can name).
    """
    all_tokens = []
    all_legal = []
    for fen in fens:
        board = chess.Board(fen)
        all_tokens.append(encode(board, config)[0])
        all_legal.append(get_legal_moves_mask(board, MOVE_INDEX))
    return torch.stack(all_tokens), torch.stack(all_legal)


def top_moves(model: torch.nn.Module, fens: list[str], rating: int) -> list[str]:
    """The move the network rates most likely in each position, among the legal ones, in UCI form."""
    device = next(model.parameters()).device
    was_training = model.training
    model.eval()

    moves = []
    with torch.no_grad():
        for start in range(0, len(fens), BATCH_SIZE):
            batch_fens = fens[start : start + BATCH_SIZE]
            tokens, legal = encode_positions(batch_fens, model.cfg)
            logits = legal_move_logits(model, tokens.to(device), legal.to(device), rating)
            best_indices = logits.argmax(dim=1).tolist()
            for fen, best_index in zip(batch_fens, best_indices):
                moves.append(_move_name(fen, best_index))

    model.train(was_training)
    return moves


def legal_move_logits(model: torch.nn.Module, tokens: torch.Tensor, legal: torch.Tensor, rating: int) -> torch.Tensor:
    """The network's move scores with every illegal move ruled out.

    An illegal move scores minus infinity, so a softmax over these scores gives
    the probabilities the engine computes, over the legal moves only.
    """
    # The opponent's rating is unknown to the engine, which gives both players
    # the rating the model plays at; training and measuring do the same.
    ratings = torch.full((tokens.shape[0],), rating, dtype=torch.long, device=tokens.device)
    move_logits = model(tokens, ratings, ratings)[0]
    return move_logits.masked_fill(~legal, float("-inf"))


def _move_name(fen: str, move_index: int) -> str:
    """Maia-3 sees every position from the side to move, so Black's moves are named mirrored."""
    move = ALL_MOVES[move_index]
    if chess.Board(fen).turn == chess.BLACK:
        move = mirror_move(move)
    return move
