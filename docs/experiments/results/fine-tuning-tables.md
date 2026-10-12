Move-Matching on the Test Set, in percent, ± one standard error clustered by game.

| Model | Opening (1-10) | Middlegame (11-30) | Endgame (31+) | After ply 10 | All |
|---|---|---|---|---|---|
| Baseline | 51.30 ± 1.46 | 47.60 ± 1.06 | 50.65 ± 0.94 | 49.53 ± 0.67 | 49.82 ± 0.57 |
| Fine-tuned, full | 66.26 ± 1.61 | 50.85 ± 1.09 | 51.88 ± 1.00 | 51.50 ± 0.69 | 53.89 ± 0.62 |
| Fine-tuned, adapter | 59.74 ± 1.47 | 48.06 ± 1.06 | 51.03 ± 0.97 | 49.93 ± 0.69 | 51.52 ± 0.60 |

Gain over the Baseline on the same positions, in percentage points, ± one standard error.

| Variant | Opening (1-10) | Middlegame (11-30) | Endgame (31+) | After ply 10 | All | Beats the Baseline |
|---|---|---|---|---|---|---|
| full | +14.96 ± 1.24 | +3.25 ± 0.69 | +1.23 ± 0.47 | +1.97 ± 0.37 | +4.08 ± 0.38 | yes |
| adapter | +8.43 ± 0.98 | +0.46 ± 0.65 | +0.37 ± 0.44 | +0.40 ± 0.37 | +1.71 ± 0.36 | no |

| Variant | Weights trained | Per training position | Learning rate | Epoch |
|---|---|---|---|---|
| full | 5,230,084 | 241.70 | 1e-05 | 1 |
| adapter | 8,464 | 0.39 | 0.0001 | 5 |
