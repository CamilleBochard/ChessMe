"""Fine-tunes the Base Model on Camille's training games, in PyTorch.

The Base Model's own weights are a PyTorch checkpoint, built and loaded with
CSSLab's maia3 package (pipeline.convert_maia3.load_reference). Positions are
encoded here exactly as the Move-Selection Engine encodes them for the ONNX
copy: the maia3 package's tokenizer, the history filled with copies of the
current position, and one rating for both players.
"""

import copy
import random
from collections.abc import Callable
from dataclasses import dataclass

import chess
import torch
import torch.nn.functional as F
from maia3.dataset import get_legal_moves_mask
from maia3.utils import mirror_move

from pipeline.dataset import Position, is_held_back
from pipeline.move_matching import move_matching_report
from pipeline.verify_maia3 import ALL_MOVES, MOVE_INDEX, encode

# Positions run through the network at once. Large enough to keep a CPU or GPU
# busy, small enough to fit an ordinary GPU's memory while training.
BATCH_SIZE = 256


@dataclass(frozen=True)
class TrainingSettings:
    # How far each step moves the weights. Too high and a step undoes what
    # the Base Model learned from millions of games; too low and nothing moves.
    learning_rate: float
    # Passes over the training positions.
    epochs: int
    # Positions per step: each step follows the average gradient of a batch.
    batch_size: int
    # The rating given to the network for both players, as the engine does.
    rating: int
    # Fixes the order positions are shuffled in, so a run can be repeated.
    seed: int = 0


@dataclass(frozen=True)
class TrainingRun:
    # Validation Move-Matching after ply 10 before training (index 0) and
    # after each epoch.
    validation_by_epoch: list[float]
    # The epoch whose weights the model was left with, counted from 1.
    best_epoch: int


class Adapter(torch.nn.Module):
    """A small correction added to what the trunk says about each square.

    The trunk's description of a square (256 numbers) is squeezed through
    `width` numbers and widened back, and the result is added to it. The
    widening starts at zero, so an untrained adapter adds nothing and the
    model answers exactly as the Base Model does.
    """

    def __init__(self, model_width: int, width: int):
        super().__init__()
        self.narrow = torch.nn.Linear(model_width, width)
        self.widen = torch.nn.Linear(width, model_width)
        torch.nn.init.zeros_(self.widen.weight)
        torch.nn.init.zeros_(self.widen.bias)

    def forward(self, squares: torch.Tensor) -> torch.Tensor:
        correction = self.widen(F.gelu(self.narrow(squares)))
        return squares + correction


class AdaptedTrunk(torch.nn.Module):
    """Maia-3's trunk followed by an adapter, in the place the trunk had in the model."""

    def __init__(self, trunk: torch.nn.Module, adapter: Adapter):
        super().__init__()
        self.trunk = trunk
        self.adapter = adapter

    def forward(self, squares: torch.Tensor) -> torch.Tensor:
        return self.adapter(self.trunk(squares))


def with_adapter(model: torch.nn.Module, width: int) -> torch.nn.Module:
    """A copy of the model with an adapter between its trunk and the heads that read it.

    Every weight of the copy is frozen except the adapter's, so fine-tuning it
    trains the adapter alone.
    """
    adapted = copy.deepcopy(model)
    for parameter in adapted.parameters():
        parameter.requires_grad = False
    adapter = Adapter(model_width=adapted.cfg.dim_vit, width=width).to(next(adapted.parameters()).device)
    adapted.transformer = AdaptedTrunk(adapted.transformer, adapter)
    return adapted


