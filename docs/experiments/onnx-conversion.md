# Converting the candidate Base Models to ONNX

The Move-Selection Engine loads its Base Model as an ONNX file. None of the
candidates is published in that format, so each one is converted, and the
conversion is checked rather than trusted: a converted model must choose the
same move as the original on a fixed set of positions.

## Reproducing

```sh
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -e ".[dev,models]"
scripts/build_lc0.sh                 # lc0 with an Eigen and an ONNX Runtime backend
python -m pipeline.fetch_models      # weights pinned by URL and sha256
python -m pipeline.convert_maia1     # ONNX files into models/onnx
python -m pipeline.convert_maia3
python -m pipeline.verify_maia1      # comparison on 50 fixed positions
python -m pipeline.verify_maia3
python -m pipeline.model_sizes       # download sizes
npm run check-models                 # every file runs under onnxruntime-web
```

Versions used for the results below:

| Tool | Version |
|---|---|
| lc0 | v0.32.1, built from source |
| ONNX Runtime (inside lc0, and the Python package) | 1.30.0 |
| onnxruntime-web | 1.30.0 |
| PyTorch | 2.14.1, CPU build |
| ONNX opset | 17 for Maia-1, 18 for Maia-3 |
| Maia-1 weights | CSSLab/maia-chess at commit `749204c` |
| Maia-3 weights | UofTCSSLab/Maia3-5M at commit `b6559de` |
| Maia-3 reference code | CSSLab/maia3 at commit `1e13597` |

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

## Maia-3 5M

### Why this size

Maia-3 is published in three sizes, named after their number of weights. At
four bytes per weight the checkpoints are 21 MB (5M), 92 MB (23M) and 316 MB
(79M). Only the smallest is a reasonable download for a portfolio page read on
a phone, so it is the only Maia-3 candidate.

Unlike Maia-1, Maia-3 takes the player's rating and the opponent's rating as
inputs. One file covers every rating, where Maia-1 needs one per 100-point bin.

### Method

The reference implementation is CSSLab's `maia3` Python package. The model is
built and loaded exactly as CSSLab's own engine does it, and exported with
`torch.onnx.export`.

The export did not work as published. Both of torch's exporters fail on Maia-3:

- The current exporter (`dynamo=True`) fails while breaking torch's
  `MultiheadAttention` layer into elementary operations, on a reshape of a
  tensor whose memory layout it cannot prove compatible. Disabling the
  layer's fused fast path and exporting with a batch of two did not help.
- The older TorchScript exporter fails on RMSNorm, which ONNX only has as an
  operator from opset 23, beyond what that exporter can write.

The export therefore runs on a copy of the model in which every attention
layer is replaced by the same calculation written out step by step (input
projection, scaled scores plus Maia-3's square-pair bias, softmax, output
projection), reading the original layer's weights. The rewrite is not
trusted on its own: the check below compares the ONNX file against the
unmodified model.

Each of the same 50 positions is encoded once with the `maia3` package's
encoder, and the same tensors go to the PyTorch model and to the ONNX file run
by ONNX Runtime. Only a FEN is known for each position, so the eight-position
history Maia-3 reads is filled with the current position, as CSSLab's engine
does when it is given no moves. The check runs with both ratings set to each
of 1100, 1300, 1500, 1700 and 1900.

### Tolerances

The pass rule is the same as for Maia-1: the same top move in every position.
Here the probabilities are compared at full precision, not as printed by an
engine, so the recorded differences are real measurements rather than
rounding. The largest difference in the raw scores before the softmax is
recorded too.

### Results

| Rating | Same top move | Largest policy difference | Largest raw score difference |
|---|---|---|---|
| 1100 | 50/50 | 0.000197 pp | 1.91e-05 |
| 1300 | 50/50 | 0.000380 pp | 2.19e-05 |
| 1500 | 50/50 | 0.000355 pp | 2.00e-05 |
| 1700 | 50/50 | 0.000253 pp | 2.38e-05 |
| 1900 | 50/50 | 0.000217 pp | 1.91e-05 |

The conversion passes at every rating. Differences of about 2e-05 in raw
scores are what float32 arithmetic in a different order produces; they move
no probability by more than 0.0004 percentage points.

As with Maia-1, the check was run once against a deliberate mismatch, the
reference at 1100 against the conversion at 1900: 39 of 50 top moves matched,
with a largest difference of 29.23 percentage points. Within one model, 800
rating points change the top move in 11 of these 50 positions.

### Size

| Model | ONNX | gzip -9 | brotli -11 |
|---|---|---|---|
| maia3-5m | 22.20 MB | 19.43 MB | 19.17 MB |

Maia-3's file barely compresses, which is usual for trained 32-bit weights.
The visitor's download is therefore about eight times that of a Maia-1
candidate (19.2 MB against about 2.3 MB with Brotli). Whether Maia-3's
Move-Matching on Camille's games justifies that is for the sweep to show.

## Loading in the browser runtime

The checks above run ONNX Runtime's native build. Visitors run its
WebAssembly build, onnxruntime-web, which could still reject a file's format
version, an operator or an input type. `npm run check-models` loads every
converted file with onnxruntime-web 1.30.0 under Node and runs it once on an
all-zero input. All ten files load and run:

| Model | Inputs | Outputs |
|---|---|---|
| Maia-1 (each bin) | `/input/planes` float32 [batch, 112, 8, 8] | `/output/policy` [batch, 1858], `/output/wdl` [batch, 3] |
| maia3-5m | `tokens` float32 [batch, 64, 97], `self_elo` int64 [batch], `oppo_elo` int64 [batch] | `policy` [batch, 4352], `value` [batch, 3], `ponder` [batch] |

This proves the files load and run, not that the WebAssembly build computes
the same numbers; that is checked once the engine feeds them real positions.
