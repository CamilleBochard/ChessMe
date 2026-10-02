import pytest

from pipeline.verify_maia1 import Answer, compare, read_answer

# What lc0 prints for one position with verbose move stats and `go nodes 1`,
# shortened to three moves.
LC0_OUTPUT = [
    "info string f1b5  (141 ) N:       0 (+ 0) (P: 17.85%) (WL:  -.-----) (D: -.---) (M:  -.-) (Q:  0.01372) (U: 0.31155) (S:  0.32527) (V:  -.----) ",
    "info string f1c4  (139 ) N:       0 (+ 0) (P: 22.44%) (WL:  -.-----) (D: -.---) (M:  -.-) (Q:  0.01372) (U: 0.39154) (S:  0.40526) (V:  -.----) ",
    "info string b1c3  (36  ) N:       0 (+ 0) (P: 22.47%) (WL:  -.-----) (D: -.---) (M:  -.-) (Q:  0.01372) (U: 0.39218) (S:  0.40590) (V:  -.----) ",
    "info string node  ( 0  ) N:       1 (+ 0) (P:  0.00%) (WL:  0.01372) (D: 0.252) (M:  0.0) (Q:  0.01372) (V:  0.01372) ",
    "info depth 1 seldepth 1 time 3 nodes 1 score cp 1 nps 333 tbhits 0 pv b1c3",
    "bestmove b1c3",
]


def test_reads_the_best_move_and_each_move_policy():
    answer = read_answer(LC0_OUTPUT)

    assert answer.best_move == "b1c3"
    assert answer.policy == {"f1b5": 17.85, "f1c4": 22.44, "b1c3": 22.47}


def test_compares_best_moves_and_finds_the_largest_policy_difference():
    reference = Answer(best_move="b1c3", policy={"b1c3": 22.47, "f1c4": 22.44, "f1b5": 17.85})
    converted = Answer(best_move="b1c3", policy={"b1c3": 22.46, "f1c4": 22.47, "f1b5": 17.85})

    comparison = compare(reference, converted)

    assert comparison.same_best_move
    assert comparison.largest_policy_difference == pytest.approx(0.03)
