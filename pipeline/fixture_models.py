"""Writes the small ONNX models the engine's tests load in place of a Base Model.

Run from the repository root:

    python -m pipeline.fixture_models

A real Base Model is several megabytes and is not committed, so the tests use
stand-ins with the same input and output names as a converted Maia-1 or Maia-3
network. Their policy ignores the position: it always scores the same few moves above all
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

from maia3.utils import get_all_possible_moves

from pipeline.convert_maia1 import INPUT_NAME, POLICY_NAME, WDL_NAME
from pipeline.fetch_models import REPOSITORY_ROOT

FIXTURES_DIR = REPOSITORY_ROOT / "src" / "engine" / "fixtures"

# The same preferences for both families, best first, each written as that
# network names the move. Both see the board from the side to move, so for
# Black "e2e4" means e7e5. lc0 names castling as the king taking its own rook;
# Maia-3 names it as the king's two-square step.
MAIA1_PREFERENCES = ["a1a8", "a7a8r", "e1h1", "e2e4"]
MAIA3_PREFERENCES = ["a1a8", "a7a8r", "e1g1", "e2e4"]

# The same ONNX versions as the converted files of each family, so a fixture
# loads in exactly the runtimes they do. The onnx package would otherwise stamp
# its own newest file format, which onnxruntime-web may not read yet.
MAIA1_ONNX_VERSIONS = {"opset": 17, "ir_version": 8}
MAIA3_ONNX_VERSIONS = {"opset": 18, "ir_version": 10}


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


def preference_scores(policy_moves: list[str], preferences: list[str]) -> numpy.ndarray:
    """One score per policy entry: the preferred moves highest, in order, every other move 0."""
    scores = numpy.zeros(len(policy_moves), dtype=numpy.float32)
    for rank, move in enumerate(preferences):
        scores[policy_moves.index(move)] = len(preferences) - rank
    return scores


def fixed_policy_model(
    position_input: onnx.ValueInfoProto,
    other_inputs: list[onnx.ValueInfoProto],
    policy_name: str,
    scores: numpy.ndarray,
    other_outputs: dict[str, int],
    versions: dict[str, int],
) -> onnx.ModelProto:
    """A model whose policy is always `scores`, whatever the position.

    The policy is a constant added to zero times the summed position input, so
    the output has the input's batch size while its values never depend on the
    position. `other_inputs` are declared and ignored; `other_outputs` are
    zeros of the given width.
    """
    position_axes = list(range(1, len(position_input.type.tensor_type.shape.dim)))
    nodes = [
        helper.make_node("ReduceSum", [position_input.name, "position_axes"], ["input_sum"], keepdims=0),
        helper.make_node("Unsqueeze", ["input_sum", "column_axis"], ["input_column"]),
        helper.make_node("Mul", ["input_column", "zero"], ["zero_column"]),
        helper.make_node("Add", ["zero_column", "scores"], [policy_name]),
    ]
    constants = [
        numpy_helper.from_array(numpy.array(position_axes, dtype=numpy.int64), "position_axes"),
        numpy_helper.from_array(numpy.array([1], dtype=numpy.int64), "column_axis"),
        numpy_helper.from_array(numpy.array(0, dtype=numpy.float32), "zero"),
        numpy_helper.from_array(scores, "scores"),
    ]
    outputs = [helper.make_tensor_value_info(policy_name, TensorProto.FLOAT, ["batch", len(scores)])]
    for name, width in other_outputs.items():
        nodes.append(helper.make_node("Add", ["zero_column", f"{name}_zeros"], [name]))
        constants.append(numpy_helper.from_array(numpy.zeros(width, dtype=numpy.float32), f"{name}_zeros"))
        outputs.append(helper.make_tensor_value_info(name, TensorProto.FLOAT, ["batch", width]))

    graph = helper.make_graph(
        nodes, "fixed_preferences", inputs=[position_input, *other_inputs], outputs=outputs, initializer=constants
    )
    model = helper.make_model(
        graph, opset_imports=[helper.make_opsetid("", versions["opset"])], ir_version=versions["ir_version"]
    )
    onnx.checker.check_model(model)
    return model


def maia1_fixture() -> onnx.ModelProto:
    """Shaped like a converted Maia-1 network: 112 planes in, lc0's 1858 moves out."""
    return fixed_policy_model(
        position_input=helper.make_tensor_value_info(INPUT_NAME, TensorProto.FLOAT, ["batch", 112, 8, 8]),
        other_inputs=[],
        policy_name=POLICY_NAME,
        scores=preference_scores(lc0_policy_moves(), MAIA1_PREFERENCES),
        other_outputs={WDL_NAME: 3},
        versions=MAIA1_ONNX_VERSIONS,
    )


def maia3_fixture() -> onnx.ModelProto:
    """Shaped like the converted Maia-3 network: square tokens and two ratings in,
    Maia-3's 4352 moves out. The move list is taken from CSSLab's own code."""
    return fixed_policy_model(
        position_input=helper.make_tensor_value_info("tokens", TensorProto.FLOAT, ["batch", 64, 97]),
        other_inputs=[
            helper.make_tensor_value_info("self_elo", TensorProto.INT64, ["batch"]),
            helper.make_tensor_value_info("oppo_elo", TensorProto.INT64, ["batch"]),
        ],
        policy_name="policy",
        scores=preference_scores(get_all_possible_moves(), MAIA3_PREFERENCES),
        other_outputs={"value": 3},
        versions=MAIA3_ONNX_VERSIONS,
    )


def write(model: onnx.ModelProto, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    onnx.save(model, str(path))
    print(f"Wrote {path.relative_to(REPOSITORY_ROOT)}")


if __name__ == "__main__":
    write(maia1_fixture(), FIXTURES_DIR / "maia1-fixed-preferences.onnx")
    write(maia3_fixture(), FIXTURES_DIR / "maia3-fixed-preferences.onnx")
