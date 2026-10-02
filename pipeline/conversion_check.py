"""Compares a converted model's answer for a position with its reference's."""

from dataclasses import dataclass
from pathlib import Path

POSITIONS_PATH = Path(__file__).resolve().parent / "verification_positions.txt"


@dataclass(frozen=True)
class Answer:
    best_move: str
    # The probability the network gives each legal move, in percent.
    policy: dict[str, float]


@dataclass(frozen=True)
class Comparison:
    same_best_move: bool
    # In percentage points: 0.03 means one model gave a move 22.44% and the other 22.47%.
    largest_policy_difference: float


def compare(reference: Answer, converted: Answer) -> Comparison:
    """A move present in only one answer counts as 0% in the other, so a
    conversion that changed which moves are considered shows up as a large
    difference.
    """
    all_moves = set(reference.policy) | set(converted.policy)
    largest_difference = 0.0
    for move in all_moves:
        difference = abs(reference.policy.get(move, 0.0) - converted.policy.get(move, 0.0))
        largest_difference = max(largest_difference, difference)

    return Comparison(
        same_best_move=reference.best_move == converted.best_move,
        largest_policy_difference=largest_difference,
    )


def read_positions(path: Path) -> list[str]:
    fens = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line == "" or line.startswith("#"):
            continue
        fen = line.split(" ; ")[0]
        fens.append(fen)
    return fens
