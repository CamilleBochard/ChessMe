"""Checks that each converted Maia-1 model plays like its original weights."""

import re
from dataclasses import dataclass

# One line per legal move, e.g. "info string b1c3  (36  ) N: 0 (+ 0) (P: 22.47%) ...".
# The summary line for the position itself is named "node" and is not a move.
MOVE_STATS_LINE = re.compile(r"^info string (?P<move>[a-h][1-8][a-h][1-8][qrbn]?)\s.*\(P:\s*(?P<percent>[\d.]+)%\)")


@dataclass(frozen=True)
class Answer:
    best_move: str
    # The network's prior for each legal move, in percent, as lc0 prints it.
    policy: dict[str, float]


@dataclass(frozen=True)
class Comparison:
    same_best_move: bool
    # In percentage points: 0.03 means one model gave a move 22.44% and the other 22.47%.
    largest_policy_difference: float


def compare(reference: Answer, converted: Answer) -> Comparison:
    """Compares a converted model's answer for one position with the reference's.

    A move present in only one answer counts as 0% in the other, so a
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


def read_answer(lines: list[str]) -> Answer:
    """Reads lc0's reply to one `go nodes 1` with verbose move stats switched on."""
    best_move = None
    policy = {}
    for line in lines:
        match = MOVE_STATS_LINE.match(line)
        if match:
            policy[match["move"]] = float(match["percent"])
        elif line.startswith("bestmove "):
            best_move = line.split()[1]
    return Answer(best_move=best_move, policy=policy)
