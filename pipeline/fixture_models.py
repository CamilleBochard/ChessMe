"""Writes the small ONNX models the engine's tests load in place of a Base Model.

Run from the repository root:

    python -m pipeline.fixture_models

A real Base Model is several megabytes and is not committed, so the tests use a
stand-in with the same input and output names as a converted Maia-1 network.
Its policy ignores the position: it always scores the same few moves above all
others. A test can then say which move the engine must return, and checks that
the engine reads the model's output correctly (legality, the board flip for
Black, castling and promotion), without depending on any trained weights.

The files are committed, so this script only needs running again when the
preferences below change.
"""

from pathlib import Path

import numpy
import onnx
from onnx import TensorProto, helper, numpy_helper

from pipeline.convert_maia1 import INPUT_NAME, POLICY_NAME, WDL_NAME
from pipeline.fetch_models import REPOSITORY_ROOT

FIXTURES_DIR = REPOSITORY_ROOT / "src" / "engine" / "fixtures"

# Moves as the network names them: from the side to move's point of view, so
# for Black "e2e4" means e7e5. Castling is the king taking its own rook, and a
# promotion to a queen, rook or bishop carries a suffix. Listed best first.
PREFERENCES = ["a1a8", "a7a8r", "e1h1", "e2e4"]

# The same ONNX versions as the converted Maia-1 files, so the fixture loads in
# exactly the runtimes they do. The onnx package would otherwise stamp its own
# newest file format, which onnxruntime-web may not read yet.
ONNX_OPSET = 17
ONNX_IR_VERSION = 8


def lc0_policy_moves() -> list[str]:
    """The 1858 moves of lc0's policy output, in lc0's order.

    Every queen and knight move from every square, by origin square then
    destination square (a1, b1, ... h1, a2, ...), followed by the promotions to
    queen, rook and bishop from the seventh rank. A promotion to a knight has no
    entry of its own: it shares the plain move's.
    """
    moves = []
    for origin in range(64):
        for destination in range(64):
            if origin != destination and (is_queen_move(origin, destination) or is_knight_move(origin, destination)):
                moves.append(square_name(origin) + square_name(destination))
    for origin_file in range(8):
        for destination_file in range(origin_file - 1, origin_file + 2):
            if 0 <= destination_file < 8:
                for piece in "qrb":
                    moves.append(f"{'abcdefgh'[origin_file]}7{'abcdefgh'[destination_file]}8{piece}")
    return moves


def is_queen_move(origin: int, destination: int) -> bool:
    file_step = abs(origin % 8 - destination % 8)
    rank_step = abs(origin // 8 - destination // 8)
    return file_step == 0 or rank_step == 0 or file_step == rank_step


def is_knight_move(origin: int, destination: int) -> bool:
    file_step = abs(origin % 8 - destination % 8)
    rank_step = abs(origin // 8 - destination // 8)
    return {file_step, rank_step} == {1, 2}


def square_name(square: int) -> str:
    return "abcdefgh"[square % 8] + str(square // 8 + 1)


def fixed_preference_model(preferences: list[str]) -> onnx.ModelProto:
    """A Maia-1-shaped model whose policy scores `preferences` highest, in order.

    The policy is a constant added to zero times the input, so the output has
    the input's batch size while its values never depend on the position.
    """
    policy_moves = lc0_policy_moves()
    scores = numpy.zeros(len(policy_moves), dtype=numpy.float32)
    for rank, move in enumerate(preferences):
        scores[policy_moves.index(move)] = len(preferences) - rank

    nodes = [
        helper.make_node("ReduceSum", [INPUT_NAME, "all_axes"], ["input_sum"], keepdims=0),
        helper.make_node("Unsqueeze", ["input_sum", "column_axis"], ["input_column"]),
        helper.make_node("Mul", ["input_column", "zero"], ["zero_column"]),
        helper.make_node("Add", ["zero_column", "scores"], [POLICY_NAME]),
        helper.make_node("Add", ["zero_column", "wdl"], [WDL_NAME]),
    ]
    constants = [
        numpy_helper.from_array(numpy.array([1, 2, 3], dtype=numpy.int64), "all_axes"),
        numpy_helper.from_array(numpy.array([1], dtype=numpy.int64), "column_axis"),
        numpy_helper.from_array(numpy.array(0, dtype=numpy.float32), "zero"),
        numpy_helper.from_array(scores, "scores"),
        numpy_helper.from_array(numpy.zeros(3, dtype=numpy.float32), "wdl"),
    ]
    graph = helper.make_graph(
        nodes,
        "fixed_preferences",
        inputs=[helper.make_tensor_value_info(INPUT_NAME, TensorProto.FLOAT, ["batch", 112, 8, 8])],
        outputs=[
            helper.make_tensor_value_info(POLICY_NAME, TensorProto.FLOAT, ["batch", len(policy_moves)]),
            helper.make_tensor_value_info(WDL_NAME, TensorProto.FLOAT, ["batch", 3]),
        ],
        initializer=constants,
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", ONNX_OPSET)], ir_version=ONNX_IR_VERSION)
    onnx.checker.check_model(model)
    return model


def write(model: onnx.ModelProto, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    onnx.save(model, str(path))
    print(f"Wrote {path.relative_to(REPOSITORY_ROOT)}")


if __name__ == "__main__":
    write(fixed_preference_model(PREFERENCES), FIXTURES_DIR / "maia1-fixed-preferences.onnx")
