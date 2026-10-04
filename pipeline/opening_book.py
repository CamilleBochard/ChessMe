"""Builds the Opening Book: the positions Camille has reached often enough in
his own games for his reply to be known, mapped to that reply.

The book is written as JSON for the Move-Selection Engine, which consults it
before the Base Model.
"""

from collections import Counter, defaultdict

from pipeline.dataset import Dataset


def build_opening_book(dataset: Dataset, min_occurrences: int) -> dict[str, str]:
    """Maps each position of the training games to the move Camille played there, in UCI form."""
    moves_by_position: dict[str, Counter[str]] = defaultdict(Counter)
    for position in dataset.train:
        key = position_key(position.fen)
        moves_by_position[key][position.move] += 1

    book = {}
    for key, moves in moves_by_position.items():
        times_reached = moves.total()
        if times_reached < min_occurrences:
            continue
        most_played_move, _ = moves.most_common(1)[0]
        book[key] = most_played_move
    return book


def position_key(fen: str) -> str:
    """The FEN without its move counters, so a position reached by another move order is the same entry."""
    fields = fen.split(" ")
    placement_turn_castling_en_passant = fields[:4]
    return " ".join(placement_turn_castling_en_passant)
