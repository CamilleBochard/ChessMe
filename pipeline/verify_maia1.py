"""Checks that each converted Maia-1 model plays like its original weights.

Run from the repository root, after python -m pipeline.convert_maia1:

    python -m pipeline.verify_maia1

For every position in verification_positions.txt, lc0 is asked for its move
twice: once running the original weights on its Eigen backend, which is the
reference, and once running the converted ONNX graph through ONNX Runtime.
Both runs use lc0's own board encoding, so any difference comes from the
conversion and nothing else.
"""

import re
import subprocess
from pathlib import Path

from pipeline.conversion_check import POSITIONS_PATH, Answer, compare, read_positions
from pipeline.convert_maia1 import LC0, VERIFY_DIR
from pipeline.fetch_models import MANIFEST_PATH, WEIGHTS_DIR, Candidate, read_manifest

# One line per legal move, e.g. "info string b1c3  (36  ) N: 0 (+ 0) (P: 22.47%) ...".
# The summary line for the position itself is named "node" and is not a move.
MOVE_STATS_LINE = re.compile(r"^info string (?P<move>[a-h][1-8][a-h][1-8][qrbn]?)\s.*\(P:\s*(?P<percent>[\d.]+)%\)")


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


class Lc0:
    """One running lc0 process, asked for the network's choice in one position at a time."""

    def __init__(self, backend: str, weights_path: Path):
        # A softmax temperature of 1 makes the printed policy the network's own
        # probabilities; lc0's default of 1.36 flattens them for its search.
        self.process = subprocess.Popen(
            [
                str(LC0),
                f"--backend={backend}",
                f"--weights={weights_path}",
                "--verbose-move-stats",
                "--policy-softmax-temp=1",
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        self._send("uci")
        self._read_until("uciok")

    def answer(self, fen: str) -> Answer:
        # A new game each time, so no search tree is carried between positions.
        self._send("ucinewgame")
        self._send(f"position fen {fen}")
        self._send("go nodes 1")
        return read_answer(self._read_until("bestmove"))

    def close(self) -> None:
        self._send("quit")
        self.process.wait()

    def _send(self, command: str) -> None:
        self.process.stdin.write(command + "\n")
        self.process.stdin.flush()

    def _read_until(self, prefix: str) -> list[str]:
        lines = []
        while True:
            line = self.process.stdout.readline()
            if line == "":
                raise RuntimeError(f"lc0 exited before printing {prefix!r}")
            line = line.rstrip("\n")
            lines.append(line)
            if line.startswith(prefix):
                return lines


def verify(candidate: Candidate, fens: list[str]) -> None:
    name = candidate.name
    reference = Lc0("eigen", WEIGHTS_DIR / candidate.file_name)
    converted = Lc0("onnx-cpu", VERIFY_DIR / f"{name}.onnx.pb.gz")

    same_best_moves = 0
    largest_difference = 0.0
    for fen in fens:
        reference_answer = reference.answer(fen)
        converted_answer = converted.answer(fen)
        comparison = compare(reference_answer, converted_answer)

        if comparison.same_best_move:
            same_best_moves = same_best_moves + 1
        else:
            print(f"  {name}: {reference_answer.best_move} became {converted_answer.best_move} in {fen}")
        largest_difference = max(largest_difference, comparison.largest_policy_difference)

    reference.close()
    converted.close()
    print(
        f"{name:>12}: same top move in {same_best_moves}/{len(fens)} positions, "
        f"largest policy difference {largest_difference:.2f} percentage points"
    )


if __name__ == "__main__":
    positions = read_positions(POSITIONS_PATH)
    for candidate in read_manifest(MANIFEST_PATH):
        if candidate.name.startswith("maia1-"):
            verify(candidate, positions)
