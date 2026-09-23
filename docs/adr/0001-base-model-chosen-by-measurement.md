# Choose the Base Model by measuring move-matching, not by rating conversion

Camille is rated ~750 on Chess.com and ~1331 on Lichess: the same player on two
scales 580 points apart. Maia is trained on Lichess games, so its rating input
speaks the Lichess scale, and an early version of this decision picked 800 —
a Chess.com number read on a Lichess ruler, which would have shipped a Base
Model several hundred points too weak. Rather than replace one conversion guess
with another, v1 measures: run several candidate Base Models against the Test Set
and keep whichever reproduces Camille's moves most often.

## Consequences

The first real experiment of the project is the sweep itself, and it reuses the
evaluation harness v1 needs anyway. Until it runs, the Base Model is undecided;
the Move-Selection Engine therefore treats it as swappable, loading an ONNX file
rather than depending on any one model's shape.

The candidates differ in ways that matter beyond accuracy: Maia-1's bins are
3.3 MB under GPL-3.0 and export to ONNX without difficulty, while Maia-3 is
~21 MB with an ambiguous weights licence and custom attention blocks. A small
accuracy loss may be worth taking for the smaller, simpler, cleanly-licensed
file, and that trade-off gets made once the numbers exist.

## Still settled regardless of the outcome

v1 trains no network. The Maia-individual paper (KDD 2022) measured that
fine-tuning on this little data degrades move-matching below the untrained
baseline — 49.7% against 52.7% at the 1,000-game cohort, which held more training
games than Camille has after the 2025-06 cut. Fine-tuning is retained as a later
experiment whose expected result is negative and whose value is the measurement.

Training a Base Model from scratch on public Lichess games was considered and
rejected for v1: the only available GPU is an RX 7900 XT on an OS without ROCm
support, and it would add months before anything ships.
