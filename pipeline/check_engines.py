"""Checks that this machine's two Stockfish builds score cached moves exactly as their caches hold them.

Run from the repository root, once Stockfish is installed with
scripts/fetch_stockfish.sh and the caches are in data/analysis:

    python -m pipeline.check_engines

The monthly refresh runs it first, since a hosted runner may land on another
processor each month and a build that scores differently would mix two
measures in one cache. Each engine analyses a fixed sample of its cached
moves again; any difference, or an engine that finds none of its own
analyses in its cache, exits with 1 before anything else runs.
"""

import argparse
import os
import sys
from contextlib import ExitStack

from pipeline.extract_blunder_profile import running_stockfish
from pipeline.refresh_games import BROWSER_DEPTH, BROWSER_ENGINE, DEEP_DEPTH
from pipeline.stockfish_analysis import differences_from_the_cache

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Check both Stockfish builds against their caches.")
    parser.add_argument("--workers", type=int, default=os.cpu_count() // 2 or 1, help="Stockfish processes per engine")
    arguments = parser.parse_args()

    failed = False
    with ExitStack() as stack:
        for depth, engine_path in ((DEEP_DEPTH, None), (BROWSER_DEPTH, BROWSER_ENGINE)):
            if engine_path is None:
                analysers, cache_path = stack.enter_context(running_stockfish(depth, arguments.workers))
            else:
                analysers, cache_path = stack.enter_context(running_stockfish(depth, arguments.workers, engine_path))
            check = differences_from_the_cache(analysers, cache_path)
            name = f"{analysers[0].engine} at depth {depth}"
            if check.differences:
                failed = True
                print(f"{name}: {len(check.differences)} of {check.compared} cached moves scored differently")
                for difference in check.differences[:10]:
                    print(f"    {difference}")
            else:
                print(f"{name}: {check.compared} cached moves analysed again, all as the cache holds them")
    if failed:
        sys.exit(1)
