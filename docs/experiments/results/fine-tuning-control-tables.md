Move-Matching on Camille's Test Set, in percent, ± one standard error clustered by game.

| Model | Opening (1-10) | Middlegame (11-30) | Endgame (31+) | After ply 10 | All |
|---|---|---|---|---|---|
| Baseline | 51.30 ± 1.46 | 47.60 ± 1.06 | 50.65 ± 0.94 | 49.53 ± 0.67 | 49.82 ± 0.57 |
| Fine-tuned on Camille's games | 66.26 ± 1.61 | 50.85 ± 1.09 | 51.88 ± 1.00 | 51.50 ± 0.69 | 53.89 ± 0.62 |
| Fine-tuned on other players' games | 52.70 ± 1.41 | 47.51 ± 1.06 | 49.93 ± 1.00 | 49.04 ± 0.71 | 49.63 ± 0.61 |

Gains on the same positions, in percentage points, ± one standard error.

| Gain | Opening (1-10) | Middlegame (11-30) | Endgame (31+) | After ply 10 | All |
|---|---|---|---|---|---|
| Trained on Camille's games, over the Baseline | +14.96 ± 1.24 | +3.25 ± 0.69 | +1.23 ± 0.47 | +1.97 ± 0.37 | +4.08 ± 0.38 |
| Trained on other players' games, over the Baseline | +1.39 ± 0.61 | -0.09 ± 0.46 | -0.72 ± 0.38 | -0.49 ± 0.28 | -0.18 ± 0.25 |
| Trained on Camille's games, over other players' | +13.57 ± 1.21 | +3.34 ± 0.74 | +1.94 ± 0.52 | +2.46 ± 0.42 | +4.26 ± 0.40 |
