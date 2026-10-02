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
