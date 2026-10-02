"""Converts the Maia-3 candidate to ONNX.

Run from the repository root, after python -m pipeline.fetch_models:

    python -m pipeline.convert_maia3

The model is built with CSSLab's maia3 package, the reference implementation,
and exported with torch.onnx into models/onnx/maia3-5m.onnx.
"""

import copy
import math

import torch
import torch.nn.functional as F
from maia3.model_registry import apply_model_config, resolve_model_spec
from maia3.uci import load_model, parse_args

from pipeline.convert_maia1 import ONNX_DIR
from pipeline.fetch_models import WEIGHTS_DIR

CANDIDATE_NAME = "maia3-5m"
CHECKPOINT_PATH = WEIGHTS_DIR / "maia3-5m.pt"
ONNX_PATH = ONNX_DIR / f"{CANDIDATE_NAME}.onnx"

# Maia-3 normalises with RMSNorm, which ONNX only has as a single operator from
# opset 23. torch.onnx writes it out as elementary operations at opset 18,
# which the browser runtime reads.
ONNX_OPSET = 18


def load_reference() -> torch.nn.Module:
    """The Maia-3 5M model exactly as CSSLab's own engine builds and loads it."""
    arguments = parse_args(["--checkpoint", str(CHECKPOINT_PATH), "--device", "cpu"])
    apply_model_config(arguments, resolve_model_spec(CANDIDATE_NAME))
    return load_model(arguments)


class WrittenOutAttention(torch.nn.Module):
    """Computes what torch's MultiheadAttention computes, from the same weights.

    torch.onnx cannot export MultiheadAttention as Maia-3 calls it: it fails
    while breaking the layer into elementary operations. Written out step by
    step, the same calculation exports. Whether it really is the same is not
    assumed here; the conversion check compares the exported file against the
    unmodified reference model.
    """

    def __init__(self, attention: torch.nn.MultiheadAttention):
        super().__init__()
        self.attention = attention

    def forward(self, query, key, value, need_weights=False, attn_mask=None):
        # Maia-3 only uses self-attention, so key and value are the query itself.
        attention = self.attention
        batch_size, square_count, width = query.shape
        head_count = attention.num_heads
        head_width = width // head_count

        projected = F.linear(query, attention.in_proj_weight, attention.in_proj_bias)
        queries, keys, values = projected.chunk(3, dim=-1)
        queries = queries.reshape(batch_size, square_count, head_count, head_width).transpose(1, 2)
        keys = keys.reshape(batch_size, square_count, head_count, head_width).transpose(1, 2)
        values = values.reshape(batch_size, square_count, head_count, head_width).transpose(1, 2)

        scores = queries @ keys.transpose(-2, -1) / math.sqrt(head_width)
        # Maia-3 passes its square-pair bias as the attention mask, one 64x64
        # matrix per head, which torch adds to the scores before the softmax.
        square_pair_bias = attn_mask.reshape(batch_size, head_count, square_count, square_count)
        scores = scores + square_pair_bias
        weights = torch.softmax(scores, dim=-1)

        attended = weights @ values
        attended = attended.transpose(1, 2).reshape(batch_size, square_count, width)
        output = F.linear(attended, attention.out_proj.weight, attention.out_proj.bias)
        return output, None


def exportable_copy(reference: torch.nn.Module) -> torch.nn.Module:
    model = copy.deepcopy(reference)
    for block in model.transformer.layers:
        block.self_attn.mha = WrittenOutAttention(block.self_attn.mha)
    return model


def export(model: torch.nn.Module) -> None:
    # A batch of two example positions, not one: with a single position torch
    # cannot tell the batch dimension apart from a fixed size of one.
    example_tokens = torch.zeros((2, 64, model.cfg.history * 12 + 1))
    example_elos = torch.tensor([1100, 1900], dtype=torch.long)
    batch = torch.export.Dim("batch", min=1, max=1024)

    program = torch.onnx.export(
        model,
        (example_tokens, example_elos, example_elos),
        input_names=["tokens", "self_elo", "oppo_elo"],
        output_names=["policy", "value", "ponder"],
        dynamic_shapes=({0: batch}, {0: batch}, {0: batch}),
        opset_version=ONNX_OPSET,
        dynamo=True,
    )
    program.save(str(ONNX_PATH))


if __name__ == "__main__":
    ONNX_DIR.mkdir(parents=True, exist_ok=True)
    export(exportable_copy(load_reference()))
    print(f"{CANDIDATE_NAME:>12}: {ONNX_PATH}")
