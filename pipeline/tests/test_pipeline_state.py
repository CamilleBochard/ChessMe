from pipeline.pipeline_state import asset_name, latest_assets, stale_assets


def test_names_each_saved_copy_after_its_file_and_the_run_that_saved_it():
    assert asset_name("stockfish-19-depth-18.jsonl", "2026-11-01-1234") == "stockfish-19-depth-18.jsonl.2026-11-01-1234.gz"


def test_restores_the_latest_copy_of_each_file():
    assets = [
        "stockfish-19-depth-18.jsonl.2026-10-27-1.gz",
        "stockfish-19-depth-18.jsonl.2026-11-01-7.gz",
        "fine-tuned-test.jsonl.2026-10-27-1.gz",
    ]

    assert latest_assets(assets) == {
        "stockfish-19-depth-18.jsonl": "stockfish-19-depth-18.jsonl.2026-11-01-7.gz",
        "fine-tuned-test.jsonl": "fine-tuned-test.jsonl.2026-10-27-1.gz",
    }


def test_deletes_only_the_copies_older_than_those_just_saved():
    assets = [
        "stockfish-19-depth-18.jsonl.2026-10-27-1.gz",
        "stockfish-19-depth-18.jsonl.2026-11-01-7.gz",
        "fine-tuned-test.jsonl.2026-10-27-1.gz",
    ]
    just_saved = ["stockfish-19-depth-18.jsonl.2026-11-01-7.gz"]

    assert stale_assets(assets, just_saved) == ["stockfish-19-depth-18.jsonl.2026-10-27-1.gz"]
