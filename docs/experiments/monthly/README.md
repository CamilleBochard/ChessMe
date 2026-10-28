# Move-Matching on each month's new games

Written by `pipeline/new_games_matching.py` at each refresh; the method is in
[the new games' Move-Matching](../new-games-matching.md). Each row measures the
served model and the untrained Maia-3 5M on the games a refresh brought,
before anything was trained on them: Move-Matching of each model's most
likely move, in percent, and the gain, served minus untrained, in points,
each ± one standard error clustered by game. A refresh that brings fewer
than 1,500 of Camille's moves is pooled with the next.

| Games played | Measured on | Phase | Games | Moves | Served model | Untrained model | Gain |
|---|---|---|---|---|---|---|---|
| 2026-09, 2026-10 | 2026-10-27 | All | 114 | 3479 | 55.42 ± 0.76 | 52.97 ± 0.86 | +2.44 ± 0.63 |
|  |  | Opening (1-10) | 114 | 567 | 71.08 ± 2.35 | 57.67 ± 1.87 | +13.40 ± 1.81 |
|  |  | Middlegame (11-30) | 112 | 1067 | 49.77 ± 1.54 | 47.70 ± 1.68 | +2.06 ± 1.19 |
|  |  | Endgame (31+) | 99 | 1845 | 53.88 ± 0.97 | 54.58 ± 1.04 | -0.70 ± 0.72 |
