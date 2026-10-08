import copy
import json

import pytest

torch = pytest.importorskip("torch", reason="needs the models extra: pip install -e '.[models]'")

from pipeline.build_dataset import TEST_FRACTION  # noqa: E402
from pipeline.convert_maia3 import CHECKPOINT_PATH, load_reference  # noqa: E402
from pipeline.dataset import Position, is_held_back  # noqa: E402
from pipeline.fine_tuning import TrainingSettings, fine_tune, split_validation, top_moves  # noqa: E402
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


def test_validation_takes_whole_training_games_and_about_the_share_asked():
    game_ids = [f"lichess:game{number}" for number in range(2000)]
    # Only games the Test Set split left for training ever reach this split.
    training_game_ids = [game_id for game_id in game_ids if not is_held_back(game_id, TEST_FRACTION)]
    positions = []
    for game_id in training_game_ids:
        for ply in (2, 4, 6):
            positions.append(Position(game_id=game_id, source="lichess", ply=ply, phase="opening", fen="unused", move="e2e4"))

    training, validation = split_validation(positions, fraction=0.1)

    training_games = {kept.game_id for kept in training}
    validation_games = {kept.game_id for kept in validation}
    assert training_games.isdisjoint(validation_games)
    assert len(training) + len(validation) == len(positions)
    validation_share = len(validation_games) / len(training_game_ids)
    assert 0.08 < validation_share < 0.12


# Black to move at ply 12 of a Sicilian, past the plies validation leaves out.
SICILIAN_PLY_12 = "r1bqkbnr/pp2pp1p/2np2p1/8/4P3/5N1P/PPP2PP1/RNBQKB1R b KQkq - 0 6"


@needs_weights
def test_fine_tuning_teaches_the_model_the_move_camille_played(base_model):
    model = copy.deepcopy(base_model)
    rook_pawn = Position(
        game_id="lichess:g", source="lichess", ply=12, phase="middlegame", fen=SICILIAN_PLY_12, move="h7h5"
    )
    assert top_moves(model, [SICILIAN_PLY_12], rating=1100) != ["h7h5"]

    settings = TrainingSettings(learning_rate=1e-4, epochs=3, batch_size=1, rating=1100)
    fine_tune(model, training=[rook_pawn] * 4, validation=[rook_pawn], settings=settings)

    assert top_moves(model, [SICILIAN_PLY_12], rating=1100) == ["h7h5"]
