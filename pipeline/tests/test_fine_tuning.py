import json

import pytest

torch = pytest.importorskip("torch", reason="needs the models extra: pip install -e '.[models]'")

from pipeline.convert_maia3 import CHECKPOINT_PATH, load_reference  # noqa: E402
from pipeline.fine_tuning import top_moves  # noqa: E402
from pipeline.fixture_models import FIXTURES_DIR  # noqa: E402

# The weights are downloaded by python -m pipeline.fetch_models and not
# committed, so on a checkout without them these tests are skipped.
needs_weights = pytest.mark.skipif(not CHECKPOINT_PATH.exists(), reason=f"no Base Model weights at {CHECKPOINT_PATH}")


@pytest.fixture(scope="module")
def base_model():
    return load_reference()


@needs_weights
def test_the_base_model_in_pytorch_plays_the_engine_s_reference_moves(base_model):
    # Recorded by python -m pipeline.maia3_reference from the ONNX file the
    # browser runs; the engine's own encoding is checked against the same file.
    reference = json.loads((FIXTURES_DIR / "maia3-5m-reference.json").read_text(encoding="utf-8"))
    fens = [recorded["fen"] for recorded in reference["positions"]]
    expected_moves = [recorded["best_move"] for recorded in reference["positions"]]

    assert top_moves(base_model, fens, rating=reference["rating"]) == expected_moves