def fine_tune(
    model: torch.nn.Module,
    training: list[Position],
    validation: list[Position],
    settings: TrainingSettings,
    report_epoch: Callable[[int, float], None] | None = None,
) -> TrainingRun:
    """Trains the model on Camille's moves and leaves it with the epoch that matched validation best.

    Only parameters that require gradients are trained, so a caller can freeze
    part of the model. The loss is the cross-entropy of Camille's move among the
    legal moves: the lower it is, the more probability the network gives the
    move he played. After every epoch the model plays the validation positions,
    and the weights of the epoch with the best Move-Matching after ply 10 are
    kept: past that point, further epochs learn his particular training games
    rather than his play. report_epoch, when given, is called with each epoch
    and its validation score as soon as it is known; epoch 0 is the untrained
    model. Epoch 0 is reported but never kept, even when no epoch beats it:
    keeping it would hand back the Base Model and leave fine-tuning unmeasured.
    """
    device = next(model.parameters()).device
    trained_parameters = [parameter for parameter in model.parameters() if parameter.requires_grad]
    # No weight decay: it pulls weights toward zero, which suits training from
    # scratch, while here the weights worth staying near are the Base Model's.
    # Keeping the best epoch on validation is what guards against overfitting.
    optimizer = torch.optim.AdamW(trained_parameters, lr=settings.learning_rate, weight_decay=0.0)
    shuffler = random.Random(settings.seed)

    tokens, legal = encode_positions([position.fen for position in training], model.cfg)
    targets = torch.tensor([_move_index(position.fen, position.move) for position in training])

    validation_by_epoch = [_validation_move_matching(model, validation, settings.rating)]
    if report_epoch is not None:
        report_epoch(0, validation_by_epoch[0])
    best_state = None
    best_score = None
    best_epoch = 0
    for epoch in range(1, settings.epochs + 1):
        model.train()
        order = list(range(len(training)))
        shuffler.shuffle(order)
        for start in range(0, len(order), settings.batch_size):
            batch = torch.tensor(order[start : start + settings.batch_size])
            logits = legal_move_logits(model, tokens[batch].to(device), legal[batch].to(device), settings.rating)
            loss = F.cross_entropy(logits, targets[batch].to(device))
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

        score = _validation_move_matching(model, validation, settings.rating)
        validation_by_epoch.append(score)
        if report_epoch is not None:
            report_epoch(epoch, score)
        if best_score is None or score > best_score:
            best_score = score
            best_epoch = epoch
            best_state = copy.deepcopy(model.state_dict())

    model.load_state_dict(best_state)
    model.eval()
    return TrainingRun(validation_by_epoch=validation_by_epoch, best_epoch=best_epoch)


def _validation_move_matching(model: torch.nn.Module, validation: list[Position], rating: int) -> float:
    moves = top_moves(model, [position.fen for position in validation], rating)
    after_ply_10 = move_matching_report(validation, moves).after_ply_10
    if after_ply_10.positions == 0:
        return float("nan")
    return after_ply_10.matched / after_ply_10.positions


def split_validation(positions: list[Position], fraction: float) -> tuple[list[Position], list[Position]]:
    """Sets about `fraction` of the training games aside to judge training by, keeping each game whole.

    Training needs games of Camille's it does not learn from, to tell when it
    starts learning his particular games rather than his play. The Test Set
    cannot serve: it is kept for the final measurement alone. A game is set
    aside by the same kind of hash as the Test Set split, but salted, since
    the unsalted hash of every training game is by construction above the
    Test Set's threshold and would set nothing aside.
    """
    training = []
    validation = []
    for position in positions:
        if is_held_back(f"validation:{position.game_id}", fraction):
            validation.append(position)
        else:
            training.append(position)
    return training, validation


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


def _move_index(fen: str, move: str) -> int:
    """Where the network scores a move, named as it names moves: from the side to move."""
    if chess.Board(fen).turn == chess.BLACK:
        move = mirror_move(move)
    return MOVE_INDEX[move]


def _move_name(fen: str, move_index: int) -> str:
    """Maia-3 sees every position from the side to move, so Black's moves are named mirrored."""
    move = ALL_MOVES[move_index]
    if chess.Board(fen).turn == chess.BLACK:
        move = mirror_move(move)
    return move
