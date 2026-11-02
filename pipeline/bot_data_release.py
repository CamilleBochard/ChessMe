"""Names the next bot-data release from the releases that already exist.

    gh release list --json tagName --jq '.[].tagName' | python3 -m pipeline.bot_data_release

The number follows the highest existing bot-data-N release, including one
marked as not deployed after a rollback. docker/bot-data-release cannot be
used for this: a rollback reverts it to the release the site serves again,
while the release that failed keeps its tag.
"""

import re
import sys

BOT_DATA_TAG = re.compile(r"bot-data-(\d+)")


def next_release(tags: list[str]) -> str:
    """The bot-data release that follows every existing one; other releases are ignored."""
    numbers = []
    for tag in tags:
        match = BOT_DATA_TAG.fullmatch(tag)
        if match:
            numbers.append(int(match.group(1)))
    highest = max(numbers, default=0)
    return f"bot-data-{highest + 1}"


def main() -> None:
    tags = sys.stdin.read().split()
    print(next_release(tags))


if __name__ == "__main__":
    main()
