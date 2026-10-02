# Converting the candidate Base Models to ONNX

The Move-Selection Engine loads its Base Model as an ONNX file. None of the
candidates is published in that format, so each one is converted, and the
conversion is checked rather than trusted: a converted model must choose the
same move as the original on a fixed set of positions.

## Reproducing

```sh
scripts/build_lc0.sh                 # lc0 with an Eigen and an ONNX Runtime backend
python -m pipeline.fetch_models      # weights pinned by URL and sha256
python -m pipeline.convert_maia1     # ONNX files into models/onnx
python -m pipeline.verify_maia1      # comparison on 50 fixed positions
python -m pipeline.model_sizes       # download sizes
```

Versions used for the results below:

| Tool | Version |
|---|---|
| lc0 | v0.32.1, built from source |
| ONNX Runtime (inside lc0) | 1.30.0 |
| ONNX opset | 17 |
| Maia-1 weights | CSSLab/maia-chess at commit `749204c` |

## Maia-1

### Method

Maia-1 is published as lc0 weight files, one per rating bin from 1100 to 1900.
lc0 is therefore both the reference implementation and the converter
(`lc0 leela2onnx`).

lc0 is run twice on each position. The reference run loads the original
weights on lc0's Eigen backend, plain CPU code that never touches ONNX. The
converted run loads the ONNX graph through lc0's ONNX Runtime backend. Both
runs encode the board with the same lc0 code, so a disagreement can only come
from the conversion. Checking that our own TypeScript encoding matches lc0's
is a separate question, left to the engine itself.

Each run uses `go nodes 1`, which disables lc0's search: the move returned is
the one the network ranks highest. The policy softmax temperature is set to 1
so that the printed probabilities are the network's own, not lc0's flattened
search priors.

The 50 positions (`pipeline/verification_positions.txt`) are 13 chosen by hand
and 37 spread evenly through Camille's training games. The hand-picked ones
reach each part of the input that a conversion could get wrong: Black to move
(lc0 flips the board), each castling right, en passant for both sides,
promotion for both sides, a king in check, a high fifty-move counter, and a
position with a single legal move. No position comes from the Test Set.

### Tolerances

A conversion passes when the top move matches in every position. The largest
difference in any move's probability is recorded alongside, in percentage
points, because two moves can be close enough that a rounding difference
would swap them. lc0 prints probabilities to two decimals, so differences
smaller than 0.01 percentage points cannot be seen by this method.

### Results

| Model | Same top move | Largest policy difference |
|---|---|---|
| maia1-1100 | 50/50 | 0.00 pp |
| maia1-1200 | 50/50 | 0.00 pp |
| maia1-1300 | 50/50 | 0.00 pp |
| maia1-1400 | 50/50 | 0.00 pp |
| maia1-1500 | 50/50 | 0.01 pp |
| maia1-1600 | 50/50 | 0.00 pp |
| maia1-1700 | 50/50 | 0.00 pp |
| maia1-1800 | 50/50 | 0.02 pp |
| maia1-1900 | 50/50 | 0.00 pp |

All nine conversions pass. The largest difference, 0.02 percentage points, is
at the limit of what lc0 prints and is consistent with float32 arithmetic
done in a different order by two backends.

To confirm the check can fail, the 1100 reference was compared against the
1900 conversion. Only 32 of 50 top moves matched, with a largest difference
of 57.99 percentage points. The method does detect a wrong model. That two
models 800 rating points apart still agree on 64% of moves also shows how
many positions have one obvious move, which is worth remembering when reading
Move-Matching figures.

One near tie seen during the check: after 1.e4 e5 2.Nf3 Nc6, Maia-1 1300 gives
Nc3 22.47% and Bc4 22.44%. The top move there is decided by 0.03 percentage
points.

### Sizes

The original `.pb.gz` files are about 1.3 MB because lc0 stores each weight in
16 bits and gzips the file. The ONNX files store 32-bit floats, hence the
larger raw size. All nine ONNX files have the same raw size because they share
one architecture (6 residual blocks of 64 filters) and differ only in their
weight values.

| Model | ONNX | gzip -9 | brotli -11 |
|---|---|---|---|
| maia1-1100 | 3.48 MB | 2.57 MB | 2.37 MB |
| maia1-1200 | 3.48 MB | 2.43 MB | 2.28 MB |
| maia1-1300 | 3.48 MB | 2.44 MB | 2.30 MB |
| maia1-1400 | 3.48 MB | 2.59 MB | 2.39 MB |
| maia1-1500 | 3.48 MB | 2.46 MB | 2.31 MB |
| maia1-1600 | 3.48 MB | 2.57 MB | 2.38 MB |
| maia1-1700 | 3.48 MB | 2.56 MB | 2.37 MB |
| maia1-1800 | 3.48 MB | 2.51 MB | 2.34 MB |
| maia1-1900 | 3.48 MB | 2.47 MB | 2.32 MB |

`leela2onnx` can also write 16-bit floats (`--onnx-data-type=f16`), which
would roughly halve the raw size. That variant has not been converted or
verified.
