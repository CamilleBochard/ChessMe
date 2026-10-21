"""The positions Camille reached in the games the Bot is built from.

The game page's report counts how many of the Bot's moves led to a position
Camille himself reached, the closest sign that it followed him. Only the
positions right after his own moves count, and only early in a game: past
the fifteenth move a game almost never meets one of his again.

A position is written as the first three fields of its FEN: the board, the
side to move and castling. The move counters differ between move orders,
and the en passant square is written differently by python-chess and by the
page's chess library, so both are left out.
"""

import chess
import chess.pgn


def positions_reached(games: list[chess.pgn.Game], player: str, plies: int) -> list[str]:
    """Each position the player left the board in after one of their moves within the first plies, once, sorted."""
    reached = set()
    for game in games:
        player_is_white = game.headers["White"].lower() == player.lower()
        board = game.board()
        for move in game.mainline_moves():
            if board.ply() >= plies:
                break
            is_players_move = board.turn == player_is_white
            board.push(move)
            if is_players_move:
                reached.add(position_key(board))
    return sorted(reached)


def position_key(board: chess.Board) -> str:
    """The board, the side to move and castling, as the first three fields of the FEN."""
    fields = board.fen().split(" ")
    return " ".join(fields[:3])
