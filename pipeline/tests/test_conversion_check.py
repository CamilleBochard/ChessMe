import pytest

from pipeline.conversion_check import Answer, compare


def test_compares_best_moves_and_finds_the_largest_policy_difference():
    reference = Answer(best_move="b1c3", policy={"b1c3": 22.47, "f1c4": 22.44, "f1b5": 17.85})
    converted = Answer(best_move="b1c3", policy={"b1c3": 22.46, "f1c4": 22.47, "f1b5": 17.85})

    comparison = compare(reference, converted)

    assert comparison.same_best_move
    assert comparison.largest_policy_difference == pytest.approx(0.03)
