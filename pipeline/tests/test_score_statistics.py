from statistics import mean

from pipeline.score_statistics import area_under_curve, bootstrap_interval


def test_area_under_curve_is_the_share_of_pairs_the_higher_score_ranks_correctly():
    # Four pairs of one Camille game and one other game:
    # 0.9 > 0.5, 0.9 > 0.1 and 0.4 > 0.1 are ranked right, 0.4 < 0.5 wrong.
    camille_scores = [0.9, 0.4]
    other_scores = [0.5, 0.1]

    assert area_under_curve(camille_scores, other_scores) == 0.75


def test_area_under_curve_counts_a_tie_as_half_right():
    assert area_under_curve([0.5], [0.5, 0.2]) == 0.75


def test_a_figure_that_every_game_agrees_on_has_no_spread():
    scores = [0.3] * 10

    assert bootstrap_interval([scores], mean) == (0.3, 0.3)


def test_the_interval_of_a_mean_spans_about_two_standard_errors_each_side():
    # Half the games score 0 and half 1: the mean is 0.5 and its standard
    # error is sqrt(0.5 * 0.5 / 100) = 0.05, so a 95% interval runs from
    # about 0.5 - 1.96 * 0.05 = 0.40 to 0.60.
    scores = [0.0] * 50 + [1.0] * 50

    low, high = bootstrap_interval([scores], mean)

    assert 0.38 < low < 0.42
    assert 0.58 < high < 0.62


def test_resamples_each_group_on_its_own():
    # The difference of two means, each group resampled within itself. Two
    # groups that never vary leave no spread, however they differ.
    def difference(first, second):
        return mean(first) - mean(second)

    assert bootstrap_interval([[0.75] * 20, [0.25] * 5], difference) == (0.5, 0.5)
